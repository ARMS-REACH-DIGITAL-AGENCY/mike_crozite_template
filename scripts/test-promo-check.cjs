// Pete (Nov 12 2026): the JOIN form's APPLY button checks a promo code before
// the account exists, so the Superfan button can read FREE instead of $2.99/MO.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../src/lib/promo.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const out = { exports: {} };
const stubs = { '@/lib/db': { query: async () => ({ rows: [] }) }, '@/lib/armsProfileSync': { syncUserProfileToArms: async () => {} } };
vm.runInNewContext(js, { exports: out.exports, require: (id) => stubs[id], console }, { filename: 'promo.js' });
const { checkPromoCode } = out.exports;

assert.equal(checkPromoCode('WOODY10RINGS').ok, true, 'the Hamilton code is valid');
assert.equal(checkPromoCode('  woody10rings ').ok, true, 'case and spaces do not matter');
assert.equal(checkPromoCode('WOODY10RINGS').lifetime, true);
assert.equal(checkPromoCode('WOODY10').ok, false);
assert.equal(checkPromoCode('').ok, false);

const drawer = fs.readFileSync(path.resolve(__dirname, '../src/components/AccountDrawer.tsx'), 'utf8');
assert.match(drawer, /fetch\('\/api\/promo\/check'/, 'the JOIN form checks the code');
assert.match(drawer, /joinPromoState === 'valid' \? 'BECOME A SUPER FAN — FREE' : 'BECOME A SUPER FAN — \$2\.99\/MO'/, 'the Superfan button reads FREE only after a valid code');
const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/promo/check/route.ts'), 'utf8');
assert.doesNotMatch(route, /redeemPromoCode|query\(/, 'checking never redeems or writes');
console.log('promo check: ok');
