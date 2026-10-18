#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone read-only PostgreSQL audit. */
// Report the exact before/after result of the application's legacy MLB guard.
// This script deliberately has no mutation/apply mode.
// Usage: DATABASE_URL=... node scripts/audit-legacy-mlb-assignments.cjs
//        ... --playerids=157347,290278   # include these identities even if unchanged
//        ... --print-sql               # inspect the parameterized query without connecting
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/playerStageIdentity.ts'), 'utf8');
const match = source.match(/export const PLAYER_STAGE_IDENTITY_CTES = `([\s\S]*?)`;/);
if (!match || match[1].includes('${')) throw new Error('Cannot safely load the identity guard SQL');

const sql = `WITH ${match[1]}
SELECT f.playerid, f.first_name AS firstname, f.last_name AS lastname, f.hsid,
       r.playerid IS NOT NULL AS guarded_legacy_assignment,
       ct.last_verified AS legacy_assignment_verified_at,
       f.current_team_name AS stored_team, resolved.current_team_name AS resolved_team,
       f.current_teamid AS stored_teamid, resolved.current_teamid AS resolved_teamid,
       f.current_org_or_conference_name AS stored_org,
       resolved.current_org_or_conference_name AS resolved_org,
       f.level_label AS stored_level, resolved.level_label AS resolved_level,
       f.status_label AS stored_status, resolved.status_label AS resolved_status,
       f.current_team_source AS stored_source, resolved.current_team_source AS resolved_source,
       EXISTS (SELECT 1 FROM identity_season_teams s WHERE s.playerid = f.playerid) AS guarded_assignment_has_2026_stats
FROM public.flip_card_front_stage f
JOIN identity_reconciled_player_stage resolved USING (playerid)
LEFT JOIN identity_stage_repairs r USING (playerid)
LEFT JOIN public.player_current_team ct ON ct.playerid = f.playerid
WHERE CASE WHEN $1::text[] IS NULL THEN r.playerid IS NOT NULL ELSE f.playerid = ANY($1::text[]) END
ORDER BY f.last_name, f.first_name, f.playerid`;

async function main() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg !== '--print-sql' && !arg.startsWith('--playerids=')) throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.includes('--print-sql')) {
    process.stdout.write(sql + '\n');
    return;
  }
  const connectionString = process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL or PLAYERS_DATABASE_URL is required');
  const playerArg = args.find(arg => arg.startsWith('--playerids='));
  const ids = playerArg ? [...new Set(playerArg.slice('--playerids='.length).split(',').map(id => id.trim()).filter(Boolean))] : null;
  if (ids && (!ids.length || ids.some(id => !/^\d+$/.test(id)))) throw new Error('Player IDs must be comma-separated numeric canonical IDs');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    const { rows } = await client.query(sql, [ids]);
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({ readOnly: true, queriedAt: new Date().toISOString(), rows }, null, 2) + '\n');
  } finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error('Legacy MLB assignment audit failed:', error.message);
  process.exitCode = 1;
});
