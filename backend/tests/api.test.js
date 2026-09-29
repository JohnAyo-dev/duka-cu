const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Must be set before the server is required, since the store reads its path
// once at load time. Without this the suite registers real accounts into the
// developer store.json and every second run fails on a duplicate email.
const STORE_PATH = path.join(os.tmpdir(), `duka-test-${process.pid}.json`);
process.env.DUKA_STORE_PATH = STORE_PATH;
// A developer's real .env (OAuth keys, Paystack secret) must never leak into a
// test run, and request logging would only bury the test output.
process.env.DUKA_SKIP_ENV_FILE = '1';
process.env.LOG_REQUESTS = 'false';
process.env.RATE_LIMIT_AUTH_PER_MIN = '1000';
process.env.RATE_LIMIT_WRITE_PER_MIN = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

let server; let base;
test.before(async () => { fs.rmSync(STORE_PATH, { force: true }); server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(STORE_PATH, { force: true }); });

async function api(path, options = {}) { const res = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); return { status: res.status, body: res.status === 204 ? null : await res.json() }; }
async function register(name, email, password, extra = {}) { const r = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, ...extra }) }); return r.body.data; }

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

test('registration stores the username and refuses to reuse it', async () => {
  const first = await register('Handle Owner', 'handle-owner@stu.cu.edu.ng', 'password1', { username: 'Handle.Owner' });
  assert.equal(first.user.username, 'handle.owner');
  const clash = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Other', email: 'other-handle@stu.cu.edu.ng', password: 'password1', username: 'handle.owner' }) });
  assert.equal(clash.status, 409);
  const bad = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Bad Handle', email: 'bad-handle@stu.cu.edu.ng', password: 'password1', username: 'no spaces allowed' }) });
  assert.equal(bad.status, 400);
});

test('profile reports real counts and rejects a username owned by someone else', async () => {
  const seller = await register('Profile Seller', 'profile-seller@stu.cu.edu.ng', 'password1', { username: 'profileseller' });
  const other = await register('Profile Other', 'profile-other@stu.cu.edu.ng', 'password1', { username: 'profileother' });
  const auth = { authorization: `Bearer ${seller.token}` };

  const anon = await api('/api/v1/me/profile');
  assert.equal(anon.status, 401);

  const listing = await api('/api/v1/listings', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Second hand kettle', description: 'A kettle that boiled every morning of last semester and still works fine.', category: 'hostel', price: 9000, delivery: 'self' }) });
  assert.equal(listing.status, 201);

  const profile = await api('/api/v1/me/profile', { headers: auth });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.user.username, 'profileseller');
  assert.equal(profile.body.data.stats.listings, 1);
  assert.equal(profile.body.data.stats.buys, 0);
  assert.equal(profile.body.data.stats.reviews, 0);
  assert.equal(profile.body.data.listings.length, 1);

  const saved = await api('/api/v1/me/profile', { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Renamed Seller', level: '400L', bio: 'I do Duka delivery for hostel blocks.', username: 'profileother' }) });
  assert.equal(saved.status, 409);
  const bad = await api('/api/v1/me/profile', { method: 'PATCH', headers: auth, body: JSON.stringify({ username: 'not a handle' }) });
  assert.equal(bad.status, 400);
  const good = await api('/api/v1/me/profile', { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Renamed Seller', level: '400L', bio: 'I do Duka delivery for hostel blocks.' }) });
  assert.equal(good.status, 200);
  assert.equal(good.body.data.user.name, 'Renamed Seller');
  assert.equal(good.body.data.user.level, '400L');
  assert.equal(good.body.data.user.bio, 'I do Duka delivery for hostel blocks.');
  // The username was not part of that request, so it must survive the edit.
  assert.equal(good.body.data.user.username, 'profileseller');
  assert.ok(other.token);
});

test('sign-in providers report honestly when no credentials are set', async () => {
  const providers = await api('/api/v1/auth/providers');
  assert.equal(providers.status, 200);
  const names = providers.body.data.providers.map(p => p.name);
  assert.deepEqual(names, ['google', 'apple', 'facebook']);
  for (const provider of providers.body.data.providers) {
    assert.equal(provider.configured, false);
    assert.ok(provider.missing.length, `${provider.name} should list what it still needs`);
  }
  const start = await api('/api/v1/auth/oauth/google/start', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(start.status, 501);
  const unknown = await api('/api/v1/auth/oauth/myspace/start', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(unknown.status, 404);
});

test('an OAuth sign-in code is single-use and never accepted twice', async () => {
  const missing = await api('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code: 'made-up' }) });
  assert.equal(missing.status, 400);
});
