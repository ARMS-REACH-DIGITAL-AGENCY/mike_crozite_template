/* Focused server/public-boundary checks. No database or email service is loaded. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  const resolved = path.resolve(root, file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const compiledModule = { exports: {} }; cache.set(resolved, compiledModule);
  const output = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireModule = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(resolved), name + '.ts'))) : require(name);
  new Function('require', 'module', 'exports', output)(requireModule, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { sponsorCardInput, sponsorCardReadiness } = load('src/lib/partners/sponsorCardValidation.ts');
const { isSponsorCardPublic, SPONSOR_CARD_SHARE_DEFAULTS } = load('src/lib/partners/sponsorCardTypes.ts');
const { readSponsorCard, sponsorCardCopy } = load('src/lib/partners/sponsorCardPresentation.ts');
const base = { sponsorId: '1', firstName: 'Example', lastName: 'Partner', frontImageUrl: 'https://example.invalid/front.png', frontImageAlt: 'Sponsor portrait',
  backTemplate: 'banner_text', headline: 'A hometown thank-you', body: 'An editable daily sponsor message.', level: 'SPONSOR' };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
check('SPONSOR is enforced even when the browser changes its level', () => {
  for (const level of ['MLB', 'INDY', 'NCAA-D1', 'INTERNATIONAL', '', null]) assert.equal(sponsorCardInput.safeParse({ ...base, level }).success, false);
  assert.equal(sponsorCardInput.parse(base).level, 'SPONSOR');
});
check('names and retained identity fields survive without creating player identifiers', () => {
  const card = sponsorCardInput.parse({ ...base, currentTeam: 'Local business', organization: 'Example Company', statusLabel: 'RETIRED', gradClass: '1985', varsityYears: ['1985', '1984', '1985'], playerid: '123', batting: { hits: 30 } });
  assert.deepEqual(card.varsityYears, ['1984', '1985']); assert.equal(card.statusLabel, 'RETIRED');
  assert.equal(card.playerid, undefined); assert.equal(card.batting, undefined);
});
check('drafts can be incomplete but published proofs need images and copy', () => {
  const incomplete = sponsorCardInput.parse({ sponsorId: '1' });
  assert.equal(sponsorCardReadiness(incomplete).length, 4);
  assert.deepEqual(sponsorCardReadiness(sponsorCardInput.parse(base)), []);
});
check('full-image back requires its own artwork and no text advertisement', () => {
  const full = sponsorCardInput.parse({ ...base, backTemplate: 'full_image', headline: '', body: '', fullImageUrl: 'https://example.invalid/back.png', fullImageAlt: 'Entire sponsor advertisement' });
  assert.deepEqual(sponsorCardReadiness(full), []);
  assert.equal(sponsorCardReadiness({ ...full, fullImageUrl: '' }).length, 1);
});
check('every supplied image needs accessible alternative text', () => {
  for (const [url, alt] of [['frontImageUrl', 'frontImageAlt'], ['bannerImageUrl', 'bannerImageAlt'], ['fullImageUrl', 'fullImageAlt']]) {
    assert.equal(sponsorCardInput.safeParse({ ...base, [url]: 'https://example.invalid/art.png', [alt]: '' }).success, false);
  }
});
check('executable, credential-bearing, and insecure destinations are rejected', () => {
  for (const ctaUrl of ['javascript:alert(1)', 'data:text/html,x', 'http://example.invalid', 'https://name:password@example.invalid']) {
    assert.equal(sponsorCardInput.safeParse({ ...base, ctaLabel: 'Visit', ctaUrl }).success, false);
  }
});
check('publication date windows and alumni years are validated', () => {
  assert.equal(sponsorCardInput.safeParse({ ...base, startsAt: '2027-04-01T00:00:00Z', endsAt: '2027-03-31T00:00:00Z' }).success, false);
  assert.equal(sponsorCardInput.safeParse({ ...base, gradClass: '198x' }).success, false);
  assert.equal(sponsorCardInput.safeParse({ ...base, varsityYears: Array.from({ length: 9 }, (_, i) => String(2000 + i)) }).success, false);
});
const publicCard = { ...sponsorCardInput.parse(base), id: '2', sponsorName: 'Example Partner', sponsorLogoUrl: '', revision: 1, hsid: '101' };
check('the public projection strips all unrecognized private and player fields', () => {
  const result = readSponsorCard({ ...publicCard, firebase_uid: 'private-uid', playerid: '20', html: '<script>alert(1)</script>', approvedBy: 'private-uid' });
  assert.ok(result); assert.equal(result.firebase_uid, undefined); assert.equal(result.playerid, undefined); assert.equal(result.html, undefined); assert.equal(result.approvedBy, undefined);
});
check('the iframe guard rejects malformed and executable payloads', () => {
  assert.equal(isSponsorCardPublic(publicCard), true);
  assert.equal(isSponsorCardPublic({ ...publicCard, level: 'MLB' }), false);
  assert.equal(isSponsorCardPublic({ ...publicCard, frontImageUrl: 'javascript:alert(1)' }), false);
  assert.equal(isSponsorCardPublic({ ...publicCard, schoolColor1: 'url(https://example.invalid/tracker)' }), false);
  assert.equal(isSponsorCardPublic({ ...publicCard, varsityYears: ['not-a-year'] }), false);
});
check('share promotion uses the school being previewed, with editable copy', () => {
  const share = { ...publicCard, backTemplate: 'share_promotion', headline: '', body: '', ctaLabel: '', ctaUrl: '' };
  assert.equal(sponsorCardCopy(share).headline, SPONSOR_CARD_SHARE_DEFAULTS.headline);
  assert.equal(sponsorCardCopy(share).ctaUrl, 'https://101.yatstats.com/');
  assert.equal(sponsorCardCopy({ ...share, hsid: '202' }).ctaUrl, 'https://202.yatstats.com/');
  assert.equal(sponsorCardCopy({ ...share, headline: 'Our daily message' }).headline, 'Our daily message');
});
console.log(`${checks} sponsor-card boundary checks passed. No data was written and no messages were sent.`);
