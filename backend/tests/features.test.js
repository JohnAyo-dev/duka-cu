// Covers the ToDo items that do not need outside services: delivery fees,
// payment confirmation, reports, feedback, preferences, budget, riders, chat
// unread state and account roles.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createHmac } = require('node:crypto');

const STORE_PATH = path.join(os.tmpdir(), `duka-features-${process.pid}.json`);
process.env.DUKA_STORE_PATH = STORE_PATH;
process.env.DUKA_SKIP_ENV_FILE = '1';
process.env.LOG_REQUESTS = 'false';
process.env.RATE_LIMIT_AUTH_PER_MIN = '1000';
process.env.RATE_LIMIT_WRITE_PER_MIN = '1000';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit_secret';
process.env.ADMIN_EMAILS = 'admin@stu.cu.edu.ng';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, deliveryFeeFor, DELIVERY_FEES } = require('../server');

let server; let base;
test.before(async () => { fs.rmSync(STORE_PATH, { force: true }); server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(STORE_PATH, { force: true }); });

async function api(p, options = {}) {
  const res = await fetch(base + p, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
const json = value => JSON.stringify(value);
let counter = 0;
async function signUp(label, extra = {}) {
  counter += 1;
  const email = `${label}-${counter}@stu.cu.edu.ng`;
  const r = await api('/api/v1/auth/register', { method: 'POST', body: json({ name: `${label} person`, email, password: 'password1', ...extra }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.data.token, id: r.body.data.user.id, email, auth: { authorization: `Bearer ${r.body.data.token}` }, user: r.body.data.user };
}
async function postListing(seller, over = {}) {
  const r = await api('/api/v1/listings', { method: 'POST', headers: seller.auth, body: json({ title: 'Test listing item', description: 'A perfectly reasonable listing description.', category: 'books', price: 5000, delivery: 'self', ...over }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data;
}
function paystackEvent(order, over = {}) {
  const payload = { event: 'charge.success', data: { id: 4242, reference: order.paymentReference, amount: order.total * 100, currency: 'NGN', status: 'success', ...over } };
  const raw = JSON.stringify(payload);
  return { raw, signature: createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex') };
}

test('delivery fee rule: flat per class, only for Duka delivery', () => {
  assert.equal(deliveryFeeFor([{ category: 'books', delivery: 'self' }]), 0);
  assert.equal(deliveryFeeFor([{ category: 'food', delivery: 'duka' }]), DELIVERY_FEES.food);
  assert.equal(deliveryFeeFor([{ category: 'books', delivery: 'duka' }, { category: 'audio', delivery: 'duka' }]), DELIVERY_FEES.other);
  assert.equal(deliveryFeeFor([{ category: 'food', delivery: 'duka' }, { category: 'audio', delivery: 'duka' }]), 3000);
  assert.equal(deliveryFeeFor([{ category: 'food', delivery: 'self' }, { category: 'audio', delivery: 'duka' }]), 2500);
});

test('orders carry a server-calculated delivery fee and ignore client prices', async () => {
  const seller = await signUp('feeseller'); const buyer = await signUp('feebuyer');
  const food = await postListing(seller, { title: 'Jollof rice pack', category: 'food', price: 2000, delivery: 'duka' });
  const gadget = await postListing(seller, { title: 'Desk lamp', category: 'hostel', price: 8500, delivery: 'duka' });
  const pickup = await postListing(seller, { title: 'Old textbook', category: 'books', price: 3000, delivery: 'self' });

  const order = await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [
    { listingId: food.id, quantity: 2, price: 1 }, { listingId: gadget.id, quantity: 1 }, { listingId: pickup.id, quantity: 1 }
  ] }) });
  assert.equal(order.status, 201);
  const o = order.body.data;
  assert.equal(o.subtotal, 2000 * 2 + 8500 + 3000);
  assert.equal(o.deliveryFee, 500 + 2500);
  assert.equal(o.total, o.subtotal + 3000);
  assert.equal(o.status, 'pending_payment');
  assert.equal(o.items.find(i => i.listingId === food.id).price, 2000, 'client-sent price must be ignored');

  const own = await api('/api/v1/orders', { method: 'POST', headers: seller.auth, body: json({ items: [{ listingId: food.id }] }) });
  assert.equal(own.status, 400);
  const ghost = await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [{ listingId: 'nope' }] }) });
  assert.equal(ghost.status, 404);
  const empty = await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [] }) });
  assert.equal(empty.status, 400);
  const badQty = await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [{ listingId: food.id, quantity: 99 }] }) });
  assert.equal(badQty.status, 400);

  const fetched = await api('/api/v1/orders/' + o.id, { headers: buyer.auth });
  assert.equal(fetched.status, 200);
  const stranger = await api('/api/v1/orders/' + o.id, { headers: seller.auth });
  assert.equal(stranger.status, 404, 'orders are private to the buyer');
});

