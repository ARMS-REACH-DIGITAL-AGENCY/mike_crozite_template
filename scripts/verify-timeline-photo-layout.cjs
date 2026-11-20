// Regression contract: player Story photos and timeline month photos retain their full aspect ratio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const feed = fs.readFileSync('src/components/yatstats/StoriesFeed.tsx','utf8');
const rail = fs.readFileSync('src/components/yatstats/ZoomableCareerTimeline.tsx','utf8');
for (const rule of [
  /--ysf-story-photo-h:min\(420px,56\.25cqw\)/,
  /\.ysf-photos-item \{[^\n]*height:var\(--ysf-story-photo-h\)/,
  /\.ysf-card-image \{[^\n]*height:var\(--ysf-story-photo-h\)/,
  /\.ysf-photos-item img \{[^\n]*object-fit:contain/,
  /\.ysf-card-image img \{[^\n]*object-fit:contain/,
  /\.ysf-card-image img \{[^\n]*min-width:0; min-height:0; object-fit:contain/,
  /\.ysf-photos-item img \{[^\n]*min-width:0; min-height:0;/,
]) assert.match(feed, rule, 'Story photos must retain common uncropped height');
assert.match(rail, /image: story\.photos\?\.\[0\]\?\.web \|\| story\.photos\?\.\[0\]\?\.full/);
assert.doesNotMatch(rail, /src=\{stories\[0\]\.thumb\}/);
assert.match(rail, /width:auto; height:26px; max-width:none; max-height:none/);
assert.match(rail, /height:18px; max-width:none; max-height:none/);

/* Montage regression: only shift the smaller current/back image 10px left,
   preserving every player's high-school position and original 104% height.
   The fade must exclude fallback headshots; no other timeline image changes. */
const oldHsRules = [
  '.zt-person-stack :global(.zt-person) { position:absolute; left:calc(var(--hero-copy-left) - 8px - clamp(150px,18cqw,252px)); bottom:-4%; width:clamp(150px,18cqw,252px); height:104%;',
  '.zt-person-stack :global(.zt-person-then) { left:calc(var(--hero-copy-left) - 8px - clamp(200px,22cqw,300px)); width:clamp(200px,22cqw,300px); }',
  '.zt-person-stack :global(.zt-person-then) { left:calc(53% - 4px - clamp(130px,40cqw,170px)); width:clamp(130px,40cqw,170px);',
  '.zt-person-stack :global(.zt-person-then) { left:calc(32% - 8px - clamp(170px,30cqw,240px)); width:clamp(170px,30cqw,240px);'
];
for (const rule of oldHsRules) assert.ok(rail.includes(rule), 'HS cutout dimensions must remain unchanged');
for (const rule of [
  'left:calc(var(--hero-copy-left) - 34px - 800px); width:800px; bottom:20px; height:55%;',
  'left:calc(32% - 34px - 800px); width:800px;',
  'left:calc(53% - 34px - 800px); width:800px; height:48%; bottom:8px;',
  'left:calc(48% - 34px - 800px);width:800px;height:48%;bottom:8px;'
]) assert.ok(rail.includes(rule), 'only action image receives 10px left shift');
assert.ok(rail.includes('.zt-person-now:not([data-fallback="true"])'), 'fade must not apply to clean fallback portraits');
assert.ok(rail.includes('mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.72) 9%,#000 20%,#000 100%);'), 'foreground edge feather present');
assert.doesNotMatch(rail, /height:118%;|height:122%;/, 'never restore unsafe shared HS enlargement');

console.log('PASS: shared Story photos and timeline month thumbnails use fixed, uncropped heights');
