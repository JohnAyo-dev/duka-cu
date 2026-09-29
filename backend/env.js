// Minimal .env loader, so credentials can live in a file instead of having to
// be exported in the shell before every start. No dependency on purpose.
//
// - Reads `<project>/.env` (or the file named by DUKA_ENV_FILE).
// - Never overrides a variable that is already set, so a real environment
//   variable (a host's dashboard, a CI secret) always wins over the file.
// - Understands "double quoted" values that span several lines, which is how
//   the Apple .p8 key can be pasted with its real newlines.
// - Tests set DUKA_SKIP_ENV_FILE=1 so a developer's real credentials can
//   never leak into a test run.
const fs = require('node:fs');
const path = require('node:path');

function parse(text) {
  const out = {};
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"')) {
      // Quoted: keep reading lines until the closing quote.
      let body = value.slice(1);
      while (!/(^|[^\\])"\s*(#.*)?$/.test(body) && i + 1 < lines.length) body += '\n' + lines[++i];
      body = body.replace(/"\s*(#.*)?$/, '');
      value = body.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.startsWith("'")) {
      value = value.slice(1).replace(/'\s*(#.*)?$/, '');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[key] = value;
  }
  return out;
}

function load(file) {
  if (process.env.DUKA_SKIP_ENV_FILE) return {};
  const target = file || process.env.DUKA_ENV_FILE || path.join(__dirname, '..', '.env');
  let text;
  try { text = fs.readFileSync(target, 'utf8'); } catch { return {}; }
  const values = parse(text);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}

load();
module.exports = { load, parse };
