const http = require('node:http');
const zlib = require('node:zlib');
const { randomUUID, randomBytes, scryptSync, createHash, createHmac, timingSafeEqual, sign } = require('node:crypto');
require('./env');
const store = require('./store');

const PORT = Number(process.env.PORT || 3000);
// Hosting platforms (Render, Railway, Fly...) hand the app a PORT and expect it
// to listen on all interfaces; on a laptop the safer localhost-only default stays.
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
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
// Public base URL of this API. OAuth redirect URIs are derived from it, so a
// provider only ever receives a callback this server can actually serve.
// "localhost" rather than 127.0.0.1: Google's console refuses raw IP addresses as redirect URIs.
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
// Where the frontend lives. Used to send the browser back after a provider
// redirects, since this API never renders pages itself.
// The site is served by this same process, so by default the app lives at the same address as the API.
const APP_URL = (process.env.APP_URL || PUBLIC_URL).replace(/\/+$/, '');

// ===== OAuth providers =====
// Every provider needs credentials registered with that provider before it can
// do anything. Until then the endpoint reports `configured: false` and refuses
// to start a flow, rather than faking a sign-in that never really happened.
//
// A provider is only "configured" when it has both a client id and a secret.
// Apple additionally needs the three extra values used to mint its JWT.
const OAUTH_PROVIDERS = {
  google: {
    label: 'Google',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ''; },
    scope: 'openid email profile',
    authorizeUrl: process.env.GOOGLE_AUTHORIZE_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    userinfoUrl: process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
    extra() { return { access_type: 'online', prompt: 'select_account' }; }
  },
  apple: {
    label: 'Apple',
    // Apple has no userinfo endpoint. The identity arrives inside a signed
    // id_token in the token response, and the token request itself has to be
    // authenticated with a client secret this server mints on the spot.
    clientId: process.env.APPLE_SERVICE_ID || '',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKey: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientSecret() { return mintAppleSecret(this); },
    scope: 'name email',
    authorizeUrl: process.env.APPLE_AUTHORIZE_URL || 'https://appleid.apple.com/auth/authorize',
    tokenUrl: process.env.APPLE_TOKEN_URL || 'https://appleid.apple.com/auth/token',
    extra() { return { response_mode: 'form_post' }; }
  },
  facebook: {
    label: 'Facebook',
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret() { return process.env.FACEBOOK_CLIENT_SECRET || ''; },
    scope: 'email public_profile',
    authorizeUrl: process.env.FACEBOOK_AUTHORIZE_URL || 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: process.env.FACEBOOK_TOKEN_URL || 'https://graph.facebook.com/v21.0/oauth/access_token',
    userinfoUrl: process.env.FACEBOOK_USERINFO_URL || 'https://graph.facebook.com/me?fields=id,name,email',
    extra() { return {}; }
  }
};