test('an order is only paid by a correctly signed Paystack webhook, once', async () => {
  const seller = await signUp('paidseller'); const buyer = await signUp('paidbuyer');
  const listing = await postListing(seller, { category: 'audio', price: 12000, delivery: 'duka' });
  const order = (await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [{ listingId: listing.id, quantity: 2 }] }) })).body.data;
  assert.equal(order.total, 24000 + 2500);

  const hook = (raw, signature) => api('/api/v1/webhooks/paystack', { method: 'POST', headers: signature ? { 'x-paystack-signature': signature } : {}, body: raw });

  const good = paystackEvent(order);
  assert.equal((await hook(good.raw)).status, 401, 'missing signature');
  assert.equal((await hook(good.raw, 'deadbeef')).status, 401, 'wrong signature');
  const tampered = paystackEvent(order, { amount: 100 });
  assert.equal((await hook(good.raw.replace('4242', '9999'), good.signature)).status, 401, 'body changed after signing');

  // Correctly signed, but the amount does not match what the server priced.
  const short = await hook(tampered.raw, tampered.signature);
  assert.equal(short.status, 200);
  assert.equal((await api('/api/v1/orders/' + order.id, { headers: buyer.auth })).body.data.status, 'pending_payment');

  // Unrelated event types are acknowledged and ignored.
  const other = JSON.stringify({ event: 'transfer.success', data: {} });
  const otherSig = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(other).digest('hex');
  assert.equal((await hook(other, otherSig)).body.data.ignored, true);

  const ok = await hook(good.raw, good.signature);
  assert.equal(ok.status, 200); assert.equal(ok.body.data.status, 'paid');
  const paid = (await api('/api/v1/orders/' + order.id, { headers: buyer.auth })).body.data;
  assert.equal(paid.status, 'paid'); assert.ok(paid.paidAt);

  const again = await hook(good.raw, good.signature);
  assert.equal(again.body.data.duplicate, true);
  const sold = (await api('/api/v1/listings/' + listing.id)).body.data.sold;
  assert.equal(sold, 2, 'sold count goes up once, not on the duplicate delivery');

  const cancel = await api(`/api/v1/orders/${order.id}/cancel`, { method: 'POST', headers: buyer.auth });
  assert.equal(cancel.status, 409, 'a paid order cannot be cancelled');

  const profile = (await api('/api/v1/me/profile', { headers: buyer.auth })).body.data;
  assert.equal(profile.stats.buys, 1); assert.equal(profile.stats.spend, 26500);
});

test('an unpaid order can be cancelled and never counts as a purchase', async () => {
  const seller = await signUp('cancelseller'); const buyer = await signUp('cancelbuyer');
  const listing = await postListing(seller);
  const order = (await api('/api/v1/orders', { method: 'POST', headers: buyer.auth, body: json({ items: [{ listingId: listing.id }] }) })).body.data;
  assert.equal((await api('/api/v1/me/profile', { headers: buyer.auth })).body.data.stats.buys, 0);
  const cancelled = await api(`/api/v1/orders/${order.id}/cancel`, { method: 'POST', headers: buyer.auth });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.data.status, 'cancelled');
  const hook = paystackEvent(order);
  await api('/api/v1/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': hook.signature }, body: hook.raw });
  assert.equal((await api('/api/v1/orders/' + order.id, { headers: buyer.auth })).body.data.status, 'cancelled', 'a late payment does not resurrect a cancelled order');
});

test('the webhook reports itself unconfigured without a secret key', async () => {
  const saved = process.env.PAYSTACK_SECRET_KEY; delete process.env.PAYSTACK_SECRET_KEY;
  try { assert.equal((await api('/api/v1/webhooks/paystack', { method: 'POST', body: '{}' })).status, 501); }
  finally { process.env.PAYSTACK_SECRET_KEY = saved; }
});

test('listings can be reported once per person, but not by their owner', async () => {
  const seller = await signUp('reportseller'); const a = await signUp('reporter-a'); const b = await signUp('reporter-b');
  const listing = await postListing(seller);
  const url = `/api/v1/listings/${listing.id}/report`;
  assert.equal((await api(url, { method: 'POST', body: json({ reason: 'scam' }) })).status, 401);
  assert.equal((await api(url, { method: 'POST', headers: a.auth, body: json({ reason: 'because' }) })).status, 400);
  assert.equal((await api(url, { method: 'POST', headers: seller.auth, body: json({ reason: 'scam' }) })).status, 400);
  const first = await api(url, { method: 'POST', headers: a.auth, body: json({ reason: 'scam', note: 'asked me to pay outside the app' }) });
  assert.equal(first.status, 201); assert.equal(first.body.data.reportCount, 1);
  assert.equal((await api(url, { method: 'POST', headers: a.auth, body: json({ reason: 'scam' }) })).status, 409);
  assert.equal((await api(url, { method: 'POST', headers: b.auth, body: json({ reason: 'prohibited' }) })).body.data.reportCount, 2);
  assert.equal((await api('/api/v1/listings/nope/report', { method: 'POST', headers: a.auth, body: json({ reason: 'scam' }) })).status, 404);
});

