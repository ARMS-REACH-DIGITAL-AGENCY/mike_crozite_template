// Player profile News and Stories must scroll on wide screens (Nov 1, 2026).
// #604 made the inner feed body overflow:visible at >=1081px; the active
// panel must then be the scroll surface, or nothing scrolls.
const fs = require('fs');
const assert = require('assert/strict');
const page = fs.readFileSync('src/app/[hsid]/player/[playerId]/[slug]/page.tsx', 'utf8');
const wide = page.match(/@media \(min-width:1081px\) \{\s*#playerFunZone :is\(#ppTab-news,#ppTab-upload\)\.pp-fz-panel-active \{\s*overflow-y:auto!important/);
assert(wide, 'News/Stories active panel scrolls at >=1081px');
assert(page.indexOf(wide[0]) > page.indexOf("#playerFunZone :is(#ppTab-news,#ppTab-connect,#ppTab-upload).pp-fz-panel-active {\n          overflow:hidden!important;"),
  'the scroll rule comes after the older overflow:hidden rule');
console.log('PASS player profile News and Stories scroll on wide screens');
