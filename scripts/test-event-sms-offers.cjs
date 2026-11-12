// Pete (Nov 12 2026): the golf QR link applies the free Superfan code on the
// JOIN form, and every fan who joins with SMS consent gets one thank-you text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const load = (rel, modules = {}) => {
  const js = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const out = { exports: {} };
  vm.runInNewContext(js, { exports: out.exports, require: (id) => modules[id], URL, URLSearchParams, console }, { filename: rel });
  return out.exports;
};
const fanConsent = load('src/lib/fanConsent.ts');
const offers = load('src/lib/eventSmsOffers.ts', { '@/lib/fanConsent': fanConsent });
const promo = load('src/lib/promo.ts', { '@/lib/db': { query: async () => ({ rows: [] }) }, '@/lib/armsProfileSync': { syncUserProfileToArms: async () => {} } });

const golf = 'https://hamilton.az.yatstats.com/?join=1&utm_source=hamilton_golf&utm_medium=qr&utm_campaign=golf_2026';
assert.ok(offers.eventSignupOfferFor(golf, '5004'), 'golf QR at Hamilton is an event sign-up');
assert.ok(offers.eventSignupOfferFor(golf, 5004), 'numeric hsid works');
assert.equal(offers.eventSignupOfferFor(golf, '5005'), null, 'not at another school');
assert.equal(offers.eventSignupOfferFor('https://hamilton.az.yatstats.com/?join=1', '5004'), null, 'no event link, no event offer');
assert.equal(offers.eventSignupOfferFor('not a url', '5004'), null);

for (const [campaign, offer] of Object.entries(offers.EVENT_SIGNUP_OFFERS)) {
  assert.ok(promo.checkPromoCode(offer.promoCode).ok, `${campaign}: its code is a real promo code`);
}
const plain = offers.welcomeSmsMessage('Hamilton High School', null);
const event = offers.welcomeSmsMessage('Hamilton High School', offers.eventSignupOfferFor(golf, '5004'));
for (const text of [plain, event, offers.welcomeSmsMessage(null, null)]) {
  assert.match(text, /^YAT\?STATS: /, 'names the sender first');
  assert.match(text, /Reply HELP for help, STOP to opt out\./, 'HELP and STOP');
  assert.match(text, /Msg & data rates may apply/, 'rates');
  assert.ok(text.length <= 320, 'fits in 2 SMS segments: ' + text.length);
}
assert.match(plain, /Welcome to Hamilton Baseball!/);
assert.match(event, /golf tournament/);

const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/auth/register/route.ts'), 'utf8');
assert.match(route, /if \(synced\) \{[\s\S]*?sendYatstatsSms\(profile\.arms_contact_id, welcomeSmsMessage\(/, 'the thank-you is sent only after consent is saved and the phone is on the ARMS contact');
const drawer = fs.readFileSync(path.resolve(__dirname, '../src/components/AccountDrawer.tsx'), 'utf8');
assert.match(drawer, /setPromoCode\(offer\.promoCode\);\s*setJoinPromoState\('valid'\);/, 'the event link fills in and applies the code');
console.log('event sign-ups and thank-you text: ok');
