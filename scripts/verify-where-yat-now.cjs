// Build gate for the shared, signed-in retired-alumni contribution workflow.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = p => fs.readFileSync(p, 'utf8');
const drawer = read('src/components/yatstats/WhereYatNowDrawer.tsx');
const flip = read('src/components/yatstats/FunZone.tsx');
const flipCss = read('src/components/yatstats/FunZone.css');
const profile = read('src/components/yatstats/WhereYatProfilePanel.tsx');
const card = read('src/components/yatstats/WhereYatProofCard.tsx');
const submit = read('src/app/api/contribute/where-yat-now/route.ts');
const review = read('src/app/[hsid]/contribute-review/ReviewQueue.tsx');
const endpoint = read('src/app/api/contribute/where-yat-now/status/route.ts');
const privateProof = read('src/app/api/contribute/where-yat-now/proof/route.ts');
const links = read('src/lib/whereYatLinks.ts');
const ahead = drawer.indexOf('const data = new FormData(event.currentTarget)');
const asyncAuth = drawer.indexOf('await auth.authStateReady?.();',drawer.indexOf('async function submit'));
assert(ahead > -1 && ahead < asyncAuth,'FormData must be captured before async Firebase auth');
assert(drawer.includes('if (!token) {'),'Submission must require a signed-in fan');
assert(drawer.includes('pendingAfterSignIn.current = d'),'Sign-in must preserve targeted alumnus');
assert(drawer.includes('onAuthStateChanged'),'After sign-in, resume intended alumni form');
assert(drawer.includes('https://yatstats.com/partners/'),'Corporate partner destination required');
assert(!drawer.includes('#145a3c') && !drawer.includes('sec-partner'),'Legacy form styling and link must be gone');
assert(flip.includes('WhereYatFunZonePanel'),'Retired CTA missing');
const retiredPanel = read('src/components/yatstats/WhereYatFunZonePanel.tsx');
assert(retiredPanel.includes("state === 'unclaimed'") && retiredPanel.includes("state !== 'approved'"),'Unclaimed/pending graphic state selection must remain explicit');
assert(retiredPanel.includes("const WAITING_APPROVAL_ART = '/img/where-yat-now/waiting-approval.png'"),'Pending state must use the supplied approval graphic');
assert(flip.includes("alumniUpdate?.status === 'approved'"),'Retired approved state missing');
assert(read('src/components/yatstats/WhereYatFunZonePanel.tsx').includes('href={profileHref}'),'Flip CTA must open full profile questionnaire');
assert(!flip.includes("background:'#145a3c'"),'Legacy green CTA must be gone');
assert(profile.includes('https://yatstats.com/partners/'),'Profile partner link must use corporate site');
assert(submit.includes("const publicationStatus = 'pending';") && submit.includes('pending: true, published: false'),'Retired alumni must be reviewed for identity before publication');
assert(submit.includes("partnerHref: 'https://yatstats.com/partners/'"),'Server partnership link mismatch');
assert(drawer.includes('normalizeWhereYatLink(field,'),'Client must normalize handles');
assert(drawer.includes("name === 'displayName' ? fan.name"),'Contributor name must be prefilled');
assert(drawer.includes("name === 'email' ? fan.email"),'Email must be prefilled');
assert(drawer.includes('setFieldError(field)'),'Show which social field failed');
assert(submit.includes('normalizeWhereYatLink(field, fields[field])'),'Server must normalize independently');
assert(submit.includes('error: result.error, field'),'Server should report specific invalid field');
assert(links.includes('value.replace(/^httpa:'),'Known httpa typo must be handled');
assert(links.includes("if (value.startsWith('@'))"),'Support @ handles');
assert(links.includes("if (!value) return { url: '' }"),'Optional links should not be required');
assert(card.includes('aspect-ratio:5 / 7'),'Proof must use actual 5:7 card aspect ratio');
assert(card.includes('PlayerCardBackHero'),'Proof must use the real player back photo');
assert(card.includes('wyn-footer'),'Proof must match the actual lower tabs');
assert(card.includes('logoUrl'),'Proof must support company logos');
assert(card.includes("variant === 'content'"),'Approved card must reuse contents without duplicate hero');
assert(drawer.includes('name="companyLogo"'),'Form must expose optional company logo upload');
assert(drawer.includes('logoPreview'),'Contributor must see logo in their proof');
assert(submit.includes('company_logo_key,company_logo_url'),'Logo and photo fields must be stored separately');
assert(submit.includes("['image/jpeg','image/png','image/webp']"),'Logo file types must be restricted');
assert(submit.includes('png({ compressionLevel: 9 })'),'Logo must be rasterized to a PNG');
assert(review.includes('company_logo_url'),'Reviewer must see submitted company logo');
assert(endpoint.includes('company_logo_url'),'Approved flip card must receive company logo');
assert(privateProof.includes('contributor_uid=$2'),'Private proof must be account restricted');
assert(flip.includes("activeTab!=='schedule'"),'Status queries must be lazy');
assert(flip.includes('auth.currentUser?.getIdToken()'),'Pending status must use Firebase fan identity');
console.log('PASS shared retired alumni 5:7 proof, logo, auth, CTA/pending/approval, moderation and review');

