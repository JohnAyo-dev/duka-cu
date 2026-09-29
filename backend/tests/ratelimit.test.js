const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const STORE_PATH = path.join(os.tmpdir(), `duka-ratelimit-${process.pid}.json`);
process.env.DUKA_STORE_PATH = STORE_PATH;
process.env.DUKA_SKIP_ENV_FILE = '1';
process.env.LOG_REQUESTS = 'false';
process.env.RATE_LIMIT_AUTH_PER_MIN = '3';
process.env.RATE_LIMIT_WRITE_PER_MIN = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createRateLimiter } = require('../server');

test('the limiter allows up to the limit, then blocks until the window passes', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.check('ip', 0).ok, true);
  assert.equal(limiter.check('ip', 100).ok, true);
  const blocked = limiter.check('ip', 200);
  assert.equal(blocked.ok, false); assert.ok(blocked.retryAfter >= 1);
  assert.equal(limiter.check('someone-else', 200).ok, true, 'keys are independent');
  assert.equal(limiter.check('ip', 1001).ok, true, 'the oldest hit has aged out');
});

test('repeated sign-in attempts get a 429 with Retry-After', async () => {
  fs.rmSync(STORE_PATH, { force: true });
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const attempt = () => fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@stu.cu.edu.ng', password: 'wrong-password' }) });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);
    assert.deepEqual(statuses, [400, 400, 400, 429, 429]);
    const last = await attempt();
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
    // Reading the market is never rate limited by the auth bucket.
    assert.equal((await fetch(base + '/api/v1/listings')).status, 200);
  } finally { await new Promise(r => server.close(r)); fs.rmSync(STORE_PATH, { force: true }); }
});
