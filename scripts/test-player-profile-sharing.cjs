// Static contract checks for player profile Open Graph metadata and short URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const page = read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const short = read('src/app/[hsid]/p/[playerId]/route.ts');
const og = read('src/app/api/og/player-profile/route.tsx');
const helper = read('src/lib/playerProfileShare.ts');
assert.match(page, /if \(!storyId\) return defaultPlayerShareMetadata\(/, 'ordinary player links must have metadata');
assert.match(page, /if \(!r\) return defaultPlayerShareMetadata\(/, 'missing stories must fall back to player metadata');
assert.match(page, /openGraph:[\s\S]*images: \[\{ url: info\.image, width: 1200, height: 630/, 'player OG card must be large');
assert.match(page, /twitter:[\s\S]*summary_large_image/, 'SMS/social sharing should use a large image');
assert.match(short, /status: 307/, 'humans should be redirected to player profile');
assert.match(short, /og:image/, 'preview crawlers need image metadata');
assert.match(helper, /\/api\/og\/player-profile\?playerId=/, 'OG image endpoint must be used');
assert.match(og, /then-web/, 'preview should reuse the HS cutout');
assert.match(og, /back-web/, 'preview should reuse the current-era cutout');
assert.match(og, /new ImageResponse/, 'player-specific image must be rendered');
console.log('Player profile share preview contracts pass.');
