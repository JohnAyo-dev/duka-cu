const http = require('node:http');
const zlib = require('node:zlib');
const { randomUUID, randomBytes, scryptSync, createHash, timingSafeEqual } = require('node:crypto');
const store = require('./store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_BODY_BYTES = 100_000;
// Responses smaller than this are sent as-is; compression only pays off above it.
const COMPRESS_MIN_BYTES = Number(process.env.COMPRESS_MIN_BYTES || 512);
const CATEGORIES = new Set(['electronics', 'hostel', 'audio', 'photography', 'food', 'books', 'fashion', 'beauty']);
// Verified student identity: registration requires this email domain.
const EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'stu.cu.edu.ng';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
// Dev placeholder: when set to true, the x-user-id header is again accepted as
// identity so pages keep working during the auth migration. Real authentication
// (Bearer session tokens) is enforced whenever this is not enabled.
const ALLOW_DEV_HEADER = process.env.ALLOW_DEV_HEADER === 'true';

// Picks the strongest encoding the client accepts with q > 0, preferring
// brotli over gzip over deflate. Returns null when nothing should be used.
function pickEncoding(acceptEncoding) {
  const raw = String(acceptEncoding || '').toLowerCase();
  if (!raw) return null;
  const parsed = raw.split(',').map(piece => {
    const segments = piece.trim().split(';');
    const name = segments[0].trim();
    let q = 1;
    for (const segment of segments.slice(1)) {
      const [key, value] = segment.trim().split('=');
      if (key === 'q') q = Math.min(1, Math.max(0, Number(value) || 0));
    }
    return { name, q };
  });
  const ORDER = { br: 3, gzip: 2, deflate: 1 };
  const specific = parsed.filter(e => e.q > 0 && ORDER[e.name]).sort((a, b) => (b.q * ORDER[b.name]) - (a.q * ORDER[a.name]));
  if (specific.length) return specific[0].name;
  if (parsed.some(e => e.name === '*' && e.q > 0)) return 'br';
  return null;
}

// Synchronous zlib is fine here: the API payloads are small JSON documents, so
// keeping send() synchronous preserves the response ordering guarantees.
function compress(payload, encoding) {
  const input = Buffer.from(payload, 'utf8');
  if (encoding === 'br') return zlib.brotliCompressSync(input, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  if (encoding === 'gzip') return zlib.gzipSync(input, { level: 6 });
  return zlib.deflateSync(input, { level: 6 });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  const noBody = status === 204 || status === 304;
  const headers = {
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'content-type, x-user-id, authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    vary: 'Origin'
  };
  let out;
  if (!noBody) {
    const raw = Buffer.byteLength(json);
    const accepted = raw >= COMPRESS_MIN_BYTES ? pickEncoding(res.__acceptEncoding) : null;
    if (accepted) {
      try {
        const compressed = compress(json, accepted);
        if (compressed.length < raw) {
          out = compressed;
          headers['content-encoding'] = accepted;
          headers.vary = 'Origin, accept-encoding';
        }
      } catch { /* fall through to the uncompressed body below */ }
    }
    if (!out) out = Buffer.from(json, 'utf8');
    headers['content-type'] = 'application/json; charset=utf-8';
    headers['content-length'] = out.length;
  }
  res.writeHead(status, headers);
  res.end(out);
}
function error(res, status, message) { send(res, status, { error: { message } }); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY_BYTES) throw new Error('Request body is too large.'); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { const e = new Error('Request body must be valid JSON.'); e.status = 400; throw e; }
}
function listingInput(value) {
  const title = String(value.title || '').trim();
  const description = String(value.description || '').trim();
  const price = Number(value.price);
  if (title.length < 3 || title.length > 120) throw new Error('Title must be 3 to 120 characters.');
  if (description.length < 10 || description.length > 2000) throw new Error('Description must be 10 to 2000 characters.');
  if (!CATEGORIES.has(value.category)) throw new Error('Choose a valid category.');
  if (!Number.isInteger(price) || price < 1) throw new Error('Price must be a whole number of naira.');
  if (!['duka', 'self'].includes(value.delivery)) throw new Error('Delivery must be duka or self.');
  const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=500&auto=format&fit=crop&q=60';
  const MAX_LISTING_IMAGES = 6;
  const isWebUrl = src => typeof src === 'string' && /^https?:\/\//i.test(src);
  const rawImages = Array.isArray(value.images) && value.images.length ? value.images : [value.image];
  const images = rawImages.filter(isWebUrl).map(src => src.slice(0, 2000)).slice(0, MAX_LISTING_IMAGES);
  const image = images[0] || DEFAULT_IMAGE;
  return { title, description, price, category: value.category, delivery: value.delivery, condition: String(value.condition || 'Not specified').trim().slice(0, 80), sellerName: String(value.sellerName || 'Campus seller').trim().slice(0, 80), sellerLevel: String(value.sellerLevel || '').trim().slice(0, 40), phone: String(value.phone || '').trim().slice(0, 40), snap: String(value.snap || '').trim().slice(0, 80), email: String(value.email || '').trim().slice(0, 160), images: images.length ? images : [image], image, verified: false, sold: 0 };
}
function cartFor(data, id) { return data.carts[id] || { userId: id, items: [], updatedAt: null }; }
function orderTotal(items) { return items.reduce((total, item) => total + item.price * item.quantity, 0); }

// ---------- authentication helpers ----------
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  try {
    const candidate = scryptSync(password, record.salt, 64);
    const expected = Buffer.from(record.hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}
function sessionDigest(token) { return createHash('sha256').update(token).digest('hex'); }
function newSession(userId) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  return {
    token,
    session: { userId, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_DAYS * 864e5).toISOString() }
  };
}
function publicUser(user) { const { password, ...rest } = user; return rest; }

