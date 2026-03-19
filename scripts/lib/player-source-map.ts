// scripts/lib/player-source-map.ts
// YAT?STATS — Shared helpers for the player_source_map ID-bridge table.
//
// These utilities are used by MLB roster and transaction ingest scripts to
// resolve canonical YAT?STATS playerid values from stable external source IDs
// (e.g. MLB Stats API person.id) without relying on fragile name matching.

import { Pool } from "pg";

/**
 * Resolve a canonical playerid from player_source_map using a stable
 * external source ID. Returns null if no mapping exists yet.
 *
 * @param pool       - Active pg Pool for the script.
 * @param source     - External data source identifier (e.g. 'mlb_api').
 * @param sourcePlayerId - The ID assigned by that external system.
 */
export async function resolvePlayerFromSourceMap(
  pool: Pool,
  source: string,
  sourcePlayerId: string
): Promise<string | null> {
  const { rows } = await pool.query<{ playerid: string }>(
    `SELECT playerid FROM player_source_map
     WHERE source = $1 AND source_player_id = $2
     LIMIT 1`,
    [source, sourcePlayerId]
  );
  return rows[0]?.playerid ?? null;
}

/**
 * Insert or update a row in player_source_map, recording the stable
 * external ID → canonical playerid mapping for future runs.
 *
 * @param pool             - Active pg Pool for the script.
 * @param playerid         - Canonical YAT?STATS player ID.
 * @param source           - External data source identifier (e.g. 'mlb_api').
 * @param sourcePlayerId   - The ID assigned by that external system.
 * @param sourcePlayerName - Display name at time of mapping (informational).
 */
export async function upsertSourceMap(
  pool: Pool,
  playerid: string,
  source: string,
  sourcePlayerId: string,
  sourcePlayerName: string
): Promise<void> {
  await pool.query(
    `INSERT INTO player_source_map
       (playerid, source, source_player_id, source_player_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (source, source_player_id) DO UPDATE SET
       playerid           = EXCLUDED.playerid,
       source_player_name = EXCLUDED.source_player_name,
       updated_at         = EXCLUDED.updated_at`,
    [playerid, source, sourcePlayerId, sourcePlayerName]
  );
}