test('an account cannot flood the market with listings', async () => {
  const seller = await signUp('floodseller');
  process.env.MAX_ACTIVE_LISTINGS_PER_USER = '2';
  try {
    await postListing(seller); await postListing(seller);
    const third = await api('/api/v1/listings', { method: 'POST', headers: seller.auth, body: json({ title: 'Third listing', description: 'One listing too many for this account.', category: 'books', price: 100, delivery: 'self' }) });
    assert.equal(third.status, 429);
  } finally { delete process.env.MAX_ACTIVE_LISTINGS_PER_USER; }
});

test('feedback works signed out and signed in, and rejects empty messages', async () => {
  const anon = await api('/api/v1/feedback', { method: 'POST', body: json({ category: 'idea', message: 'Please add dark mode to the chat page.' }) });
  assert.equal(anon.status, 201);
  const user = await signUp('feedbacker');
  const signed = await api('/api/v1/feedback', { method: 'POST', headers: user.auth, body: json({ category: 'nonsense', message: 'The checkout button is hard to find.', page: 'cart.html' }) });
  assert.equal(signed.status, 201);
  assert.equal((await api('/api/v1/feedback', { method: 'POST', body: json({ message: 'hi' }) })).status, 400);
});

test('preferences default sensibly, validate strictly and persist per account', async () => {
  const user = await signUp('prefs'); const other = await signUp('prefs-other');
  assert.equal((await api('/api/v1/me/preferences')).status, 401);
  const initial = (await api('/api/v1/me/preferences', { headers: user.auth })).body.data;
  assert.equal(initial.privacy.saveSearchHistory, true); assert.equal(initial.payment.preferred, 'paystack-titan'); assert.equal(initial.theme, 'system');
  const saved = await api('/api/v1/me/preferences', { method: 'PUT', headers: user.auth, body: json({ theme: 'dark', privacy: { saveSearchHistory: false }, payment: { preferred: 'monnify' } }) });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.privacy.showEmailOnListings, true, 'untouched keys survive a partial update');
  assert.equal(saved.body.data.privacy.saveSearchHistory, false);
  assert.equal((await api('/api/v1/me/preferences', { method: 'PUT', headers: user.auth, body: json({ privacy: { saveSearchHistory: 'yes' } }) })).status, 400);
  assert.equal((await api('/api/v1/me/preferences', { method: 'PUT', headers: user.auth, body: json({ payment: { preferred: 'bitcoin' } }) })).status, 400);
  const reread = (await api('/api/v1/me/preferences', { headers: user.auth })).body.data;
  assert.equal(reread.payment.preferred, 'monnify');
  assert.equal((await api('/api/v1/me/preferences', { headers: other.auth })).body.data.payment.preferred, 'paystack-titan', 'preferences belong to one account');
});

test('a budget is saved per account and validated', async () => {
  const user = await signUp('budgeter');
  assert.equal((await api('/api/v1/me/budget')).status, 401);
  assert.deepEqual((await api('/api/v1/me/budget', { headers: user.auth })).body.data, { income: 0, expenses: [] });
  const put = await api('/api/v1/me/budget', { method: 'PUT', headers: user.auth, body: json({ income: 50000, expenses: [{ name: 'Data bundle', amount: 3500, category: 'Bills' }, { name: 'Suya', amount: 1500 }] }) });
  assert.equal(put.status, 200);
  const got = (await api('/api/v1/me/budget', { headers: user.auth })).body.data;
  assert.equal(got.income, 50000); assert.equal(got.expenses.length, 2); assert.equal(got.expenses[1].category, 'Other');
  assert.equal((await api('/api/v1/me/budget', { method: 'PUT', headers: user.auth, body: json({ income: -5, expenses: [] }) })).status, 400);
  assert.equal((await api('/api/v1/me/budget', { method: 'PUT', headers: user.auth, body: json({ income: 1, expenses: [{ name: '', amount: 5 }] }) })).status, 400);
});

