const assert = require('node:assert/strict');
const { prepareEntries } = require('./refresh-school-url-directory.cjs');
const { URL } = require('node:url');
function normalizeSchoolHost(input) { return new URL(input).hostname; }
function schoolHostnamePattern(host) { return /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z]{2})\.yatstats\.com$/.test(host) ? { type:'named' } : null; }
const inputs = new Map([
  ['5004','https://hamilton.az.yatstats.com'],
  ['111','https://lincoln-san-jose.ca.yatstats.com'],
  ['112','https://lincoln-los-angeles.ca.yatstats.com'],
  ['88','https://foo.az.yatstats.com'],
  ['89','https://foo.az.yatstats.com'], // existing ambiguous URL, never pick a winner
  ['7831','https://st.-raymonds.ny.yatstats.com'], // legacy exception, preserve old resolver
]);
const result=prepareEntries(inputs,normalizeSchoolHost,schoolHostnamePattern);
assert.equal(result.entries.length,3);
assert.deepEqual(Array.from(result.entries, x => x.hsid), [111,112,5004]);
assert.equal(result.duplicates.length,1);
assert.deepEqual(Array.from(result.duplicates[0].hsids),[88,89]);
assert.equal(result.invalid.length,1);
assert.ok(!result.entries.some(x => x.hostname==='foo.az.yatstats.com'));
console.log('PASS: stable directory, city disambiguation, duplicate quarantine, invalid legacy fallback');
