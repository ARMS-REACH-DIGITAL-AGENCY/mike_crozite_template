'use strict';
// The visible Fantasy ledger and tournament scorer must use the same
// owner-approved Active Alumni predicate; never rewrite player status data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('src/lib/galleryStatuses.ts');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const out = { exports: {} };
vm.runInNewContext(js, { exports: out.exports, console }, { filename: 'galleryStatuses.js' });
const { isActiveGalleryStatus } = out.exports;
for (const status of ['ACTIVE', 'FREE AGENT', 'RED SHIRT', 'REDSHIRT-MEDICAL', '40-MAN', 'INJURED 60-DAY']) {
  assert.equal(isActiveGalleryStatus(status), true, status + ' is approved Active Alumni membership');
}
for (const status of ['RETIRED', 'RETIRED - COACH', 'UNKNOWN', 'DFA', '', undefined]) {
  assert.equal(isActiveGalleryStatus(status), false, String(status) + ' must not be silently admitted');
}
const ledger = read('src/app/api/players/[hsid]/route.ts');
const scorer = read('src/app/api/bracket/live/route.ts');
assert.match(ledger, /import \{ isActiveGalleryStatus \} from '@\/lib\/galleryStatuses'/);
assert.match(scorer, /import \{ isActiveGalleryStatus \} from '@\/lib\/galleryStatuses'/);
assert.match(ledger, /isActiveGalleryStatus\(stage\.status_label \?\? stage\.status\)/);
assert.match(scorer, /isActiveGalleryStatus\(r\.status_label\)/);
assert.doesNotMatch(ledger, /isRosterStatus\(/, 'Ledger must not silently exclude active redshirts or free agents');
console.log('PASS: Fantasy ledger and scorer share approved Active Alumni membership; redshirts/free agents retained, retired/unknown excluded without status edits');