// Resolves the caller's identity. Prefers a valid Bearer session token; falls
// back to the x-user-id header only when ALLOW_DEV_HEADER is explicitly true.
// Sends a 401 response and returns null when no identity is available.
async function authenticate(req, res) {
  const header = String(req.headers['authorization'] || '');
  const match = header.match(/^Bearer\s+([a-f0-9]+)$/i);
  if (match) {
    const data = await store.read();
    const session = data.sessions[sessionDigest(match[1])];
    if (session) {
      if (new Date(session.expiresAt).getTime() <= Date.now()) return error(res, 401, 'Session expired. Sign in again.'), null;
      const user = data.users.find(u => u.id === session.userId);
      if (user) return { user: publicUser(user) };
      return error(res, 401, 'That account no longer exists.'), null;
    }
  }
  if (ALLOW_DEV_HEADER) {
    const devId = String(req.headers['x-user-id'] || '').trim();
    if (devId) return { user: { id: devId, name: 'Dev user', email: `${devId}@${EMAIL_DOMAIN}` }, dev: true };
  }
  return error(res, 401, 'Sign in to continue.'), null;
}

async function handler(req, res) {
  res.__acceptEncoding = req.headers['accept-encoding'];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/api/v1/health') return send(res, 200, { status: 'ok', service: 'duka-cu-api' });

    // ---------- authentication ----------
    if (req.method === 'POST' && path === '/api/v1/auth/register') {
      const input = await body(req);
      const name = String(input.name || '').trim();
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (name.length < 2 || name.length > 120) return error(res, 400, 'Name must be 2 to 120 characters.');
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || !email.endsWith(`@${EMAIL_DOMAIN}`)) return error(res, 400, `Use a ${EMAIL_DOMAIN} school email.`);
      if (password.length < 8 || password.length > 128) return error(res, 400, 'Password must be 8 to 128 characters.');
      let user; let token;
      await store.update(data => {
        if (data.users.some(u => u.email === email)) throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
        user = { id: randomUUID(), name, email, verified: false, password: hashPassword(password), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        data.users.push(user);
        const created = newSession(user.id);
        token = created.token;
        data.sessions[sessionDigest(created.token)] = created.session;
      });
      return send(res, 201, { data: { user: publicUser(user), token } });
    }
    if (req.method === 'POST' && path === '/api/v1/auth/login') {
      const input = await body(req);
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      const result = await store.update(data => {
        const user = data.users.find(u => u.email === email);
        if (!user || !verifyPassword(password, user.password)) throw new Error('Email or password is incorrect.');
        const created = newSession(user.id);
        data.sessions[sessionDigest(created.token)] = created.session;
        return { user: publicUser(user), token: created.token };
      });
      return send(res, 200, { data: result });
    }
    if (req.method === 'POST' && path === '/api/v1/auth/logout') {
      const header = String(req.headers['authorization'] || '');
      const match = header.match(/^Bearer\s+([a-f0-9]+)$/i);
      if (match) await store.update(data => { delete data.sessions[sessionDigest(match[1])]; });
      return send(res, 204, {});
    }
    if (req.method === 'GET' && path === '/api/v1/auth/me') {
      const auth = await authenticate(req, res); if (!auth) return;
      return send(res, 200, { data: { user: auth.user, dev: auth.dev === true } });
    }

    // ---------- listings ----------
    if (req.method === 'GET' && path === '/api/v1/listings') {
      const data = await store.read(); let listings = data.listings.filter(x => x.status === 'active');
      const q = (url.searchParams.get('q') || '').toLowerCase(); const category = url.searchParams.get('category');
      if (q) listings = listings.filter(x => `${x.title} ${x.description}`.toLowerCase().includes(q));
      if (category) listings = listings.filter(x => x.category === category);
      return send(res, 200, { data: listings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }
    const listingMatch = path.match(/^\/api\/v1\/listings\/([^/]+)$/);
    if (req.method === 'GET' && listingMatch) { const data = await store.read(); const item = data.listings.find(x => x.id === listingMatch[1]); return item ? send(res, 200, { data: item }) : error(res, 404, 'Listing not found.'); }
    if (req.method === 'POST' && path === '/api/v1/listings') {
      const auth = await authenticate(req, res); if (!auth) return;
      const input = listingInput(await body(req)); const now = new Date().toISOString();
      const item = { id: randomUUID(), sellerId: auth.user.id, ...input, status: 'active', createdAt: now, updatedAt: now };
      await store.update(data => { data.listings.push(item); }); return send(res, 201, { data: item });
    }
    if (listingMatch && ['PATCH', 'DELETE'].includes(req.method)) {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id;
      return store.update(async data => {
        const item = data.listings.find(x => x.id === listingMatch[1]); if (!item) return error(res, 404, 'Listing not found.');
        if (item.sellerId !== id) return error(res, 403, 'You do not own this listing.');
        if (req.method === 'DELETE') { item.status = 'deleted'; item.updatedAt = new Date().toISOString(); return send(res, 204, {}); }
        Object.assign(item, listingInput({ ...item, ...(await body(req)) }), { updatedAt: new Date().toISOString() }); return send(res, 200, { data: item });
      });
    }
    if (path === '/api/v1/cart') {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id;
      if (req.method === 'GET') { const data = await store.read(); const cart = cartFor(data, id); return send(res, 200, { data: { ...cart, total: orderTotal(cart.items) } }); }
      if (req.method === 'POST') {
        const input = await body(req); const quantity = Number(input.quantity || 1); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return error(res, 400, 'Quantity must be between 1 and 20.');
        let result;
        await store.update(data => { const listing = data.listings.find(x => x.id === input.listingId && x.status === 'active'); if (!listing) throw Object.assign(new Error('Active listing not found.'), { status: 404 }); const cart = cartFor(data, id); const existing = cart.items.find(x => x.listingId === listing.id); if (existing) existing.quantity = Math.min(20, existing.quantity + quantity); else cart.items.push({ listingId: listing.id, title: listing.title, price: listing.price, quantity }); cart.updatedAt = new Date().toISOString(); data.carts[id] = cart; result = { ...cart, total: orderTotal(cart.items) }; });
        return send(res, 200, { data: result });
      }
    }
    const cartItem = path.match(/^\/api\/v1\/cart\/([^/]+)$/);
    if (req.method === 'DELETE' && cartItem) { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; return store.update(data => { const cart = cartFor(data, id); cart.items = cart.items.filter(x => x.listingId !== cartItem[1]); cart.updatedAt = new Date().toISOString(); data.carts[id] = cart; return send(res, 200, { data: { ...cart, total: orderTotal(cart.items) } }); }); }
    if (req.method === 'POST' && path === '/api/v1/orders') { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; let order; await store.update(data => { const cart = cartFor(data, id); if (!cart.items.length) throw new Error('Cart is empty.'); order = { id: randomUUID(), buyerId: id, items: cart.items, subtotal: orderTotal(cart.items), status: 'pending_payment', createdAt: new Date().toISOString() }; data.orders.push(order); data.carts[id] = { userId: id, items: [], updatedAt: new Date().toISOString() }; }); return send(res, 201, { data: order }); }
    if (req.method === 'GET' && path === '/api/v1/orders') { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; const data = await store.read(); return send(res, 200, { data: data.orders.filter(x => x.buyerId === id) }); }
    if (req.method === 'POST' && path === '/api/v1/conversations') { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; const input = await body(req); return store.update(data => { const listing = data.listings.find(x => x.id === input.listingId && x.status === 'active'); if (!listing) return error(res, 404, 'Active listing not found.'); if (listing.sellerId === id) return error(res, 400, 'You cannot message your own listing.'); let convo = data.conversations.find(x => x.listingId === listing.id && x.participants.includes(id)); if (!convo) { convo = { id: randomUUID(), listingId: listing.id, participants: [id, listing.sellerId], messages: [], updatedAt: new Date().toISOString() }; data.conversations.push(convo); } return send(res, 200, { data: convo }); }); }
    const messageMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/);
    if (req.method === 'POST' && messageMatch) { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; const input = await body(req); const text = String(input.text || '').trim(); if (!text || text.length > 2000) return error(res, 400, 'Message must be 1 to 2000 characters.'); return store.update(data => { const convo = data.conversations.find(x => x.id === messageMatch[1]); if (!convo) return error(res, 404, 'Conversation not found.'); if (!convo.participants.includes(id)) return error(res, 403, 'You are not in this conversation.'); const message = { id: randomUUID(), senderId: id, text, createdAt: new Date().toISOString() }; convo.messages.push(message); convo.updatedAt = message.createdAt; return send(res, 201, { data: message }); }); }
    if (req.method === 'GET' && path === '/api/v1/conversations') { const auth = await authenticate(req, res); if (!auth) return; const id = auth.user.id; const data = await store.read(); return send(res, 200, { data: data.conversations.filter(x => x.participants.includes(id)) }); }
    return error(res, 404, 'Route not found.');
  } catch (err) { return error(res, err.status || 400, err.message || 'Bad request.'); }
}

function createServer() { return http.createServer(handler); }
if (require.main === module) createServer().listen(PORT, HOST, () => console.log(`Duka API listening on http://${HOST}:${PORT}`));
module.exports = { createServer };