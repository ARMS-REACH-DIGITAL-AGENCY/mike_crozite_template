// Pete (Nov 12 2026): golf tournament sign-ups who opt in to promotional texts
// get one text with a free Superfan code. Checks who qualifies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const load = (rel, extra = {}) => {
  const js = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const out = { exports: {} };
  vm.runInNewContext(js, { exports: out.exports, URL, URLSearchParams, console, ...extra }, { filename: rel });
  return out.exports;
};
const { eventSmsOfferFor, EVENT_SMS_OFFERS } = load('src/lib/eventSmsOffers.ts');
const promo = load('src/lib/promo.ts', { require: () => ({ query: async () => ({ rows: [] }), syncUserProfileToArms: async () => {} }) });

const golf = 'https://hamilton.az.yatstats.com/?join=1&utm_source=hamilton_golf&utm_medium=qr&utm_campaign=golf_2026';
assert.ok(eventSmsOfferFor(golf, '5004'), 'golf QR sign-up at Hamilton qualifies');
assert.equal(eventSmsOfferFor(golf, 5004).promoCode, 'WOODY10RINGS', 'numeric hsid works too');
assert.equal(eventSmsOfferFor(golf, '5005'), null, 'another home school does not get the Hamilton code');
assert.equal(eventSmsOfferFor('https://hamilton.az.yatstats.com/?join=1', '5004'), null, 'no event link, no text');
assert.equal(eventSmsOfferFor('not a url', '5004'), null);
for (const [campaign, offer] of Object.entries(EVENT_SMS_OFFERS)) {
  assert.ok(promo.checkPromoCode(offer.promoCode).ok, `${campaign}: its code is a real promo code`);
  assert.match(offer.message, /YAT\?STATS/, `${campaign}: text names the sender`);
  assert.match(offer.message, /Reply STOP/, `${campaign}: text says how to opt out`);
  assert.ok(offer.message.length <= 320, `${campaign}: text fits in 2 SMS segments`);
}
const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/auth/register/route.ts'), 'utf8');
assert.match(route, /smsPromotional && synced \? eventSmsOfferFor\(/, 'the text needs promotional consent and a saved phone');
console.log('event sms offers: ok');