// Which credential sets a provider still needs before it will work. Reported
// to the frontend so the UI can say something more useful than "failed".
const OAUTH_MISSING = {
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  apple: ['APPLE_SERVICE_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
  facebook: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET']
};

function oauthConfigured(name) {
  const p = OAUTH_PROVIDERS[name];
  if (!p) return false;
  if (name === 'apple') return Boolean(p.clientId && p.teamId && p.keyId && p.privateKey);
  return Boolean(p.clientId && p.clientSecret());
}
function oauthMissing(name) { return (OAUTH_MISSING[name] || []).filter(k => !process.env[k]); }
function oauthRedirectUri(name) { return `${PUBLIC_URL}/api/v1/auth/oauth/${name}/callback`; }

// Apple requires the client secret to be a freshly signed ES256 JWT rather
// than a stored string. Apple rejects one older than six months, so it is
// minted per request and expires in five minutes.
function mintAppleSecret(provider) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: provider.keyId })}.${b64({
    iss: provider.teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: provider.clientId
  })}`;
  // JWS wants a raw r||s signature, which is what ieee-p1363 produces; the
  // default PKCS#1 form is rejected by Apple.
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: provider.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

// Reads the claims of a JWT without verifying the signature. Sound here only
// because the token came straight from the provider's own token endpoint over
// TLS, never from the browser — the callback would otherwise accept any
// well-formed string as an identity.
function jwtClaims(token) {
  try {
    const part = String(token || '').split('.')[1];
    return part ? JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) : null;
  } catch { return null; }
}

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

function send(res, status, body, extraHeaders) {
  const json = JSON.stringify(body);
  const noBody = status === 204 || status === 304;
  const headers = {
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'content-type, x-user-id, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    vary: 'Origin',
    ...(extraHeaders || {})
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
// OAuth callbacks are browser navigations, not API calls, so they end in a
// redirect back to the app. The URL is always a fixed prefix plus something we
// encode ourselves, never a raw value echoed from the provider.
function redirect(res, location) {
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
}
// Reduces a caller-supplied destination to a bare page name, so the value can
// be put back in a URL without becoming an open redirect.
function pageName(value) {
  const name = String(value || '').replace(/^.*\//, '').replace(/[?#].*$/, '');
  return /^[A-Za-z0-9_-]+\.html$/.test(name) ? name : null;
}
function loginUrl(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `${APP_URL}/login.html?${query}`;
}
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
// One username rule for the whole API, so an account created at registration
// and one renamed later cannot end up with differently shaped handles.
function normaliseUsername(value) {
  const username = String(value == null ? '' : value).trim().toLowerCase();
  if (!username) return '';
  if (!/^[a-z0-9._]{3,40}$/.test(username)) {
    throw Object.assign(new Error('Username must be 3 to 40 characters: letters, numbers, dots or underscores.'), { status: 400 });
  }
  return username;
}
function newSession(userId) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  return {
    token,
    session: { userId, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_DAYS * 864e5).toISOString() }
  };
}
function publicUser(user) { const { password, ...rest } = user; return rest; }

// ===== Roles, delivery, audit, admin, rate limiting =====
const ROLES = new Set(['buyer', 'seller']);
function cleanRole(value) { const role = String(value || '').trim().toLowerCase(); return ROLES.has(role) ? role : ''; }

// Delivery fees are worked out here, never trusted from the browser. They are
// flat per order and per class of goods, and only apply to listings the seller
// marked for Duka delivery (a self-pickup listing costs nothing to collect):
// N500 when the order has food delivered, N2500 when it has anything else
// delivered. The cart page mirrors this rule so the buyer sees the same total.
const DELIVERY_FEES = { food: 500, other: 2500 };
function deliveryFeeFor(items) {
  const delivered = items.filter(item => item.delivery === 'duka');
  let fee = 0;
  if (delivered.some(item => item.category === 'food')) fee += DELIVERY_FEES.food;
  if (delivered.some(item => item.category !== 'food')) fee += DELIVERY_FEES.other;
  return fee;
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }

// Builds an order from listing ids and quantities. Prices, categories and
// delivery modes are read from the store, so a client cannot underpay by
// sending its own numbers.
function buildOrder(data, buyerId, lines) {
  if (!Array.isArray(lines) || !lines.length) throw httpError(400, 'Cart is empty.');
  if (lines.length > 50) throw httpError(400, 'An order can hold at most 50 different listings.');
  const merged = new Map();
  for (const line of lines) {
    const quantity = Number(line.quantity == null ? 1 : line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw httpError(400, 'Quantity must be between 1 and 20.');
    const listingId = String(line.listingId || '');
    merged.set(listingId, Math.min(20, (merged.get(listingId) || 0) + quantity));
  }
  const items = [...merged].map(([listingId, quantity]) => {
    const listing = data.listings.find(x => x.id === listingId && x.status === 'active');
    if (!listing) throw httpError(404, 'One of those listings is no longer available.');
    if (listing.sellerId === buyerId) throw httpError(400, 'You cannot order your own listing.');
    return { listingId: listing.id, title: listing.title, price: listing.price, quantity, category: listing.category, delivery: listing.delivery, sellerId: listing.sellerId };
  });
  const subtotal = orderTotal(items);
  const deliveryFee = deliveryFeeFor(items);
  const id = randomUUID();
  return { id, buyerId, items, subtotal, deliveryFee, total: subtotal + deliveryFee, currency: 'NGN', status: 'pending_payment', paymentReference: id, createdAt: new Date().toISOString() };
}

// Append-only trail of things that matter (orders, payments, reports,
// deletions). Capped so the dev store cannot grow without bound.
const AUDIT_LIMIT = 5000;
function audit(data, actorId, action, detail) {
  (data.audit ||= []).push({ at: new Date().toISOString(), actorId: actorId || null, action, ...(detail || {}) });
  if (data.audit.length > AUDIT_LIMIT) data.audit.splice(0, data.audit.length - AUDIT_LIMIT);
}

// Admins are named by email in ADMIN_EMAILS (comma separated). There is no
// admin UI yet; this only gates the few endpoints that need a human decision.
function isAdmin(user) {
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && list.includes(String(user.email || '').toLowerCase()));
}

// Sliding-window limiter, in memory. Fine for one process; a multi-instance
// deploy needs a shared store (Redis) instead.
function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) || []).filter(time => now - time < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) }; }
      recent.push(now); hits.set(key, recent);
      return { ok: true, retryAfter: 0 };
    },
    sweep(now = Date.now()) { for (const [key, list] of hits) if (!list.some(time => now - time < windowMs)) hits.delete(key); }
  };
}
const authLimiter = createRateLimiter({ limit: Number(process.env.RATE_LIMIT_AUTH_PER_MIN || 20), windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: Number(process.env.RATE_LIMIT_WRITE_PER_MIN || 120), windowMs: 60_000 });
setInterval(() => { authLimiter.sweep(); writeLimiter.sweep(); }, 60_000).unref();
function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') { const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (forwarded) return forwarded; }
  return req.socket && req.socket.remoteAddress || 'unknown';
}
// One JSON line per request, easy to ship to any log tool. The query string is
// left out on purpose: OAuth callbacks carry one-time codes in it.
const LOG_REQUESTS = process.env.LOG_REQUESTS !== 'false';

async function rawBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY_BYTES) throw httpError(413, 'Request body is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8'); const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
function cleanText(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }

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

// Like authenticate(), but for endpoints that also work signed out: returns the
// user when a valid session is presented and null otherwise, never a 401.
async function softAuthenticate(req) {
  const match = String(req.headers['authorization'] || '').match(/^Bearer\s+([a-f0-9]+)$/i);
  if (!match) return null;
  const data = await store.read();
  const session = data.sessions[sessionDigest(match[1])];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = data.users.find(u => u.id === session.userId);
  return user ? publicUser(user) : null;
}

const PAYMENT_METHODS = new Set(['paystack-titan', 'monnify']);
const THEMES = new Set(['system', 'light', 'dark']);
function defaultPreferences() {
  return { theme: 'system', privacy: { saveSearchHistory: true, showEmailOnListings: true }, payment: { preferred: 'paystack-titan' } };
}
// Folds `input` into `base`, keeping only known keys of the right type. With
// `strict`, a wrong type is a 400 instead of being silently dropped.
function mergePreferences(base, input, strict) {
  const out = { theme: base.theme, privacy: { ...base.privacy }, payment: { ...base.payment } };
  if (!input || typeof input !== 'object') return out;
  const bad = what => { if (strict) throw httpError(400, `Invalid value for ${what}.`); };
  if (input.theme !== undefined) { if (THEMES.has(input.theme)) out.theme = input.theme; else bad('theme'); }
  if (input.privacy && typeof input.privacy === 'object') {
    for (const key of Object.keys(out.privacy)) {
      if (input.privacy[key] === undefined) continue;
      if (typeof input.privacy[key] === 'boolean') out.privacy[key] = input.privacy[key]; else bad(`privacy.${key}`);
    }
  }
  if (input.payment && input.payment.preferred !== undefined) {
    if (PAYMENT_METHODS.has(input.payment.preferred)) out.payment.preferred = input.payment.preferred; else bad('payment.preferred');
  }
  return out;
}
function cleanBudget(input) {
  const income = Number(input && input.income == null ? 0 : input && input.income);
  if (!Number.isFinite(income) || income < 0 || income > 1e10) throw httpError(400, 'Income must be a positive amount.');
  const list = Array.isArray(input && input.expenses) ? input.expenses : [];
  if (list.length > 200) throw httpError(400, 'A budget can hold at most 200 expenses.');
  const expenses = list.map(e => {
    const amount = Number(e && e.amount); const name = cleanText(e && e.name, 80);
    if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 1e10) throw httpError(400, 'Each expense needs a name and an amount above zero.');
    return { name, amount, category: cleanText(e.category, 40) || 'Other' };
  });
  return { income, expenses, updatedAt: new Date().toISOString() };
}
// The list view of a conversation: who is in it, the last line, and how many
// messages from the other person this user has not opened yet.
function conversationSummary(convo, userId) {
  const readAt = (convo.reads && convo.reads[userId]) || '';
  const unread = convo.messages.filter(m => m.senderId !== userId && String(m.createdAt) > readAt).length;
  const last = convo.messages[convo.messages.length - 1] || null;
  const { messages, reads, ...rest } = convo;
  return { ...rest, unread, messageCount: messages.length, lastMessage: last ? { senderId: last.senderId, text: last.text.length > 120 ? last.text.slice(0, 117) + '...' : last.text, createdAt: last.createdAt } : null };
}

// ===== Static site =====
// Serving the pages from the same process means `npm start` is the whole dev
// setup: one address, no CORS, and no editor "live reload" watching the data
// file this server writes to. Only the site itself is reachable: top-level
// .html pages plus css/ and js/. The backend folder, .env, .git and the
// markdown notes are never served.
const fsSync = require('node:fs');
const nodePath = require('node:path');
const SITE_ROOT = nodePath.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel === '/') rel = '/index.html';
  if (rel.includes('\0') || rel.includes('..') || rel.includes('\\')) return false;
  const parts = rel.split('/').filter(Boolean);
  const allowed = parts.length === 1 ? rel.endsWith('.html') : ['css', 'js', 'assets'].includes(parts[0]);
  if (!allowed) return false;
  const file = nodePath.join(SITE_ROOT, ...parts);
  if (!file.startsWith(SITE_ROOT + nodePath.sep)) return false;
  const type = MIME[nodePath.extname(file).toLowerCase()];
  if (!type) return false;
  let content;
  try { content = fsSync.readFileSync(file); } catch { return false; }
  res.writeHead(200, { 'content-type': type, 'content-length': content.length, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}

async function handler(req, res) {
  res.__acceptEncoding = req.headers['accept-encoding'];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const ip = clientIp(req);
  if (!path.startsWith('/api/') && serveStatic(req, res, path)) return;
  if (LOG_REQUESTS) {
    const started = Date.now();
    res.on('finish', () => console.log(JSON.stringify({ time: new Date().toISOString(), level: 'info', method: req.method, path, status: res.statusCode, ms: Date.now() - started, ip })));
  }
  // Abuse protection. Sign-in and registration get the tighter limit, since
  // they are what password guessing and account spam go through. Payment
  // webhooks are exempt: they come from the provider and are signature-checked.
  if (req.method !== 'GET' && !path.startsWith('/api/v1/webhooks/')) {
    const isAuth = /^\/api\/v1\/auth\/(register|login|oauth\/)/.test(path);
    const verdict = (isAuth ? authLimiter : writeLimiter).check(`${isAuth ? 'a' : 'w'}:${ip}`);
    if (!verdict.ok) return send(res, 429, { error: { message: `Too many requests. Try again in ${verdict.retryAfter} seconds.` } }, { 'retry-after': String(verdict.retryAfter) });
  }
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
      const username = normaliseUsername(input.username);
      const role = cleanRole(input.role);
      let user; let token;
      await store.update(data => {
        if (data.users.some(u => u.email === email)) throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
        if (username && data.users.some(u => String(u.username || '').toLowerCase() === username)) throw Object.assign(new Error('That username is already taken.'), { status: 409 });
        user = { id: randomUUID(), name, email, verified: false, password: hashPassword(password), ...(username ? { username } : {}), ...(role ? { role } : {}), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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

    // ---------- OAuth (Google / Apple / Facebook) ----------
    // Reports which providers have real credentials behind them. The frontend
    // uses this to label the buttons honestly instead of failing on click.
    if (req.method === 'GET' && path === '/api/v1/auth/providers') {
      return send(res, 200, { data: { providers: Object.keys(OAUTH_PROVIDERS).map(name => ({
        name,
        label: OAUTH_PROVIDERS[name].label,
        configured: oauthConfigured(name),
        missing: oauthMissing(name)
      })) } });
    }

    const oauthStart = path.match(/^\/api\/v1\/auth\/oauth\/([a-z]+)\/start$/);
    if (req.method === 'POST' && oauthStart) {
      const name = oauthStart[1];
      const provider = OAUTH_PROVIDERS[name];
      if (!provider) return error(res, 404, 'Unknown sign-in provider.');
      if (!oauthConfigured(name)) {
        return error(res, 501, `${provider.label} sign-in is not configured on this server. Add ${oauthMissing(name).join(' and ')} to the environment, then restart.`);
      }
      const input = await body(req);
      // Round-trip the user's own destination through state so login can send
      // them back where they were headed. It is not a security boundary.
      const next = String(input.next || '').startsWith(APP_URL) ? String(input.next) : `${APP_URL}/index.html`;
      const state = Buffer.from(JSON.stringify({ next, role: cleanRole(input.role), n: randomBytes(12).toString('hex') })).toString('base64url');
      await store.update(data => { (data.oauthStates ||= {})[state] = new Date(Date.now() + 10 * 60e3).toISOString(); });
      const params = new URLSearchParams({
        client_id: provider.clientId, redirect_uri: oauthRedirectUri(name), response_type: 'code',
        scope: provider.scope, state, ...provider.extra()
      });
      return send(res, 200, { data: { authorizeUrl: `${provider.authorizeUrl}?${params}` } });
    }

    const oauthCallback = path.match(/^\/api\/v1\/auth\/oauth\/([a-z]+)\/callback$/);
    if (oauthCallback && (req.method === 'GET' || req.method === 'POST')) {
      const name = oauthCallback[1];
      const provider = OAUTH_PROVIDERS[name];
      if (!provider) return error(res, 404, 'Unknown sign-in provider.');
      if (!oauthConfigured(name)) return error(res, 501, `${provider.label} sign-in is not configured on this server.`);

      // Apple answers with response_mode=form_post, so its params arrive in a
      // form body rather than the query string.
      const form = req.method === 'POST' ? new URLSearchParams((await rawBody(req).catch(() => Buffer.alloc(0))).toString('utf8')) : url.searchParams;
      if (form.get('error')) {
        return redirect(res, loginUrl({ oauth_error: form.get('error_description') || form.get('error') }));
      }
      const code = form.get('code'); const state = form.get('state');
      if (!code || !state) return error(res, 400, 'Provider did not return an authorization code.');

      // Single-use state, expiring after 10 minutes. It also carries the page
      // the visitor was originally heading to, so the round trip through the
      // provider does not dump everyone on the homepage.
      const okState = await store.update(data => {
        const exp = (data.oauthStates || {})[state];
        delete (data.oauthStates || {})[state];
        if (!exp || new Date(exp).getTime() <= Date.now()) return null;
        return JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      });
      if (!okState) return error(res, 400, 'Sign-in attempt expired. Please try again.');
      const next = pageName(okState.next) || 'index.html';

      // Exchange the code for an access token, then read the identity.
      const tokenRes = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code,
          redirect_uri: oauthRedirectUri(name), client_id: provider.clientId,
          client_secret: provider.clientSecret()
        })
      });
      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenBody.access_token) {
        return redirect(res, loginUrl({ oauth_error: 'Could not complete sign-in with the provider.', next }));
      }

      // Google and Facebook publish a userinfo document. Apple does not, so
      // its identity is read from the claims of the id_token in the response
      // above, and only when the audience is this app.
      let identity = {};
      if (provider.userinfoUrl) {
        const infoRes = await fetch(provider.userinfoUrl, { headers: { authorization: `Bearer ${tokenBody.access_token}`, accept: 'application/json' } });
        identity = await infoRes.json().catch(() => ({}));
      } else {
        const claims = jwtClaims(tokenBody.id_token);
        identity = claims && claims.aud === provider.clientId ? claims : {};
      }
      const email = String(identity.email || '').trim().toLowerCase();
      if (!email) return redirect(res, loginUrl({ oauth_error: 'The provider did not share an email address.', next }));
      // Apple only ever sends a name the very first time an account authorises,
      // so the email is the fallback every later sign-in lands on.
      const displayName = String(identity.name || identity.given_name || email.split('@')[0]).trim().slice(0, 120);

      // NOTE: a provider account is not a @stu.cu.edu.ng address, so the school
      // email rule that guards password registration is deliberately skipped
      // here. That is the trade-off of federated sign-in — decide whether you
      // want that before turning a provider on.
      const oneTime = randomBytes(24).toString('hex');
      const result = await store.update(data => {
        let user = data.users.find(u => u.email === email);
        if (user) {
          user.lastLoginAt = new Date().toISOString();
          (user.providers ||= []); if (!user.providers.includes(name)) user.providers.push(name);
        } else {
          user = { id: randomUUID(), name: displayName, email, verified: false, providers: [name], ...(cleanRole(okState.role) ? { role: cleanRole(okState.role) } : {}),
            joinedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          data.users.push(user);
        }
        const created = newSession(user.id);
        data.sessions[sessionDigest(created.token)] = created.session;
        // The bearer token is never put in a URL. The browser gets a
        // single-use code instead and swaps it for the real token over POST.
        (data.oauthCodes ||= {})[sessionDigest(oneTime)] = { userId: user.id, expiresAt: new Date(Date.now() + 2 * 60e3).toISOString() };
        return { oneTime };
      });
      return redirect(res, loginUrl({ oauth_code: result.oneTime, next }));
    }

    // Swaps a one-time OAuth code for a real bearer token.
    if (req.method === 'POST' && path === '/api/v1/auth/oauth/exchange') {
      const input = await body(req);
      const code = String(input.code || '').trim();
      if (!code) return error(res, 400, 'Missing sign-in code.');
      const out = await store.update(data => {
        const entry = (data.oauthCodes || {})[sessionDigest(code)];
        if (!entry) return null;
        delete (data.oauthCodes || {})[sessionDigest(code)];
        if (new Date(entry.expiresAt).getTime() <= Date.now()) return null;
        const user = data.users.find(u => u.id === entry.userId);
        if (!user) return null;
        const created = newSession(user.id);
        data.sessions[sessionDigest(created.token)] = created.session;
        return { user: publicUser(user), token: created.token };
      });
      if (!out) return error(res, 400, 'That sign-in code has expired. Please try again.');
      return send(res, 200, { data: out });
    }

    // ---------- the signed-in profile ----------
    // One call returns everything the profile page renders. Every number is
    // counted from the store, so a new account genuinely reads 0 rather than
    // being seeded with believable-looking activity.
    if (req.method === 'GET' && path === '/api/v1/me/profile') {
      const auth = await authenticate(req, res); if (!auth) return;
      if (auth.dev) return error(res, 400, 'Sign in with a real account to view your profile.');
      const id = auth.user.id;
      const data = await store.read();
      const myListings = data.listings.filter(x => x.sellerId === id && x.status === 'active');
      // Only orders that were actually paid count as buying; a draft that was
      // never paid for is not a purchase.
      const myOrders = data.orders.filter(x => x.buyerId === id && x.status === 'paid').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const soldUnits = myListings.reduce((sum, x) => sum + (Number(x.sold) || 0), 0);
      const spend = myOrders.reduce((sum, o) => sum + (Number(o.total ?? o.subtotal) || 0), 0);
      return send(res, 200, { data: {
        user: {
          id: auth.user.id, name: auth.user.name, email: auth.user.email,
          username: auth.user.username || '', bio: auth.user.bio || '',
          phone: auth.user.phone || '', level: auth.user.level || '',
          department: auth.user.department || '', matric: auth.user.matric || '',
          verified: auth.user.verified === true,
          role: auth.user.role || '',
          providers: auth.user.providers || [],
          createdAt: auth.user.createdAt || null
        },
        stats: {
          buys: myOrders.length,
          sells: soldUnits,
          trades: myOrders.length + soldUnits,
          spend,
          // There is no review data model yet, so this is honestly 0 rather
          // than a number borrowed from the sold count.
          reviews: 0,
          listings: myListings.length
        },
        listings: myListings,
        orders: myOrders
      } });
    }

    if (req.method === 'PATCH' && path === '/api/v1/me/profile') {
      const auth = await authenticate(req, res); if (!auth) return;
      if (auth.dev) return error(res, 400, 'Sign in with a real account to edit your profile.');
      const input = await body(req);
      const clean = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
      const username = normaliseUsername(input.username);
      const updated = await store.update(data => {
        if (username && data.users.some(u => u.id !== auth.user.id && String(u.username || '').toLowerCase() === username)) {
          throw Object.assign(new Error('That username is already taken.'), { status: 409 });
        }
        const user = data.users.find(u => u.id === auth.user.id);
        if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
        if (input.name !== undefined) user.name = clean(input.name, 120) || user.name;
        if (username) user.username = username;
        if (input.role !== undefined) { const role = cleanRole(input.role); if (!role) throw httpError(400, 'Role must be buyer or seller.'); user.role = role; }
        for (const key of ['bio', 'phone', 'level', 'department', 'matric']) {
          if (input[key] !== undefined) user[key] = clean(input[key], key === 'bio' ? 500 : 80);
        }
        user.updatedAt = new Date().toISOString();
        return publicUser(user);
      });
      return send(res, 200, { data: { user: updated } });
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
      // Flood control: one account cannot bury the market in listings.
      const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_LISTINGS_PER_USER || 25);
      await store.update(data => {
        if (data.listings.filter(x => x.sellerId === auth.user.id && x.status === 'active').length >= MAX_ACTIVE) throw httpError(429, `You can have at most ${MAX_ACTIVE} active listings. Remove one to post another.`);
        data.listings.push(item); audit(data, auth.user.id, 'listing.created', { listingId: item.id });
      });
      return send(res, 201, { data: item });
    }
    if (listingMatch && ['PATCH', 'DELETE'].includes(req.method)) {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id;
      return store.update(async data => {
        const item = data.listings.find(x => x.id === listingMatch[1]); if (!item) return error(res, 404, 'Listing not found.');
        if (item.sellerId !== id) return error(res, 403, 'You do not own this listing.');
        if (req.method === 'DELETE') { item.status = 'deleted'; item.updatedAt = new Date().toISOString(); audit(data, id, 'listing.deleted', { listingId: item.id }); return send(res, 204, {}); }
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
    // ---------- public client config ----------
    // Only values that are meant to be public (the Paystack *public* key). The
    // secret key and OAuth secrets never leave the server.
    if (req.method === 'GET' && path === '/api/v1/config') {
      return send(res, 200, { data: { paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '', paymentsLive: Boolean(process.env.PAYSTACK_PUBLIC_KEY && process.env.PAYSTACK_SECRET_KEY), deliveryFees: DELIVERY_FEES } });
    }

    // ---------- orders ----------
    if (req.method === 'POST' && path === '/api/v1/orders') {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id; const input = await body(req); let order;
      await store.update(data => {
        // Either the listings the browser names, or the server-side cart. Prices
        // and the delivery fee are always recomputed here.
        const named = Array.isArray(input.items);
        const lines = named ? input.items : cartFor(data, id).items.map(x => ({ listingId: x.listingId, quantity: x.quantity }));
        order = buildOrder(data, id, lines);
        data.orders.push(order);
        if (!named) data.carts[id] = { userId: id, items: [], updatedAt: new Date().toISOString() };
        audit(data, id, 'order.created', { orderId: order.id, total: order.total });
      });
      return send(res, 201, { data: order });
    }
    if (req.method === 'GET' && path === '/api/v1/orders') {
      const auth = await authenticate(req, res); if (!auth) return;
      const data = await store.read();
      return send(res, 200, { data: data.orders.filter(x => x.buyerId === auth.user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
    const orderMatch = path.match(/^\/api\/v1\/orders\/([^/]+)(\/cancel)?$/);
    if (orderMatch && ((req.method === 'GET' && !orderMatch[2]) || (req.method === 'POST' && orderMatch[2]))) {
      const auth = await authenticate(req, res); if (!auth) return;
      return store.update(data => {
        const order = data.orders.find(x => x.id === orderMatch[1] && x.buyerId === auth.user.id);
        if (!order) return error(res, 404, 'Order not found.');
        if (req.method === 'GET') return send(res, 200, { data: order });
        if (order.status !== 'pending_payment') return error(res, 409, 'Only an order that has not been paid can be cancelled.');
        order.status = 'cancelled'; order.cancelledAt = new Date().toISOString();
        audit(data, auth.user.id, 'order.cancelled', { orderId: order.id });
        return send(res, 200, { data: order });
      });
    }

    // ---------- payment confirmation (Paystack webhook) ----------
    // An order only becomes "paid" here, after the request is proven to come
    // from Paystack (HMAC-SHA512 of the raw body, keyed with the secret key)
    // and the amount matches what the server priced. The browser's word that a
    // payment went through is never enough.
    if (req.method === 'POST' && path === '/api/v1/webhooks/paystack') {
      const secret = process.env.PAYSTACK_SECRET_KEY || '';
      if (!secret) return error(res, 501, 'Paystack is not configured on this server. Set PAYSTACK_SECRET_KEY.');
      const raw = await rawBody(req);
      const expected = createHmac('sha512', secret).update(raw).digest('hex');
      if (!safeEqualHex(req.headers['x-paystack-signature'], expected)) return error(res, 401, 'Invalid signature.');
      let event; try { event = JSON.parse(raw.toString('utf8')); } catch { return error(res, 400, 'Body must be valid JSON.'); }
      if (!event || event.event !== 'charge.success' || !event.data) return send(res, 200, { data: { ignored: true } });
      const outcome = await store.update(data => {
        const order = data.orders.find(x => x.paymentReference === event.data.reference);
        if (!order) { audit(data, null, 'payment.unknown_reference', { reference: String(event.data.reference || '').slice(0, 80) }); return { ignored: true }; }
        if (order.status === 'paid') return { status: 'paid', duplicate: true };
        if (order.status !== 'pending_payment') { audit(data, null, 'payment.on_closed_order', { orderId: order.id, status: order.status }); return { ignored: true }; }
        if (Number(event.data.amount) !== order.total * 100 || String(event.data.currency || 'NGN') !== 'NGN') {
          order.paymentIssue = 'amount_mismatch';
          audit(data, null, 'payment.amount_mismatch', { orderId: order.id, expected: order.total * 100, received: Number(event.data.amount) });
          return { ignored: true };
        }
        order.status = 'paid'; order.paidAt = new Date().toISOString(); order.paymentProvider = 'paystack'; order.paymentTransactionId = String(event.data.id || '');
        for (const item of order.items) {
          const listing = data.listings.find(x => x.id === item.listingId);
          if (listing) listing.sold = (Number(listing.sold) || 0) + item.quantity;
        }
        audit(data, null, 'payment.confirmed', { orderId: order.id, total: order.total });
        return { status: 'paid' };
      });
      // Always 200 for a well-formed, correctly signed event, or Paystack keeps retrying it.
      return send(res, 200, { data: outcome });
    }

    // ---------- reporting a listing ----------
    const reportMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/report$/);
    if (req.method === 'POST' && reportMatch) {
      const auth = await authenticate(req, res); if (!auth) return;
      const input = await body(req);
      const reason = ['scam', 'prohibited', 'wrong_category', 'inappropriate', 'other'].includes(input.reason) ? input.reason : '';
      if (!reason) return error(res, 400, 'Choose a reason for the report.');
      const note = cleanText(input.note, 500);
      return store.update(data => {
        const listing = data.listings.find(x => x.id === reportMatch[1] && x.status === 'active');
        if (!listing) return error(res, 404, 'Listing not found.');
        if (listing.sellerId === auth.user.id) return error(res, 400, 'You cannot report your own listing.');
        const reports = (data.reports ||= []);
        if (reports.some(r => r.listingId === listing.id && r.reporterId === auth.user.id)) return error(res, 409, 'You have already reported this listing.');
        reports.push({ id: randomUUID(), listingId: listing.id, reporterId: auth.user.id, reason, note, status: 'open', createdAt: new Date().toISOString() });
        audit(data, auth.user.id, 'listing.reported', { listingId: listing.id, reason });
        return send(res, 201, { data: { reported: true, reportCount: reports.filter(r => r.listingId === listing.id).length } });
      });
    }

    // ---------- feedback ----------
    if (req.method === 'POST' && path === '/api/v1/feedback') {
      const input = await body(req); const user = await softAuthenticate(req);
      const category = ['bug', 'idea', 'praise', 'other'].includes(input.category) ? input.category : 'other';
      const message = cleanText(input.message, 2000);
      if (message.length < 5) return error(res, 400, 'Tell us a little more (at least 5 characters).');
      const entry = { id: randomUUID(), userId: user ? user.id : null, category, message, contact: cleanText(input.contact, 120), page: cleanText(input.page, 80), createdAt: new Date().toISOString() };
      await store.update(data => { const list = (data.feedback ||= []); list.push(entry); if (list.length > 2000) list.shift(); });
      return send(res, 201, { data: { id: entry.id } });
    }

    // ---------- per-account preferences and budget ----------
    if (path === '/api/v1/me/preferences' && ['GET', 'PUT'].includes(req.method)) {
      const auth = await authenticate(req, res); if (!auth) return;
      if (auth.dev) return error(res, 400, 'Sign in with a real account to save preferences.');
      if (req.method === 'GET') { const data = await store.read(); const user = data.users.find(u => u.id === auth.user.id); return send(res, 200, { data: mergePreferences(defaultPreferences(), user && user.preferences) }); }
      const input = await body(req);
      const saved = await store.update(data => {
        const user = data.users.find(u => u.id === auth.user.id);
        if (!user) throw httpError(404, 'Account not found.');
        user.preferences = mergePreferences(mergePreferences(defaultPreferences(), user.preferences), input, true);
        user.updatedAt = new Date().toISOString();
        return user.preferences;
      });
      return send(res, 200, { data: saved });
    }
    if (path === '/api/v1/me/budget' && ['GET', 'PUT'].includes(req.method)) {
      const auth = await authenticate(req, res); if (!auth) return;
      if (auth.dev) return error(res, 400, 'Sign in with a real account to save a budget.');
      if (req.method === 'GET') { const data = await store.read(); const user = data.users.find(u => u.id === auth.user.id); return send(res, 200, { data: (user && user.budget) || { income: 0, expenses: [] } }); }
      const budget = cleanBudget(await body(req));
      await store.update(data => { const user = data.users.find(u => u.id === auth.user.id); if (!user) throw httpError(404, 'Account not found.'); user.budget = budget; user.updatedAt = new Date().toISOString(); });
      return send(res, 200, { data: budget });
    }

    // ---------- rider applications ----------
    if (req.method === 'POST' && path === '/api/v1/riders/applications') {
      const auth = await authenticate(req, res); if (!auth) return;
      const input = await body(req);
      const name = cleanText(input.name, 120); const phone = cleanText(input.phone, 40);
      if (name.length < 2) return error(res, 400, 'Enter your full name.');
      if (!/^[+0-9][0-9 ()-]{6,}$/.test(phone)) return error(res, 400, 'Enter a phone number riders and buyers can reach you on.');
      const availability = ['mornings', 'afternoons', 'evenings', 'flexible'].includes(input.availability) ? input.availability : 'flexible';
      const application = { id: randomUUID(), userId: auth.user.id, name, level: cleanText(input.level, 20), email: cleanText(input.email || auth.user.email, 120), phone, availability, hostel: cleanText(input.hostel, 120), reason: cleanText(input.reason, 500), status: 'pending', createdAt: new Date().toISOString() };
      return store.update(data => {
        const list = (data.riderApplications ||= []);
        const open = list.find(a => a.userId === auth.user.id && a.status !== 'rejected');
        if (open) return error(res, 409, open.status === 'approved' ? 'You are already an approved rider.' : 'You already have an application waiting for review.');
        list.push(application); audit(data, auth.user.id, 'rider.applied', { applicationId: application.id });
        return send(res, 201, { data: application });
      });
    }
    if (req.method === 'GET' && path === '/api/v1/riders/applications/me') {
      const auth = await authenticate(req, res); if (!auth) return;
      const data = await store.read();
      const mine = (data.riderApplications || []).filter(a => a.userId === auth.user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { data: mine[0] || null });
    }
    const riderReview = path.match(/^\/api\/v1\/riders\/applications\/([^/]+)$/);
    if (req.method === 'PATCH' && riderReview) {
      const auth = await authenticate(req, res); if (!auth) return;
      if (!isAdmin(auth.user)) return error(res, 403, 'Only an admin can review rider applications.');
      const input = await body(req);
      if (!['approved', 'rejected'].includes(input.status)) return error(res, 400, 'Status must be approved or rejected.');
      return store.update(data => {
        const application = (data.riderApplications || []).find(a => a.id === riderReview[1]);
        if (!application) return error(res, 404, 'Application not found.');
        application.status = input.status; application.reviewNote = cleanText(input.note, 300); application.reviewedAt = new Date().toISOString(); application.reviewedBy = auth.user.id;
        audit(data, auth.user.id, `rider.${input.status}`, { applicationId: application.id });
        return send(res, 200, { data: application });
      });
    }

    // ---------- conversations ----------
    if (req.method === 'POST' && path === '/api/v1/conversations') {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id; const input = await body(req);
      return store.update(data => {
        const listing = data.listings.find(x => x.id === input.listingId && x.status === 'active');
        if (!listing) return error(res, 404, 'Active listing not found.');
        if (listing.sellerId === id) return error(res, 400, 'You cannot message your own listing.');
        let convo = data.conversations.find(x => x.listingId === listing.id && x.participants.includes(id));
        if (!convo) { convo = { id: randomUUID(), listingId: listing.id, participants: [id, listing.sellerId], messages: [], reads: {}, updatedAt: new Date().toISOString() }; data.conversations.push(convo); }
        return send(res, 200, { data: convo });
      });
    }
    const messageMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/);
    if (req.method === 'POST' && messageMatch) {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id; const input = await body(req); const text = String(input.text || '').trim();
      if (!text || text.length > 2000) return error(res, 400, 'Message must be 1 to 2000 characters.');
      return store.update(data => {
        const convo = data.conversations.find(x => x.id === messageMatch[1]);
        if (!convo) return error(res, 404, 'Conversation not found.');
        if (!convo.participants.includes(id)) return error(res, 403, 'You are not in this conversation.');
        const message = { id: randomUUID(), senderId: id, text, createdAt: new Date().toISOString() };
        convo.messages.push(message); convo.updatedAt = message.createdAt;
        // Whoever just wrote has, by definition, read everything up to here.
        (convo.reads ||= {})[id] = message.createdAt;
        return send(res, 201, { data: message });
      });
    }
    const convoMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)(\/read)?$/);
    if (convoMatch && ((req.method === 'GET' && !convoMatch[2]) || (req.method === 'POST' && convoMatch[2]))) {
      const auth = await authenticate(req, res); if (!auth) return;
      return store.update(data => {
        const convo = data.conversations.find(x => x.id === convoMatch[1]);
        if (!convo) return error(res, 404, 'Conversation not found.');
        if (!convo.participants.includes(auth.user.id)) return error(res, 403, 'You are not in this conversation.');
        if (req.method === 'POST') { (convo.reads ||= {})[auth.user.id] = new Date().toISOString(); return send(res, 200, { data: conversationSummary(convo, auth.user.id) }); }
        return send(res, 200, { data: { ...convo, unread: conversationSummary(convo, auth.user.id).unread } });
      });
    }
    if (req.method === 'GET' && path === '/api/v1/conversations') {
      const auth = await authenticate(req, res); if (!auth) return;
      const id = auth.user.id; const data = await store.read();
      const mine = data.conversations.filter(x => x.participants.includes(id)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const withMessages = url.searchParams.get('include') === 'messages';
      const list = mine.map(convo => ({ ...conversationSummary(convo, id), ...(withMessages ? { messages: convo.messages } : {}) }));
      return send(res, 200, { data: list, meta: { unreadTotal: list.reduce((sum, c) => sum + c.unread, 0) } });
    }
    return error(res, 404, 'Route not found.');
  } catch (err) { return error(res, err.status || 400, err.message || 'Bad request.'); }
}

function createServer() { return http.createServer(handler); }
if (require.main === module) createServer().listen(PORT, HOST, () => console.log(`Duka API listening on http://${HOST}:${PORT}`));
module.exports = { createServer, createRateLimiter, deliveryFeeFor, DELIVERY_FEES };
