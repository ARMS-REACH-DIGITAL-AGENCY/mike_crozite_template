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
  assert.match(text, /YAT\?STATS/, 'names YAT?STATS');
  assert.ok(text.endsWith(offers.SMS_DISCLOSURE), 'ends with frequency, rates, HELP and STOP');
}
assert.match(plain, /^YAT\?STATS: Welcome to Hamilton Baseball!/);
assert.ok(plain.length <= 320, 'plain thank-you fits 2 segments');
assert.match(event, /14th Annual Golf Tournament/);
assert.match(event, /WOODY10RINGS/);
assert.match(offers.EVENT_SIGNUP_OFFERS.golf_2026.formNote, /^FORE!/);
assert.equal(offers.eventOfferCampaign(golf), 'golf_2026');

const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/auth/register/route.ts'), 'utf8');
assert.match(route, /if \(synced\) \{[\s\S]*?after\(async \(\) => \{[\s\S]*?sendYatstatsSms\(contactId, message\)/, 'the thank-you is sent after the response, only once consent is saved and the phone is on the ARMS contact');
assert.match(route, /const offer = smsPromotional \? eventSignupOfferFor\(/, 'the event offer line needs promotional consent');
const drawer = fs.readFileSync(path.resolve(__dirname, '../src/components/AccountDrawer.tsx'), 'utf8');
assert.match(drawer, /setPromoCode\(offer\.promoCode\);\s*setJoinPromoState\('valid'\);/, 'the event link fills in and applies the code');
assert.match(route, /const contactId = synced;/, 'the text goes to the contact that holds the phone');
const ghl = fs.readFileSync(path.resolve(__dirname, '../src/lib/gohighlevel.ts'), 'utf8');
assert.match(ghl, /const owner = await lookupGHLContactIdByPhone\(phoneE164\);[\s\S]*?if \(second\.ok\) return owner;/, 'a phone already on another contact: tag and text that contact');
// JOIN form layout (Pete, Nov 12 2026)
const order = ['name="registerPhone"', 'placeholder="Create a Password"', 'name="smsInformational"', 'value="superfan"', 'value="fan"', 'className="yat-account-promo-code"', "'school_fans'"].map((needle) => drawer.indexOf(needle));
order.forEach((at, i) => assert.ok(at > 0, 'missing piece ' + i));
assert.deepEqual([...order].sort((a, b) => a - b), order, 'phone, password, text boxes, Super Fan, Fan, promo code, FREE FOR ... FANS!');
assert.match(drawer, /join_cta: joinCta/, 'GA sign_up records the button');
assert.match(route, /yatstats:join-button:\$\{cta\}/, 'ARMS tag records the button');
assert.match(route, /yatstats:event:/, 'ARMS tag records the event');
assert.equal((drawer.match(/finishJoinDrawer\(\);/g) || []).length, 2, 'the drawer closes after both sign-up successes');
console.log('event sign-ups and thank-you text: ok');