test('rider applications: apply once, see status, admin approves', async () => {
  const rider = await signUp('rider'); const admin = { auth: null };
  const adminReg = await api('/api/v1/auth/register', { method: 'POST', body: json({ name: 'Admin Person', email: 'admin@stu.cu.edu.ng', password: 'password1' }) });
  admin.auth = { authorization: `Bearer ${adminReg.body.data.token}` };
  assert.equal((await api('/api/v1/riders/applications', { method: 'POST', body: json({}) })).status, 401);
  assert.equal((await api('/api/v1/riders/applications', { method: 'POST', headers: rider.auth, body: json({ name: 'R', phone: '123' }) })).status, 400);
  assert.equal((await api('/api/v1/riders/applications/me', { headers: rider.auth })).body.data, null);
  const applied = await api('/api/v1/riders/applications', { method: 'POST', headers: rider.auth, body: json({ name: 'Kelechi Rider', phone: '+234 803 000 0000', availability: 'mornings', hostel: 'Hall 3', level: '300L' }) });
  assert.equal(applied.status, 201); assert.equal(applied.body.data.status, 'pending');
  assert.equal((await api('/api/v1/riders/applications', { method: 'POST', headers: rider.auth, body: json({ name: 'Kelechi Rider', phone: '+234 803 000 0000' }) })).status, 409);
  const id = applied.body.data.id;
  assert.equal((await api('/api/v1/riders/applications/' + id, { method: 'PATCH', headers: rider.auth, body: json({ status: 'approved' }) })).status, 403, 'a rider cannot approve themselves');
  assert.equal((await api('/api/v1/riders/applications/' + id, { method: 'PATCH', headers: admin.auth, body: json({ status: 'maybe' }) })).status, 400);
  assert.equal((await api('/api/v1/riders/applications/' + id, { method: 'PATCH', headers: admin.auth, body: json({ status: 'approved', note: 'Welcome aboard' }) })).status, 200);
  const mine = (await api('/api/v1/riders/applications/me', { headers: rider.auth })).body.data;
  assert.equal(mine.status, 'approved'); assert.equal(mine.reviewNote, 'Welcome aboard');
});

test('conversations report unread counts, a last-message preview, and can be marked read', async () => {
  const seller = await signUp('chatseller'); const buyer = await signUp('chatbuyer');
  const listing = await postListing(seller);
  const convo = (await api('/api/v1/conversations', { method: 'POST', headers: buyer.auth, body: json({ listingId: listing.id }) })).body.data;
  const send = (who, text) => api(`/api/v1/conversations/${convo.id}/messages`, { method: 'POST', headers: who.auth, body: json({ text }) });
  assert.equal((await send(buyer, 'Is this still available?')).status, 201);
  assert.equal((await send(buyer, 'I can pick it up at 4pm')).status, 201);

  const sellerList = (await api('/api/v1/conversations', { headers: seller.auth })).body;
  assert.equal(sellerList.data[0].unread, 2); assert.equal(sellerList.meta.unreadTotal, 2);
  assert.equal(sellerList.data[0].lastMessage.text, 'I can pick it up at 4pm');
  assert.equal(sellerList.data[0].messages, undefined, 'the list view stays light');
  const buyerList = (await api('/api/v1/conversations', { headers: buyer.auth })).body;
  assert.equal(buyerList.data[0].unread, 0, 'your own messages are never unread to you');

  assert.equal((await api(`/api/v1/conversations/${convo.id}/read`, { method: 'POST', headers: buyer.auth })).status, 200);
  const outsider = await signUp('chatoutsider');
  assert.equal((await api(`/api/v1/conversations/${convo.id}/read`, { method: 'POST', headers: outsider.auth })).status, 403);
  const marked = await api(`/api/v1/conversations/${convo.id}/read`, { method: 'POST', headers: seller.auth });
  assert.equal(marked.body.data.unread, 0);
  assert.equal((await api('/api/v1/conversations', { headers: seller.auth })).body.meta.unreadTotal, 0);

  await send(buyer, 'Also, can you do 8k?');
  assert.equal((await api('/api/v1/conversations', { headers: seller.auth })).body.meta.unreadTotal, 1);
  const full = (await api(`/api/v1/conversations/${convo.id}`, { headers: seller.auth })).body.data;
  assert.equal(full.messages.length, 3);
  const withMessages = (await api('/api/v1/conversations?include=messages', { headers: seller.auth })).body.data[0];
  assert.equal(withMessages.messages.length, 3);
});

test('an account records whether it came to buy or sell', async () => {
  const seller = await signUp('rolefan', { role: 'seller' });
  assert.equal(seller.user.role, 'seller');
  const none = await signUp('norole', { role: 'wizard' });
  assert.equal(none.user.role, undefined, 'an unknown role is ignored, not stored');
  const profile = (await api('/api/v1/me/profile', { headers: none.auth })).body.data;
  assert.equal(profile.user.role, '');
  const set = await api('/api/v1/me/profile', { method: 'PATCH', headers: none.auth, body: json({ role: 'buyer' }) });
  assert.equal(set.body.data.user.role, 'buyer');
  assert.equal((await api('/api/v1/me/profile', { method: 'PATCH', headers: none.auth, body: json({ role: 'wizard' }) })).status, 400);
});
