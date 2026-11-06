'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const shared=read('src/lib/teamIdentitySql.ts');
const profile=read('src/app/api/player-season-stats/route.ts');
const contribute=read('src/app/api/contribute/seasons/route.ts');
const db=read('src/lib/db.ts');

assert.match(shared,/teamid_universe_mapping canonical_identity/);
assert.match(shared,/canonical_identity\.current_team_name/);
assert.match(shared,/canonical_identity\.level_label/);
assert.match(shared,/canonical_identity\.current_org_or_conference_name/);
assert.match(shared,/tbc_college_teams_map_raw college_identity/);
assert.match(shared,/tbc_pro_teams_map_raw pro_identity/);
assert.match(shared,/Team name not yet identified/);
assert.doesNotMatch(shared,/COALESCE\([^)]*canonical_identity\.level_label[^)]*college_identity/i,
  'Do not invent an official level from raw source team classifications');

assert.match(profile,/teamIdentityJoins\('r'\)/);
assert.match(profile,/VERIFIED_TEAM_SOURCE_NAME_SQL/);
assert.match(profile,/VERIFIED_TEAM_LEVEL_SQL/);
assert.match(profile,/VERIFIED_TEAM_ORG_SQL/);
assert.equal((db.match(/teamIdentityJoins\('[bp]'\)/g)||[]).length,2,
  'Both batting and pitching server stats must use canonical team identity');
assert.equal((db.match(/PUBLIC_TEAM_NAME_SQL} AS team_name/g)||[]).length,2);
assert.match(db,/batting-seasons-canonical-identity-v3/);
assert.match(db,/pitching-seasons-canonical-identity-v3/);

assert.match(contribute,/v_tbc_batting_all_seasons_resolved/);
assert.match(contribute,/v_tbc_pitching_all_seasons_resolved/);
assert.match(contribute,/teamIdentityJoins\('r'\)/);
assert.match(contribute,/teamIdentityJoins\('s'\)/);
assert.match(contribute,/IS_COLLEGE_SOURCE_SQL/);
assert.match(contribute,/r\.is_college_source \|\| COLLEGE_LEVEL/);
assert.match(contribute,/LEFT\(r\.year::text,\s*4\)::int/);
assert.doesNotMatch(contribute,/COALESCE\(m\.current_team_name, r\.teamid/);
assert.doesNotMatch(contribute,/\['tbc_batting_raw', 'tbc_pitching_raw'/);

for(const [name,src] of [['profile',profile],['contribution',contribute],['server stats',db]]){
  assert.doesNotMatch(src,/COALESCE\(\s*(?:m|t|canonical_identity)\.current_team_name,\s*(?:r|b|p)\.teamid(?:::text)?\s*\)/i,
    name+' must not render numeric team IDs as public team names');
}
console.log('PASS: player statistics, contributions and server career stats share canonical team identity');
