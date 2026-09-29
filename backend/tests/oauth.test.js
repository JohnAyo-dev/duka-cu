// Drives the whole Google and Apple sign-in flow against a local mock of the
// providers. This proves every step this server is responsible for: the
// authorize URL, the single-use state, the code exchange (including Apple's
// signed client secret), the form_post callback, and the one-time code that
// swaps for a session. What it cannot prove is that your Google / Apple
// developer accounts are set up: that part needs real credentials.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

const STORE_PATH = path.join(os.tmpdir(), `duka-oauth-${process.pid}.json`);
process.env.DUKA_STORE_PATH = STORE_PATH;
process.env.DUKA_SKIP_ENV_FILE = '1';
process.env.LOG_REQUESTS = 'false';
process.env.RATE_LIMIT_AUTH_PER_MIN = '1000';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.APP_URL = 'http://127.0.0.1:4173';

const test = require('node:test');
const assert = require('node:assert/strict');

const appleKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const applePem = appleKey.privateKey.export({ type: 'pkcs8', format: 'pem' });
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

let mock; let mockBase; let server; let base;
let googleIdentity; let appleClaims; const seen = { google: null, apple: null };

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const form = new URLSearchParams(raw);
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/google/token') {
      seen.google = Object.fromEntries(form);
      if (form.get('client_secret') !== 'g-secret' || form.get('code') !== 'good-code') return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'google-access-token' });
    }
    if (req.url === '/google/userinfo') {
      return req.headers.authorization === 'Bearer google-access-token' ? reply(200, googleIdentity) : reply(401, {});
    }
    if (req.url === '/apple/token') {
      seen.apple = Object.fromEntries(form);
      const [head, payload, sig] = String(form.get('client_secret')).split('.');
      const ok = crypto.verify('sha256', Buffer.from(`${head}.${payload}`), { key: appleKey.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig || '', 'base64url'));
      if (!ok) return reply(400, { error: 'invalid_client' });
      return reply(200, { access_token: 'apple-access-token', id_token: `${b64({ alg: 'none' })}.${b64(appleClaims)}.` });
    }
    reply(404, {});
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  mockBase = `http://127.0.0.1:${mock.address().port}`;
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret',
    GOOGLE_AUTHORIZE_URL: `${mockBase}/google/authorize`, GOOGLE_TOKEN_URL: `${mockBase}/google/token`, GOOGLE_USERINFO_URL: `${mockBase}/google/userinfo`,
    APPLE_SERVICE_ID: 'com.duka.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: applePem,
    APPLE_AUTHORIZE_URL: `${mockBase}/apple/authorize`, APPLE_TOKEN_URL: `${mockBase}/apple/token`
  });
  fs.rmSync(STORE_PATH, { force: true });
  const { createServer } = require('../server');
  server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise(r => server.close(r)); await new Promise(r => mock.close(r)); fs.rmSync(STORE_PATH, { force: true }); });

