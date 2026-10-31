'use strict';

// Prevent historical stat totals from being assigned to the wrong competitive
// level via numeric Team ID ranges. Any unclassified team must remain outside
// MLB/minor/college totals until canonical mapping is completed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/db.ts'), 'utf8');

function section(start, end) {
  const i = source.indexOf(start), j = source.indexOf(end, i + start.length);
  assert(i >= 0 && j > i, 'Missing career stats CTE ' + start);
  return source.slice(i, j);
}
for (const [name, next] of [
  ['career_batting_by_bucket AS (', 'career_batting AS ('],
  ['career_pitching_by_bucket AS (', 'career_pitching AS ('],
]) {
  const sql = section(name, next);
  assert(sql.includes('LEFT JOIN public.teamid_universe_mapping canonical_team'),
    name + ': must join the canonical Team ID universe');
  assert(sql.includes('canonical_team.teamid = career_stats.teamid::text'),
    name + ': must resolve exact Team ID, never by team name');
  for (const level of ['MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
    'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'])
    assert(sql.includes(level), name + ': missing official level ' + level);
  assert(sql.includes("ELSE 'other'"), name + ': unclassified teams must fail closed');
  assert(!/regexp_replace\s*\([^\n]*teamid|teamid::[^\n]*\b(?:10000|20000)\b/i.test(sql),
    name + ': bucket assignment must never use numeric Team ID ranges');
  assert(!sql.includes('highlevel') && !sql.includes('player_current_team'),
    name + ': career high or roster status cannot be used as season level');
}
const buckets = section('career_batting_buckets AS (','career_pitching_by_bucket AS (');
const pitchBuckets = section('career_pitching_buckets AS (','active_2026 AS (');
for (const [name,s] of [['batting',buckets],['pitching',pitchBuckets]]) {
  for (const bucket of ['mlb','minors','indy','international','college'])
    assert(s.includes("WHEN '" + bucket + "'"), name + ' output must preserve '+bucket);
  assert(s.includes("WHERE bucket <> 'other'"),
    name + ' must omit unresolved stat rows instead of contaminating categories');
}
console.log('Career batting and pitching use exact canonical level buckets; unresolved stats held out');
