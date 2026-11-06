'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/app/api/player-season-stats/route.ts'),'utf8');
const sql=fs.readFileSync(path.join(root,'migrations/20261105_audit_unmapped_historical_team_ids.sql'),'utf8');
assert.match(source,/function seasonTeamName\(row:/);
assert.match(source,/name && !\/\^\\d\+\$\/\.test\(name\)/);
assert.equal((source.match(/team: seasonTeamName\(row\)/g)||[]).length,2,
  'Both batting and pitching season rows must use the same name resolver');
assert.doesNotMatch(source,/team:\s*value\(row,\s*'current_team_name',\s*'teamid'\)/,
  'Do not render raw numeric ID as the team name');
assert.match(source,/left join public\.tbc_college_teams_map_raw c on c\.teamid::text = r\.teamid::text/i);
assert.match(source,/left join public\.tbc_pro_teams_map_raw p on p\.teamid::text = r\.teamid::text/i);
assert.match(source,/nullif\(btrim\(c\.collegename\), ''\)/);
assert.match(sql,/tbc_teamid_reconciliation_queue/);
assert.doesNotMatch(sql,/INSERT\s+INTO\s+public\.teamid_universe_mapping/i,
  'Do not bypass canonical official-level and organization guard');
console.log('PASS: season team names use verified catalogs, not raw team IDs; missing teams remain queued');
