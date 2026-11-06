'use strict';
// Build-time guard for the shared roster SQL; no database calls or secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function verify(source) {
  const match = source.match(/\bconst\s+FLIP_CARD_STAGE_SELECT\s*=\s*`([\s\S]*?)`\s*;/);
  assert.ok(match, 'Shared roster SQL not found; update the guard if it is refactored');
  const sql = match[1];
  assert.match(sql, /\bFROM\s+\${PLAYER_STAGE_IDENTITY_SOURCE\}\s+fs\b/,
    'Shared roster SQL must have a qualified fs alias');
  // PR #555 failed with SQLSTATE 42702 after a join introduced level_label.
  const bare = /\b(?:COALESCE|TRIM|BTRIM|UPPER|NULLIF)\s*\(\s*(?:level_label|status_label)\b/gi;
  const matches = [...sql.matchAll(bare)].map(m => m[0]);
  assert.equal(matches.length, 0,
    'Ambiguous stage columns: ' + matches.join(', ') + '; qualify fs.level_label or fs.status_label');
  assert.match(sql, /\bSELECT\s+fs\.\*/, 'Shared stage SELECT must still load player rows');

  // PR #691: an IN (SELECT ... FROM school_players) here previously forced
  // historical 939K-row scans for every school request. Require an indexable
  // scalar-array initplan for the Active and All-Time season aggregation paths.
  const rosterStart = source.indexOf('function buildActiveRosterSql(');
  const allTimeStart = source.indexOf('export const getAllTimeRosterByHsid');
  assert.ok(rosterStart >= 0 && allTimeStart >= 0, 'School roster readers must exist');
  for (const [name, block] of [
    ['Active', source.slice(rosterStart, source.indexOf('\n}', rosterStart) + 2)],
    ['All-Time', source.slice(allTimeStart, allTimeStart + 45000)],
  ]) {
    assert.match(block, /playerid::text\s*=\s*ANY\(ARRAY\(SELECT playerid::text FROM school_players\)\)/,
      name + ' must use indexed school-scoped player IDs');
    assert.doesNotMatch(block, /playerid::text\s+IN\s*\(SELECT playerid::text FROM school_players\)/,
      name + ' must not regress to all-history school roster scans');
  }
  return true;
}
if (require.main === module) {
  verify(fs.readFileSync(path.join(__dirname, '..', 'src/lib/db.ts'), 'utf8'));
  console.log('PASS: shared roster SQL qualifies level/status columns');
}
module.exports = { verify };
