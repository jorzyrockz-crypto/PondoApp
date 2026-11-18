const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('installed Pondo allows device rotation without changing its identity or scope', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.id, '/PondoApp/');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './index.html');
});
