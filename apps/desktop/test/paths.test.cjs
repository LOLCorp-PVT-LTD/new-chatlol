const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveRendererPath, deepLinkToRoute } = require('../lib/paths.cjs');

const root = '/app/renderer';
const files = new Set([path.join(root, 'index.html'), path.join(root, '_expo/static/js/web/entry.js')]);
const exists = (p) => files.has(p);

test('serves real files', () => {
  assert.equal(resolveRendererPath(root, 'app://chatlol/_expo/static/js/web/entry.js', exists), path.join(root, '_expo/static/js/web/entry.js'));
});
test('SPA routes fall back to index.html', () => {
  assert.equal(resolveRendererPath(root, 'app://chatlol/u/mia.goldenhour', exists), path.join(root, 'index.html'));
  assert.equal(resolveRendererPath(root, 'app://chatlol/', exists), path.join(root, 'index.html'));
});
test('blocks traversal', () => {
  assert.equal(resolveRendererPath(root, 'app://chatlol/..%2F..%2Fetc%2Fpasswd', () => true), path.join(root, 'index.html'));
});
test('deep links', () => {
  assert.equal(deepLinkToRoute('chatlol://u/mia.goldenhour'), '/u/mia.goldenhour');
  assert.equal(deepLinkToRoute('chatlol:///p/p_123'), '/p/p_123');
  assert.equal(deepLinkToRoute('chatlol://drops'), '/drops');
  assert.equal(deepLinkToRoute('chatlol://vault?purchase=success'), '/vault?purchase=success');
  assert.equal(deepLinkToRoute('chatlol://vault?x=<b>'), '/vault');
  assert.equal(deepLinkToRoute('https://evil.com'), null);
  assert.equal(deepLinkToRoute('chatlol://x/<script>'), null);
});
