// Regression (Nov 12 2026): on real phones the page-load drawer reset closed
// the JOIN drawer that a ?join=1 link (Hamilton golf QR code) had opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../src/lib/touchDrawerReset.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const out = { exports: {} };
vm.runInNewContext(js, { exports: out.exports, URLSearchParams }, { filename: 'touchDrawerReset.js' });
const { touchLoadDrawerClassesToClear: clear } = out.exports;

assert.ok(clear('').includes('drawer-account-open'), 'a plain load still closes the account drawer');
assert.ok(clear('?team=2017').includes('drawer-account-open'));
assert.ok(clear('?join=0').includes('drawer-account-open'));
assert.ok(!clear('?join=1').includes('drawer-account-open'), '?join=1 keeps the JOIN drawer open');
assert.ok(!clear('?join=1&utm_source=hamilton_golf&utm_medium=qr&utm_campaign=golf_2026').includes('drawer-account-open'), 'the golf QR link keeps it open');
assert.ok(!clear('?utm_source=x&join=1').includes('drawer-account-open'));
for (const name of ['drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open', 'yat-desktop-docked-drawers']) {
  assert.ok(clear('?join=1').includes(name), `${name} is still cleared on a join link`);
}

const controller = fs.readFileSync(path.resolve(__dirname, '../src/components/yatstats/DrawerRailController.tsx'), 'utf8');
assert.match(controller, /classList\.remove\(\.\.\.touchLoadDrawerClassesToClear\(window\.location\.search\)\)/, 'the controller uses the shared rule');
console.log('touch drawer reset: ok');