const claim = read('src/components/yatstats/WhereYatClaimForm.tsx');
assert(claim.includes('favoriteHs') && claim.includes('favoriteAfter') && claim.includes('teammateTips'), 'Complete life questionnaire and private teammate tips');
assert(claim.includes('lifePhotos'),'Allow multiple life photos');
assert(claim.includes('businessPublic'),'Optional business promotion requires consent');

const fzPanel=read('src/components/yatstats/WhereYatFunZonePanel.tsx');
assert(fzPanel.includes("state !== 'approved'") && fzPanel.includes("state === 'unclaimed'") && fzPanel.includes("state: WhereYatFunZoneState"),'Retired unclaimed/pending/approved branches must be present');
for (const asset of ['claim-profile.png','waiting-approval.png']) {
 const path='public/img/where-yat-now/'+asset;
 assert(fs.existsSync(path),'Required repo graphic missing: '+path);
 const png=fs.readFileSync(path);
 assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Retired card art is not a valid PNG: '+path);
 assert(png.length>10000,'Retired card image is unexpectedly small: '+path);
}
assert(fzPanel.includes('href={profileHref}'),'Retired graphic must remain an actionable link');
assert(flip.includes('TABS.map((tab)'),'Use existing six FunZone tab controls');
assert((flip.match(/id: "(schedule|stats|news|social|connect|upload)"/g)||[]).length===6,'Preserve exactly six FunZone tab definitions');
assert(flip.includes('onClick={() => setActiveTab(tab.id)}'),'Keep real tab interactions');
assert(flipCss.includes('flex-shrink:0;') && flip.includes('fz-tab-strip'),'Reserve nav area at all scales');
assert(!fzPanel.includes('yslogo.png') && !fzPanel.includes('wyn-fz-brand'), 'Published retired flip card must not add a duplicate YAT?STATS / WHERE YAT NOW header');
assert(fzPanel.includes('className="wyn-proof-cta"'), 'Published CTA must use the exact proof CTA style');
assert(!fzPanel.includes('.wyn-fz-approved-content .wyn-heading') && !fzPanel.includes('.wyn-fz-approved-content .wyn-story'), 'Published view must not shrink or restyle proof headings and story');
assert(card.includes('wyn-business-names') && !card.includes('-webkit-line-clamp:2'), 'Company names must wrap rather than be clipped');
assert(!card.includes('.wyn-embedded .wyn-social{'), 'Embedded published social icons must match the proof sizing');
assert(card.includes('.split(/\\s*\\|\\s*/)') && card.includes('wyn-info-panel'), 'Each business name gets its own line in the mockup info panel');
assert(!card.includes('clamp(') || !card.slice(card.indexOf('.wyn-body{'),card.indexOf('.wyn-footer{')).includes('clamp('), 'Card body scales purely with card width so proof and published match');
assert(read('src/app/api/contribute/where-yat-now/route.ts').includes("500,750,'png'"), 'Business headshots must keep their transparent background');
assert(card.includes('grid-template-columns:repeat(var(--wyn-business-link-count,1)'), 'Business and social links share equally sized tracks');
console.log('PASS published retired flip card matches proof typography and spacing without duplicate branding');

// One retired-alumni layout for everyone: printed answers have hard limits,
// enforced in the drawer and on the server, and the proof uses the same
// memory headings as the published card.
{
  const limits = read('src/lib/whereYatPrompts.ts');
  const unified = read('src/components/yatstats/WhereYatUnifiedDrawer.tsx');
  assert(/WHERE_YAT_MEMORY_MAX_CHARS = 300;/.test(limits) && /businessLine: 34,/.test(limits) && /occupation: 32,/.test(limits), 'Card limits measured on Nov 2 2026 (300-char memory, 34-char business lines, 32-char profession) must not be raised without re-measuring the card');
  assert(submit.includes('whereYatLimitProblem(') && submit.includes('if (tooLong) return reply(tooLong);'), 'Server must refuse answers that do not fit the card');
  assert(unified.includes('whereYatLimitProblem(') && unified.includes('cardLimits[key]') && unified.includes('WHERE_YAT_LIMITS.businessLine'), 'Drawer must show and enforce the card limits');
  assert(unified.includes('storyPrompt:whereYatCardHeading(selected)') && flip.includes('whereYatCardHeading(alumniUpdate.featured_memory_key)'), 'Proof and published card must use the same memory heading');
  assert(card.includes('storyText.length>WHERE_YAT_MEMORY_MAX_CHARS?'), 'Memories within the limit print at full size');
  assert(unified.includes("form.set('businessHeadshot',headshot,"), 'Transparent PNG/WebP headshots are sent without flattening to JPEG');
}
console.log('PASS retired card limits keep one layout for every alum');

// Pete, Nov 2 2026: the unclaimed "Where YAT now?" graphic on a retired card's
// back takes the alum to their player profile on the YAT? tab (where the
// questions are), not straight into the flip-card designer drawer.
{
  const panel = read('src/components/yatstats/WhereYatFunZonePanel.tsx');
  assert(!panel.includes('openContribute') && !panel.includes('preventDefault'), 'Where YAT card graphic must link to the profile, not open the drawer');
  assert(flip.includes('#ppTab-schedule`}'), 'Where YAT card graphic must open the profile on the YAT? tab');
}
console.log('PASS Where YAT card graphic opens the player profile YAT? tab');