async function api(p, options = {}) {
  const res = await fetch(base + p, { redirect: 'manual', ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
}
async function start(provider, input = {}) {
  const r = await api(`/api/v1/auth/oauth/${provider}/start`, { method: 'POST', body: JSON.stringify(input) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const url = new URL(r.body.data.authorizeUrl);
  return { url, state: url.searchParams.get('state') };
}
const landing = res => new URL(res.headers.get('location'));

test('Google and Apple report configured, Facebook does not', async () => {
  const { body } = await api('/api/v1/auth/providers');
  const by = Object.fromEntries(body.data.providers.map(p => [p.name, p.configured]));
  assert.deepEqual(by, { google: true, apple: true, facebook: false });
});

test('Google: start -> callback -> one-time code -> session, and the role is kept', async () => {
  googleIdentity = { email: 'Newcomer@Gmail.com', name: 'New Comer' };
  const { url, state } = await start('google', { next: 'http://127.0.0.1:4173/sell.html', role: 'seller' });
  assert.equal(url.origin + url.pathname, `${mockBase}/google/authorize`);
  assert.equal(url.searchParams.get('client_id'), 'g-client');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/v1/auth/oauth/google/callback', 'this exact URI must be registered with Google');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.match(url.searchParams.get('scope'), /email/);

  const cb = await api(`/api/v1/auth/oauth/google/callback?code=good-code&state=${encodeURIComponent(state)}`);
  assert.equal(cb.status, 302);
  const back = landing(cb);
  assert.equal(back.origin + back.pathname, 'http://127.0.0.1:4173/login.html');
  assert.equal(back.searchParams.get('next'), 'sell.html');
  assert.equal(seen.google.redirect_uri, 'http://localhost:3000/api/v1/auth/oauth/google/callback', 'the token request repeats the same redirect URI');
  const code = back.searchParams.get('oauth_code'); assert.ok(code);
  assert.ok(!back.search.includes('token'), 'no bearer token ever appears in a URL');

  const ex = await api('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.data.user.email, 'newcomer@gmail.com');
  assert.equal(ex.body.data.user.role, 'seller');
  assert.deepEqual(ex.body.data.user.providers, ['google']);
  const me = await api('/api/v1/auth/me', { headers: { authorization: `Bearer ${ex.body.data.token}` } });
  assert.equal(me.status, 200);

  const replay = await api('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(replay.status, 400, 'a one-time code cannot be spent twice');
  const stateReplay = await api(`/api/v1/auth/oauth/google/callback?code=good-code&state=${encodeURIComponent(state)}`);
  assert.equal(stateReplay.status, 400, 'a state value cannot be reused');
});

test('Google: signing in with an email that already has an account links it, not duplicates it', async () => {
  const reg = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Existing Student', email: 'existing@stu.cu.edu.ng', password: 'password1', role: 'buyer' }) });
  googleIdentity = { email: 'existing@stu.cu.edu.ng', name: 'Existing Student' };
  const { state } = await start('google', { role: 'seller' });
  const cb = await api(`/api/v1/auth/oauth/google/callback?code=good-code&state=${encodeURIComponent(state)}`);
  const ex = await api('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code: landing(cb).searchParams.get('oauth_code') }) });
  assert.equal(ex.body.data.user.id, reg.body.data.user.id);
  assert.equal(ex.body.data.user.role, 'buyer', 'signing in never overwrites a role the person already chose');
  assert.ok(ex.body.data.user.providers.includes('google'));
});

test('Google: provider errors and missing emails bounce back to the login page with a message', async () => {
  const { state } = await start('google');
  const denied = await api(`/api/v1/auth/oauth/google/callback?error=access_denied&error_description=${encodeURIComponent('You cancelled the sign-in')}&state=${encodeURIComponent(state)}`);
  assert.equal(landing(denied).searchParams.get('oauth_error'), 'You cancelled the sign-in');

  googleIdentity = { name: 'No Email' };
  const second = await start('google');
  const noEmail = await api(`/api/v1/auth/oauth/google/callback?code=good-code&state=${encodeURIComponent(second.state)}`);
  assert.match(landing(noEmail).searchParams.get('oauth_error'), /email/i);

  const third = await start('google');
  const badCode = await api(`/api/v1/auth/oauth/google/callback?code=wrong&state=${encodeURIComponent(third.state)}`);
  assert.match(landing(badCode).searchParams.get('oauth_error'), /Could not complete/);

  const forged = await api('/api/v1/auth/oauth/google/callback?code=good-code&state=forged');
  assert.equal(forged.status, 400);
});

test('Apple: form_post callback, a correctly signed client secret, identity from the id_token', async () => {
  appleClaims = { aud: 'com.duka.web', email: 'apple.user@icloud.com', sub: 'apple-sub-1' };
  const { url, state } = await start('apple', { role: 'buyer' });
  assert.equal(url.searchParams.get('response_mode'), 'form_post');
  assert.equal(url.searchParams.get('scope'), 'name email');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/v1/auth/oauth/apple/callback');

  // Apple's browser POSTs the result to the callback as a form.
  const cb = await api('/api/v1/auth/oauth/apple/callback', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: 'apple-code', state }).toString() });
  assert.equal(cb.status, 302, JSON.stringify(cb.body));

  const [head, payload] = seen.apple.client_secret.split('.');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString()); const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(header.alg, 'ES256'); assert.equal(header.kid, 'KEY1234567');
  assert.equal(claims.iss, 'TEAM123456'); assert.equal(claims.sub, 'com.duka.web'); assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.ok(claims.exp - claims.iat <= 300, 'the client secret is short-lived');

  const ex = await api('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code: landing(cb).searchParams.get('oauth_code') }) });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.data.user.email, 'apple.user@icloud.com');
  assert.equal(ex.body.data.user.name, 'apple.user', 'with no name supplied, the email prefix is the fallback');
  assert.equal(ex.body.data.user.role, 'buyer');
});

test('Apple: an id_token issued for a different app is refused', async () => {
  appleClaims = { aud: 'com.someone.else', email: 'attacker@example.com' };
  const { state } = await start('apple');
  const cb = await api('/api/v1/auth/oauth/apple/callback', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: 'apple-code', state }).toString() });
  assert.equal(cb.status, 302);
  assert.ok(landing(cb).searchParams.get('oauth_error'));
  assert.equal(landing(cb).searchParams.get('oauth_code'), null);
});

test('the env file loader handles quotes, comments and multi-line keys without overriding real variables', () => {
  const { parse, load } = require('../env');
  const values = parse([
    '# comment', 'PLAIN=hello # trailing', 'QUOTED="two words"', "SINGLE='keep $this'",
    'export EXPORTED=yes', 'EMPTY=', 'KEY="-----BEGIN PRIVATE KEY-----', 'line-two', '-----END PRIVATE KEY-----"', 'ESCAPED="a\\nb"', 'AFTER=ok'
  ].join('\n'));
  assert.equal(values.PLAIN, 'hello'); assert.equal(values.QUOTED, 'two words'); assert.equal(values.SINGLE, 'keep $this');
  assert.equal(values.EXPORTED, 'yes'); assert.equal(values.EMPTY, '');
  assert.equal(values.KEY, '-----BEGIN PRIVATE KEY-----\nline-two\n-----END PRIVATE KEY-----');
  assert.equal(values.ESCAPED, 'a\nb'); assert.equal(values.AFTER, 'ok');

  const file = path.join(os.tmpdir(), `duka-env-${process.pid}.env`);
  fs.writeFileSync(file, 'DUKA_ENV_TEST_A=from-file\nDUKA_ENV_TEST_B=from-file\n');
  process.env.DUKA_ENV_TEST_B = 'from-shell'; delete process.env.DUKA_SKIP_ENV_FILE;
  try { load(file); } finally { process.env.DUKA_SKIP_ENV_FILE = '1'; fs.rmSync(file, { force: true }); }
  assert.equal(process.env.DUKA_ENV_TEST_A, 'from-file');
  assert.equal(process.env.DUKA_ENV_TEST_B, 'from-shell', 'a real environment variable wins over the file');
});
