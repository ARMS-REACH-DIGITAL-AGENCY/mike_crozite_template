// Regression checks: do not reintroduce the November 10 Instagram Social bugs.
// This test is static; production Meta polling must be verified separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const viewer = read('src/components/yatstats/PlayerInstagramFeed.tsx');
const sync = read('src/lib/instagramSync.ts');
const playerApi = read('src/app/api/social/player/[playerId]/route.ts');
assert.match(viewer, /isReel && externalPosts \? 16 \/ 9/);
assert.match(viewer, /: 5 \/ 4\);/);
assert.match(viewer, /externalPosts && current\.permalink && \(/);
assert.match(viewer, /nativeVideoUrl \? \(/);
assert.match(viewer, /<video/);
assert.match(viewer, /<iframe/);
assert.doesNotMatch(viewer, /PLAY REEL|showInstagramEmbed/);
assert.match(sync, /\$9::text, \$6/);
assert.match(sync, /CASE WHEN \$9::text IS NOT NULL/);
assert.match(sync, /media_url_expires_at = EXCLUDED\.media_url_expires_at/);
assert.match(playerApi, /ORDER BY p\.published_at DESC/);
assert.match(playerApi, /LIMIT 30/);
console.log('PASS Instagram media crop, no Social outbound CTA, native video, typed Meta sync SQL');
