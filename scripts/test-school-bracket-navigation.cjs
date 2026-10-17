// Check the shared HTML renderer without invoking React effects, APIs or the database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/components/yatstats/SearchDrawerTabs.tsx');
const source = fs.readFileSync(filename, 'utf8').replace("import { track } from '@/lib/analytics';", 'const track = () => {};');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require, console, URLSearchParams }, { filename });
const { renderSchoolRows } = exportsObject;
const rows = [
  { hsid: '5004', hsname: 'Hamilton', hslocation: 'Chandler, AZ', current_aa: 18, microsite_url: 'https://hamilton.az.yatstats.com/', bracket_eligible: true },
  { schoolId: '7733', schoolName: 'Campo Verde', location: 'Gilbert, AZ', current_aa: 17 },
  { hsid: '79', hsname: 'A & B "School" <test>', hslocation: 'Town, CA', microsite_url: 'https://school.yatstats.com/?team=2027#old', bracket_eligible: true },
];
const html = renderSchoolRows(rows, 'No schools', true);
assert.equal((html.match(/class="yat-search-school-bracket-link"/g) || []).length, 2);
assert.equal((html.match(/class="yat-search-school-link-guide"/g) || []).length, 0);
assert.equal((html.match(/class="yat-search-school-crest-link yat-search-school-gallery-crest-link"/g) || []).length, 2);
for (const body of html.matchAll(/<a class="yat-search-school-bracket-link"[^>]*>([\s\S]*?)<\/a>/g)) {
  assert.equal(body[1].replace(/<[^>]*>/g, '').trim(), '', 'Bracket shortcut must be icon-only.');
  assert.ok(body[1].includes('yat-bracket-symbol'));
}
assert.ok(html.indexOf('yat-search-school-bracket-link') < html.indexOf('yat-search-school-gallery-crest-link'), 'Bracket must precede the far-right school logo.');
assert.ok(html.includes('href="https://hamilton.az.yatstats.com/#sec-fantasy"'));
assert.ok(html.includes('href="https://hamilton.az.yatstats.com/#sec-active"'));
assert.ok(!html.includes('href="/7733#sec-fantasy"'));
assert.ok(!html.includes('href="/7733#sec-active"'));
assert.ok(html.includes('href="https://school.yatstats.com/?team=2027#sec-fantasy"'));
assert.ok(!html.includes('#old'));
assert.ok(html.includes('Open A &amp; B &quot;School&quot; &lt;test&gt; fantasy bracket tournament. Starts February 1st.'));
assert.ok(!html.includes('<test>'));
assert.ok(!html.includes('data-tab="fantasy"'), 'Cross-school links must not trigger the current-school tab controller.');
let openAnchors = 0;
for (const tag of html.match(/<\/?a(?:\s[^>]*)?>/g) || []) {
  if (tag.startsWith('</')) openAnchors--;
  else { assert.equal(openAnchors, 0, 'No nested anchors'); openAnchors++; }
}
assert.equal(openAnchors, 0);
const picker = renderSchoolRows(rows, 'No schools');
assert.ok(!picker.includes('yat-search-school-bracket-link'));
assert.ok(!picker.includes('yat-search-school-link-guide'));
assert.ok(picker.includes('data-school-id="5004"'));
assert.ok(picker.includes('class="yat-search-card yat-search-school-card"'));
assert.equal(renderSchoolRows([], 'No schools', true), '<div class="yat-search-empty">No schools</div>');
const unavailable = renderSchoolRows([{ hsid: null, hsname: 'No Page Yet', microsite_url: '' }], 'No schools', true);
assert.ok(!unavailable.includes('href='), 'Missing-school records must not link to the root.');
assert.ok(!unavailable.includes('yat-search-school-bracket-link'));
assert.ok(unavailable.includes('School page not available yet'));
const layout = fs.readFileSync(path.join(root, 'src/app/[hsid]/layout.tsx'), 'utf8');
assert.match(layout, /yat-drawer-fantasy-highlight[\s\S]*?data-tab="fantasy"[\s\S]*?href="#sec-fantasy"/);
assert.ok(!layout.includes('yat-drawer-fantasy-start'), 'Do not place the start date underneath the label.');
assert.ok(!layout.includes('yat-drawer-fantasy-stamp'), 'Replace the stamp rather than displaying both.');
assert.match(layout, /<FantasyNavCountdown \/>/);
assert.match(layout, /<span><strong>ALUMNI FANTASY<\/strong><\/span>\s*<span>BRACKET TOURNAMENT<\/span>/, 'Use the exact requested two-line side-navigation label.');
const timeline = fs.readFileSync(path.join(root, 'src/components/yatstats/ZoomableCareerTimeline.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/components/yatstats/DrawerLayoutOverrides.tsx'), 'utf8');
const timelineGold = timeline.match(/const TIMELINE_YELLOW = '(#[0-9a-f]+)'/)[1];
assert.ok(styles.includes(`--yat-bracket-accent: ${timelineGold};`), 'Use the actual timeline rail/status color.');
assert.match(styles, /yat-drawer-fantasy-highlight \{[^}]*border: 0;[^}]*background: none;[^}]*outline: none;/);
assert.match(source, /yat-search-school-bracket-link \{[^}]*border: 0;[^}]*background: none;[^}]*outline: none;/);
console.log('PASS: icon-only links left of logos, exact timeline gold, no box/outline styles, school URLs, escaping, unchanged picker, and February start date.');
