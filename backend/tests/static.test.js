const os = require('node:os');
const path = require('node:path');
process.env.DUKA_STORE_PATH = path.join(os.tmpdir(), `duka-static-${process.pid}.json`);
process.env.DUKA_SKIP_ENV_FILE = '1';
process.env.LOG_REQUESTS = 'false';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

test('the site is served, and nothing outside it is', async () => {
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = p => fetch(base + p);
  try {
    const home = await get('/'); assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/);
    assert.equal((await get('/login.html')).status, 200);
    const css = await get('/css/base.css'); assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
    assert.equal((await get('/js/api.js')).status, 200);
    for (const secret of ['/.env', '/.env.example', '/backend/server.js', '/backend/data/store.json', '/package.json', '/ToDo.md', '/.git/config', '/js/../backend/server.js', '/%2e%2e/backend/server.js', '/js/..%2fbackend%2fserver.js', '/nope.html']) {
      const r = await get(secret);
      assert.notEqual(r.status, 200, `${secret} must not be served`);
    }
    assert.equal((await get('/api/v1/health')).status, 200, 'the API still answers');
  } finally { await new Promise(r => server.close(r)); }
});
