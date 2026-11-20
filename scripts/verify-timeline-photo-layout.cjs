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
// Opening anchor montage: keep the school-era silhouette taller and more
// prominent than the pro action cutout at phone, tablet and desktop sizes.
// Extra HS-box width prevents wide/diving poses from becoming tiny; only
// opening anchor classes change, never season or memory silhouettes.
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-now\) \{ position:absolute;[^\n]*height:48%/);
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-now\) \{ left:calc\(53% - 32px - 800px\); width:800px; height:43%/);
// Preserve the exact HS horizontal framing from the first, better preview
// at every viewport; only height, name layering and fade are changed.
assert.ok(rail.includes('.zt-moment-cta { position:absolute; z-index:6;'), 'player name must be in front of school photo');
assert.ok(rail.includes('left:calc(var(--hero-copy-left) + 4px - clamp(400px,58cqw,680px)); width:clamp(400px,58cqw,680px); height:118%; bottom:-4%;'), 'desktop HS cutout must actually grow');
assert.ok(rail.includes('left:calc(32% + 4px - clamp(400px,60cqw,600px));'), 'tablet HS horizontal position restored');
assert.ok(rail.includes('left:calc(53% + 8px - clamp(380px,98cqw,600px)); width:clamp(380px,98cqw,600px);'), 'phone HS cutout clears headline');
assert.ok(rail.includes('left:calc(48% + 6px - clamp(420px,80cqw,640px));'), 'transition viewport HS cutout clears headline');
assert.ok(rail.includes('height:118%;bottom:-4%;object-position:right bottom;'), 'transition viewport HS cutout retains height');
assert.ok(rail.includes('.zt-person-now:not([data-fallback="true"])'), 'fade applies only to action photos');
assert.ok(rail.includes('mask-image:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.72) 9%, #000 20%'), 'hard crop must be feathered');
console.log('PASS: shared Story photos and timeline month thumbnails use fixed, uncropped heights');
