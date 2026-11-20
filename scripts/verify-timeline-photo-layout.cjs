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
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-then\) \{ left:calc\(var\(--hero-copy-left\) \+ 4px - clamp\(400px,58cqw,680px\)\)/);
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-now\) \{ position:absolute;[^\n]*height:48%/);
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-then\) \{ left:calc\(53% \+ 8px - clamp\(380px,98cqw,600px\)\)/);
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-now\) \{ left:calc\(53% - 32px - 800px\); width:800px; height:43%/);
assert.match(rail, /\.zt-person-stack :global\(\.zt-person-then\) \{\s*left:calc\(48% \+ 6px - clamp\(420px,80cqw,640px\)\)/);
console.log('PASS: shared Story photos and timeline month thumbnails use fixed, uncropped heights');
