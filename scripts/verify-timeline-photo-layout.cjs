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

// Sparse profiles must not enlarge timeline logos to an entire year segment.
// Keep season marks centered on their year tick and capped on desktop/phone.
assert.ok(rail.includes('width: `min(44px, ${100 / Math.max(1, model.slides.length - 1)}%)`'), 'rail marks must never grow with sparse year spacing');
assert.match(rail, /\.zt-rail-dash-logo \{[^\n]*max-width:44px;[^\n]*transform:translateX\(-50%\)/, 'rail marks are centered above their own year tick');
assert.match(rail, /\.zt-rail-dash-logo \{ max-width:28px; max-height:28px; \}/, 'mobile marks use a smaller cap');

console.log('PASS: timeline rail logos remain capped, centered, and mobile-safe');
console.log('PASS: shared Story photos and timeline month thumbnails use fixed, uncropped heights');
