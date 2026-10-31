// Prevent the retired-alumni questionnaire from regressing to a standalone
// hand-styled design. The existing Photo Contribution drawer is the source of
// truth for typography, fields, section cards, buttons and responsive spacing.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = path => fs.readFileSync(path, 'utf8');
const form = read('src/components/yatstats/WhereYatClaimForm.tsx');
const drawer = read('src/components/yatstats/ContributeDrawer.tsx');
const css = read('src/app/contribution-forms.css');
const layout = read('src/app/layout.tsx');
assert(layout.includes('import "./contribution-forms.css";'), 'Shared form styling must be loaded globally');
assert(css.includes(':is(#drawerContribute, .where-yat-claim) .ycd-btn-primary'), 'Primary buttons must share one source');
assert(css.includes(':is(#drawerContribute, .where-yat-claim) .ycd-field'), 'Fields must share one source');
assert(css.includes(':is(#drawerContribute, .where-yat-claim) .ycd-label'), 'Labels must share one source');
assert(css.includes(':is(#drawerContribute, .where-yat-claim) .ycd-step'), 'Step badges must share one source');
assert(drawer.includes('className="ycd-body"') && drawer.includes('className="ycd-label"'), 'Original Contribute drawer classes unchanged');
assert(form.includes('className="where-yat-claim"'), 'Questionnaire must inherit standard Contribute styling');
assert(form.includes('className="wyn-form-section"'), 'Questionnaire must use standard section cards');
assert(form.includes('className="ycd-btn ycd-btn-primary"'), 'Submission must use canonical buttons');
assert(form.includes('className="ycd-field"'), 'Inputs must use canonical field classes');
assert(!form.includes('const style={') && !form.includes('const labelStyle='), 'Remove local hand-styled form tokens');
assert(!form.includes('style={{'), 'Avoid new inline visual styling in questionnaire');
for (const name of ['displayName','email','city','state','retirementYear','occupation','company','companyLogo','businessMessage','businessOffer','businessPublic','teammateTips','claimAttestation']) {
  assert(form.includes('name="' + name + '"'), 'Keep original questionnaire field: ' + name);
}
for (const name of ['favoriteHs','favoriteAfter','family','story']) assert(form.includes("'" + name + "'"), 'Preserve story question: ' + name);
assert(form.includes('createStoryUploadBody(data)'), 'Preserve upload format');
assert(form.includes("fetch('/api/contribute/where-yat-now'"), 'Preserve publication endpoint');
assert(form.includes('proofConfirmed'), 'Preserve proof approval');
assert(form.includes('WhereYatProofCard'), 'Preserve 5x7 card preview');
assert(css.includes('body:not(.light-theme)') && css.includes('var(--card-bg)'), 'Theme must follow site tokens');
console.log('PASS universal Contribute styling on Where YAT questionnaire (fields, proof, API, light/dark)');
