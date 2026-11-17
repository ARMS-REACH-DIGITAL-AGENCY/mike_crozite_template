// Static contract checks: player profile data is kept across requests
// (Pete, Nov 17 2026: player pages must not read the database on every visit).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const db = read('src/lib/db.ts');
const kept = read('src/lib/profilePageData.ts');
const page = read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const layout = read('src/app/[hsid]/player/[playerId]/layout.tsx');
const identity = read('src/lib/playerIdentityCached.ts');

assert.match(kept, /function keptForProfile/, 'profilePageData.ts must provide the kept-for-profile loader');
assert.match(kept, /const PROFILE_DATA_TTL_SECONDS = 3600;/, 'profile data is kept for an hour');
assert.match(db, /const watch = queryFailureWatch\.getStore\(\);\s*if \(watch\) watch\.failed = true;/, 'a failed read marks the loader');
assert.match(kept, /if \(watch\.failed\) throw new UnkeptResult\(value\);/, 'a result built around a failed read is never kept');
assert.match(kept, /tags: \['player-profile', `player-profile:\$\{args\[0\] \?\? ''\}`\]/, 'kept data is tagged for invalidation');

for (const name of ['keptBattingStats', 'keptPitchingStats', 'keptCareerBatting', 'keptCareerPitching', 'keptResolvedCurrentTeam', 'keptTransactionStatus', 'keptSocialHandles', 'keptGameLogs', 'keptTeamStints', 'keptTeamSchedule', 'keptProfileNews', 'keptPlayerById']) {
  assert.match(kept, new RegExp(`export (const|function) ${name}\\b`), `${name} must be exported`);
  assert.match(page, new RegExp(`\\b${name}\\(`), `the profile page must read ${name}`);
}
for (const raw of ['getPlayerBattingStats(', 'getPlayerPitchingStats(', 'getPlayerCareerBatting(', 'getPlayerCareerPitching(', 'getPlayerGameLogs(', 'getPlayerTeamStints(', 'getTeamSchedule(', 'getNewsByPlayer(']) {
  assert(!page.includes(raw), `the profile page must not call ${raw} directly`);
}
assert.match(layout, /keptPlayerById\(playerId\)/, 'the profile layout reads the kept player');
assert.match(identity, /cache\(keptIdentityMeta\)/, 'identity meta is kept across requests');

// Every school-data edit also drops kept profile data.
for (const f of ['src/app/api/contribute/route.ts', 'src/app/api/contribute/review/route.ts', 'src/lib/publishCurrentTeamChange.ts', 'src/lib/publishAuthorizedPlayerInfo.ts', 'src/lib/publishCollegeCommitment.ts', 'src/lib/publishNewPlayer.ts', 'src/lib/contributionPublisher.ts']) {
  const src = read(f);
  const schoolTags = (src.match(/revalidateTag\((?:'school-data:'|`school-data:)/g) || []).length;
  const profileTags = (src.match(/revalidateTag\('player-profile', \{ expire: 0 \}\)/g) || []).length;
  assert.equal(profileTags, schoolTags, `${f}: each school-data invalidation also drops profile data`);
}
console.log('PASS: profile data kept for an hour per player; failed reads never kept; edits drop it');
