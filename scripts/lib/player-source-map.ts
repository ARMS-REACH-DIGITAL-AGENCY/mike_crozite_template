import { Pool } from "pg";

export async function resolvePlayerFromSourceMap(
  pool: Pool,
  source: string,
  sourcePlayerId: string
): Promise<string | null> {
  const { rows } = await pool.query<{ playerid: string }>(
    `SELECT playerid
     FROM player_source_map
     WHERE source = $1 AND source_player_id = $2
     LIMIT 1`,
    [source, sourcePlayerId]
  );
  return rows[0]?.playerid ?? null;
}

export async function upsertSourceMap(
  pool: Pool,
  playerid: string,
  source: string,
  sourcePlayerId: string,
  sourcePlayerName: string,
  sourceTeamId?: string | null,
  sourceTeamName?: string | null,
  matchMethod?: string | null,
  matchConfidence?: number | null,
  isVerified?: boolean | null,
  notes?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO player_source_map
       (
         playerid,
         source,
         source_player_id,
         source_player_name,
         source_team_id,
         source_team_name,
         match_method,
         match_confidence,
         is_verified,
         notes,
         updated_at
       )
     VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
       )
     ON CONFLICT (source, source_player_id) DO UPDATE SET
       playerid           = EXCLUDED.playerid,
       source_player_name = EXCLUDED.source_player_name,
       source_team_id     = EXCLUDED.source_team_id,
       source_team_name   = EXCLUDED.source_team_name,
       match_method       = EXCLUDED.match_method,
       match_confidence   = EXCLUDED.match_confidence,
       is_verified        = EXCLUDED.is_verified,
       notes              = EXCLUDED.notes,
       updated_at         = EXCLUDED.updated_at`,
    [
      playerid,
      source,
      sourcePlayerId,
      sourcePlayerName,
      sourceTeamId ?? null,
      sourceTeamName ?? null,
      matchMethod ?? null,
      matchConfidence ?? null,
      isVerified ?? null,
      notes ?? null,
    ]
  );
}
