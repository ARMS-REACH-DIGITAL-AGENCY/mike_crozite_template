'use strict';
// Prevent independent preview branches from accidentally reverting the
// owner-approved player profile controls and Career Timeline anchor pair.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const stories = read('src/components/yatstats/StoriesFeed.tsx');
const bar = read('src/components/yatstats/shell/SchoolContextBar.tsx');
const timeline = read('src/components/yatstats/ZoomableCareerTimeline.tsx');
const search = read('src/components/yatstats/SearchDrawerTabs.tsx');
const teamApi = read('src/app/api/teams/search/route.ts');
const jsx = stories.slice(stories.indexOf('<div className="ysf-tools"'), stories.indexOf('<div className="ysf-main">'));
const positions = ['<SortToggle', 'className="ysf-add-btn"', 'className="ysf-search"', 'className="ysf-tm-btn"'].map(s => jsx.indexOf(s));
assert.ok(positions.every((n,i) => n >= 0 && (i === 0 || n > positions[i-1])), 'Sort, Add Story, Search, icon + count in one toolbar');
assert.match(jsx,/openStoryDrawer\(\{ playerId, year: null \}, storyOpenOwner\)/,'Story toolbar opens real player-scoped upload drawer');
assert.doesNotMatch(jsx,/>\s*Teammates\s*</i,'No visible Teammates label');
assert.doesNotMatch(bar,/yat-profile-memory-cta|openStoryDrawer/,'Upload CTA does not return to school header');
assert.match(timeline,/webCutoutUrl\('then', playerId\)/,'Primary HS front cutout retained');
assert.match(timeline,/webCutoutUrl\('back', playerId\)/,'Secondary image prefers action cutout');
assert.match(timeline,/players\/back-card\//,'Falls back to actual card-back action photo');
assert.match(timeline,/players\/back\//,'Falls back to original action photo');
assert.match(timeline,/fallbackAt=\{4\}/,'Headshot only after 4 back photo sources');
assert.match(timeline,/\.zt-nav \{ position:absolute; z-index:7; top:50%; bottom:auto;/,'Arrows inside slide');
assert.match(timeline,/\.zt-nav \{ top:50%; bottom:auto; \}/,'Arrows not moved back to rail on phones');
assert.match(timeline,/left:calc\(32% - 24px - 800px\)/,'Tablet/medium photo clears copy');
assert.match(timeline,/left:calc\(58% - 24px - 800px\)/,'Mobile photo clears copy');
assert.match(timeline,/left:calc\(51% - 24px - 800px\)/,'560-740px photo clears copy');
assert.match(teamApi,/nextOffset/,'Team search returns continuation token');
assert.match(search,/loadNextTeamPage/,'Live search scrolls all pages');

// One master preview, one Contribute visual system: protect all six profile tabs.
const teammateDrawer = read('src/components/yatstats/TeammatesList.tsx');
const profileCleanup = read('src/components/yatstats/ProfileFunZoneCleanupStyles.tsx');
const stats = read('src/components/yatstats/ProfileStatsInjector.tsx');
const schedules = read('src/components/yatstats/PlayerScheduleTable.tsx');
const footer = read('src/components/yatstats/ProfileFunZoneStabilizer.tsx');
const account = read('src/components/AccountDrawer.tsx');
const page = read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
assert.match(teammateDrawer,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Teammates directory must keep both columns');
assert.match(teammateDrawer,/\.ytm-title \{[^\n]*font:800 20px[^\n]*--yat-font-ui/,'Teammates heading must stay Archivo');
assert.doesNotMatch(teammateDrawer,/Bebas Neue|Oswald|#ffc107/,'Teammates legacy heading or yellow forbidden');
assert.match(profileCleanup,/Approved clean Stats table: no zebra stripes/,'Stats flat styling is not optional');
assert.doesNotMatch(profileCleanup,/#d2b45c|#eadfbf|#d9c68e|#f7f1e4|#e5c569|#f1d891/,'Stats cleanup cannot restore golden shading');
assert.doesNotMatch(stats,/--psi-total-bg: rgba\(214, 178, 83|--psi-head-bg-a: #eadfbf/,'Stats total and headers stay monochrome');
assert.match(stats,/--psi-cell-bg-alt: #101010/,'Dark Stats rows have one neutral surface');
assert.match(stats,/--psi-cell-bg-alt: #fff/,'Light Stats rows have one neutral surface');
assert.doesNotMatch(schedules,/Oswald|rgba\(214,178,83/,'Game Log header and tags cannot restore old font or gold border');
assert.match(footer,/#ffb238/,'Restore original illuminated orange ticker icons');
assert.match(footer,/#ff7a1a/,'Restore original orange Doto labels');
assert.match(footer,/#d2b45c/,'Restore ticker active underline');
assert.doesNotMatch(page,/Bebas Neue|Oswald/,'All player tab content remains Archivo');
assert.doesNotMatch(timeline,/Bebas Neue|Oswald|#d6b253/,'Timeline typography stays Archivo; no bronze gold');
assert.match(timeline,/const TIMELINE_ACCENT = '#ffb21c';/,'Approved orange-gold accent remains');
for (const cls of ['.zt-kick {','.zt-rail-track {','.zt-persist-status {','.zt-persist-classof {']) {
  const rule = timeline.slice(timeline.indexOf(cls),timeline.indexOf('}',timeline.indexOf(cls)));
  assert.match(rule,/color:\$\{TIMELINE_ACCENT\}|background:\$\{TIMELINE_ACCENT\}/,'Accent still applied to '+cls);
}
assert.doesNotMatch(account,/Bebas Neue|Oswald/,'Login/Account typography stays Archivo');
assert.match(stories,/className="ysf-tm-btn"/,'Teammate icon remains beside search');
const newsReader = read('src/components/yatstats/ProfileContentDrawer.tsx');
const newsList = read('src/components/yatstats/ProfileNewsList.tsx');
assert.doesNotMatch(newsReader,/Bebas Neue|Oswald|#ffc107|#9a6f00|#f4efe5|#fffdf8|#e9e1d3/,'News reader has no legacy font or cream/gold');
assert.match(newsReader,/font:800 20px\/1\.17 var\(--yat-font-ui,Archivo,Arial,sans-serif\)/,'News drawer title uses Archivo');
assert.match(newsList,/\.pp-news-reader-copy\{font-family:var\(--yat-font-ui,Archivo,Arial,sans-serif\)\}/,'Full-story body uses Archivo; news cards unchanged');
console.log('Approved selective orange accents + neutral Archivo News reader regression checks passed');
console.log('Contribute monochrome styles, flat Stats/Schedules and player tabs regression checks passed');

console.log('Profile Stories/Timeline/Global Search regression checks passed');
