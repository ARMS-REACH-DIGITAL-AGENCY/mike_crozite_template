// Regressions: shared Social-tab behavior must remain consistent for every player.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const playerFeed = read('src/components/yatstats/PlayerInstagramFeed.tsx');
const playerApi = read('src/app/api/social/player/[playerId]/route.ts');
const schoolApi = read('src/app/api/social/school/[hsid]/route.ts');
const sync = read('src/lib/instagramSync.ts');
const form = read('src/components/yatstats/ContributePlayerInfoForm.tsx');
const contribution = read('src/app/api/contribute/route.ts');
const registration = read('src/lib/playerInstagramRegistration.ts');
const prefill = read('src/app/api/contribute/player-fields/route.ts');

assert.match(playerFeed, /hasInteractiveMedia \|\| \(!hasPicture/);
assert.match(playerFeed, /const heightPerWidth = isReel \? 16 \/ 9/);
assert.doesNotMatch(playerFeed, /PLAY REEL|showInstagramEmbed|pp-ig-embed-toggle/);
assert.match(playerFeed, /\{ cache: 'no-store' \}/);
assert.match(playerFeed, /<iframe/);
assert.match(playerFeed, /role="dialog"/);
assert.match(playerFeed, /ORIGINAL POST/);
for (const api of [playerApi, schoolApi]) {
  assert.match(api, /LIMIT 30/);
  assert.match(api, /'Cache-Control': 'no-store'/);
  assert.match(api, /ORDER BY p.published_at DESC/);
}
assert.match(sync, /POSTS_PER_ACCOUNT = 30/);
assert.match(contribution, /registerPlayerInstagram\(created.playerId, hsid, submitted.instagram\)/);
assert.match(contribution, /registerPlayerInstagram\(playerId, hsid, submitted.instagram\)/);
assert.match(registration, /return 'needs_review'/);
assert.match(registration, /ON CONFLICT \(platform,handle\) DO NOTHING/);
assert.match(prefill, /getPlayerSocialHandles\(playerId\)/);
assert.match(form, /instagram:clean\(p.instagram\)/);
console.log('PASS: common video viewer, feed freshness, account linkage, profile prefill');
