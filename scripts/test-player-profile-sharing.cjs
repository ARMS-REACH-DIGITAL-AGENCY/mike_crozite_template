// Static contract checks for player profile Open Graph metadata and short URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const page = read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const short = read('src/app/[hsid]/p/[playerId]/route.ts');
const og = read('src/app/api/og/player-profile/route.tsx');
const helper = read('src/lib/playerProfileShare.ts');
const middleware = read('src/middleware.ts');
const nextConfig = read('next.config.ts');
const lightweight = read('src/app/api/share/player/route.ts');
assert.match(middleware, /Google-PageRenderer/, 'Google Messages renderer must receive lightweight player metadata');
assert.match(nextConfig, /Google-PageRenderer/, 'Google renderer needs OG metadata in the initial HTML head');
assert.match(lightweight, /og:image:secure_url/, 'messaging crawlers need a secure image URL');
assert.match(lightweight, /og:image:type.*image\/png/, 'messaging crawlers need the PNG image MIME type');
assert.match(helper, /schoolHostnamePattern\(hostname\)\?\.type === 'named'/, 'named school links must not prepend duplicate HSID in canonical URLs');

assert.match(page, /if \(!storyId\) return defaultPlayerShareMetadata\(/, 'ordinary player links must have metadata');
assert.match(page, /if \(!r\) return defaultPlayerShareMetadata\(/, 'missing stories must fall back to player metadata');
assert.match(page, /openGraph:[\s\S]*images: \[\{ url: info\.image, width: 1200, height: 630/, 'player OG card must be large');
assert.match(page, /twitter:[\s\S]*summary_large_image/, 'SMS/social sharing should use a large image');
assert.match(short, /status: 307/, 'human short-link visitors must redirect to the actual profile');
assert.match(short, /LINK_PREVIEW_BOT\.test/, 'messaging crawlers must receive short-link preview metadata');
assert.match(short, /og:image:secure_url/, 'short-link previews must contain the OG image directly');
assert.match(short, /summary_large_image/, 'short-link preview must request the large card');
assert.match(short, /Cache-Control': 'private, no-store'/, 'crawler metadata must never leak into human browser caches');
assert.match(short, /Location: info.url/, 'short links must target the true player profile');
assert.doesNotMatch(short, /PLAYER_PREVIEW_BOT/, 'short links must identify only known crawlers, not generic preview-like webviews');
assert.match(short, /window\.location\.replace/, 'crawler-like webviews must navigate to the real profile');
assert.match(helper, /\/api\/og\/player-profile\?playerId=/, 'OG image endpoint must be used');
const worker = read('src/app/api/cron/player-profile-snapshot/route.ts');
const queue = read('src/lib/realTimelineSnapshotQueue.ts');
const publisher = read('src/lib/publishNewPlayer.ts');
const crons = JSON.parse(read('vercel.json')).crons;
assert.match(og, /snapshotCacheKey\(hsid, playerId\)/, 'only real cached timeline screenshots are shareable');
assert.match(og, /enqueueRealTimelineSnapshot\(hsid, playerId, s3\)/, 'cache misses must queue a capture');
assert.doesNotMatch(og, /fallbackPlayerProfileImage|generated-fallback|cached-fallback/, 'no fabricated replacement for real screenshots');
assert.match(og, /status: 503/, 'pending real screenshots are marked retriable without caching bogus images');
assert.doesNotMatch(og, /captureCareerTimeline\(/, 'crawler requests must not launch a browser');
assert.match(worker, /captureCareerTimeline\(/, 'cron worker captures real timeline DOM');
assert.match(worker, /MAX_ATTEMPTS = 4/, 'capture failures have bounded retries');
assert.match(queue, /IfNoneMatch: '\*'/, 'queue writes must be idempotent');
assert.match(publisher, /after\(async \(\) => \{[\s\S]*enqueueRealTimelineSnapshot/, 'new fan players must queue their real screenshot');
assert(crons.some(c => c.path === '/api/cron/player-profile-snapshot'), 'scheduled worker must be enabled');
console.log('Player profile share preview contracts pass.');

// First share shows the picture (Pete, Nov 17 2026): a person's profile view
// queues a missing screenshot after the response; crawlers never queue.
const profileLayout = read('src/app/[hsid]/player/[playerId]/layout.tsx');
assert.match(queue, /export async function ensureRealTimelineSnapshot[\s\S]*HeadObjectCommand[\s\S]*=== 404\) \{\s*await enqueueRealTimelineSnapshot/, 'only a missing picture is queued');
assert.match(profileLayout, /!PLAYER_PREVIEW_BOT\.test\(requestHeaders\.get\('user-agent'\) \|\| ''\)[\s\S]*after\(\(\) => ensureRealTimelineSnapshot\(hsid, playerId\)/, 'profile views by people queue the picture after the response');
console.log('First-share picture contract passes.');
