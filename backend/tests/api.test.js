const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

let server; let base;
test.before(async () => { server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));

async function api(path, options = {}) { const res = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); return { status: res.status, body: res.status === 204 ? null : await res.json() }; }
async function register(name, email, password) { const r = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }); return r.body.data; }

test('health endpoint responds', async () => { const result = await api('/api/v1/health'); assert.equal(result.status, 200); assert.equal(result.body.status, 'ok'); });

test('protected routes require a session', async () => {
  const cart = await api('/api/v1/cart');
  assert.equal(cart.status, 401);
  const listing = await api('/api/v1/listings', { method: 'POST', body: JSON.stringify({ title: 'Shady item', description: 'Should never be created without a real account.', category: 'books', price: 100, delivery: 'self' }) });
  assert.equal(listing.status, 401);
});

test('registration, login, me, and logout work', async () => {
  const email = 'ada@stu.cu.edu.ng'; const password = 'correct-horse';
  const badEmail = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ada', email: 'ada@gmail.com', password }) });
  assert.equal(badEmail.status, 400);
  const reg = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ada Student', email, password }) });
  assert.equal(reg.status, 201); assert.ok(reg.body.data.token); assert.ok(reg.body.data.user.email, email);
  assert.equal(reg.body.data.user.password, undefined);
  const token = reg.body.data.token;
  const me = await api('/api/v1/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200); assert.equal(me.body.data.user.email, email);
  const login = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200); assert.ok(login.body.data.token);
  const wrong = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'wrong-password' }) });
  assert.equal(wrong.status, 400);
  const dup = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ada Again', email, password }) });
  assert.equal(dup.status, 409);
  await api('/api/v1/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  const after = await api('/api/v1/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(after.status, 401);
});

test('listing, cart, and order flow works with session ownership checks', async () => {
  const seller = await register('Seller X', 'seller-x@stu.cu.edu.ng', 'password1');
  const buyer = await register('Buyer Y', 'buyer-y@stu.cu.edu.ng', 'password1');
  const sellerAuth = { authorization: `Bearer ${seller.token}` };
  const buyerAuth = { authorization: `Bearer ${buyer.token}` };

  const listing = await api('/api/v1/listings', { method: 'POST', headers: sellerAuth, body: JSON.stringify({ title: 'Engineering calculator', description: 'A working scientific calculator for first-year engineering classes.', category: 'electronics', price: 8500, delivery: 'self' }) });
  assert.equal(listing.status, 201); const listingId = listing.body.data.id;

  const hijack = await api('/api/v1/listings/' + listingId, { method: 'PATCH', headers: buyerAuth, body: JSON.stringify({ title: 'Stolen listing', description: 'Another user must not be able to take over this listing while it is posted for sale.', category: 'electronics', price: 9000, delivery: 'self' }) });
  assert.equal(hijack.status, 403);

  const cart = await api('/api/v1/cart', { method: 'POST', headers: buyerAuth, body: JSON.stringify({ listingId }) });
  assert.equal(cart.status, 200); assert.equal(cart.body.data.total, 8500);
  const order = await api('/api/v1/orders', { method: 'POST', headers: buyerAuth });
  assert.equal(order.status, 201); assert.equal(order.body.data.subtotal, 8500);
});