'use strict';
// Guard against a transparent gap above the Teammates sticky header.
// The parent is the scrollport. Padding above its content lets names move
// through that gap while the sticky child starts below it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const stories = read('src/components/yatstats/StoriesFeed.tsx');
const drawer = read('src/components/yatstats/TeammatesList.tsx');

assert.match(stories, /\.ytd-scroll \{[^\n]*padding:\s*0 22px/, 'No exposed scrollport top padding');
assert.doesNotMatch(stories, /\.ytd-scroll \{[^\n]*padding-top:\s*(?:16|22)px/, 'Desktop cannot restore a top scroll gap');
assert.match(drawer, /\.ytm-sticky \{[^\n]*position:sticky;top:0;z-index:2;padding:22px 34px 10px 0;background:var\(--ytm-bg,#111\)/,
  'Opaque mobile sticky header covers the former 22px gap');
assert.match(stories, /\.ytd-panel \.ytm-sticky \{ padding-top:16px; \}/,
  'Desktop sticky header owns its 16px offset');
assert.match(stories, /\.ytd-close \{[^\n]*z-index: 3/,
  'Close button stays above the sticky header');
assert.match(stories, /body\.light-theme \.ytd-panel \{/,
  'Both light and dark drawer background variables remain intact');
assert.match(drawer, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'Two-column directory is unchanged');
console.log('Teammates sticky header scroll coverage contract passed');
