#!/usr/bin/env ts-node
// scripts/refresh-flip-card-front-stage-from-mlb.ts
// YAT?STATS — Refresh fan-facing flip_card_front_stage from MLB raw roster data.
//
// Pipeline responsibility:
//   public.mlb_org_roster_raw -> public.flip_card_front_stage

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureStageColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE public.flip_card_front_stage
      ADD COLUMN IF NOT EXISTS current_team_name text,
      ADD COLUMN IF NOT EXISTS current_team_level text,
      ADD COLUMN IF NOT EXISTS current_team_source text,
      ADD COLUMN IF NOT EXISTS current_team_source_player_id text,
      ADD COLUMN IF NOT EXISTS current_team_source_team_id text,
      ADD COLUMN IF NOT EXISTS current_team_roster_status text,
      ADD COLUMN IF NOT EXISTS current_team_last_verified timestamptz,
      ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz
  `);
}

async function refreshStage(): Promise<number> {
  const result = await pool.query(`
    WITH latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    ranked_raw AS (
      SELECT
        raw.*,
        row_number() OVER (
          PARTITION BY raw.source_player_id
          ORDER BY
            CASE raw.roster_type
              WHEN 'active' THEN 1
              WHEN '40Man' THEN 2
              WHEN 'fullRoster' THEN 3
              ELSE 9
            END,
            raw.seen_at DESC NULLS LAST,
            raw.updated_at DESC NULLS LAST,
            raw.id DESC
        ) AS rn
      FROM public.mlb_org_roster_raw raw
      JOIN latest_completed_run lr
        ON lr.run_id = raw.run_id
      WHERE raw.source_player_id IS NOT NULL
    ),
    latest_raw AS (
      SELECT *
      FROM ranked_raw
      WHERE rn = 1
    ),
    resolved AS (
      SELECT
        psm.playerid::text AS playerid,
        lr.source_player_id,
        lr.source_team_id,
        lr.source_team_name,
        lr.level,
        lr.roster_status,
        COALESCE(lr.seen_at, lr.updated_at, NOW()) AS verified_at
      FROM latest_raw lr
      JOIN public.player_source_map psm
        ON psm.source = 'mlb_api'
       AND psm.source_player_id = lr.source_player_id
      WHERE psm.playerid IS NOT NULL
    )
    UPDATE public.flip_card_front_stage stage
       SET current_team_name = resolved.source_team_name,
           current_team_level = resolved.level,
           current_team_source = 'mlb_api',
           current_team_source_player_id = resolved.source_player_id,
           current_team_source_team_id = resolved.source_team_id,
           current_team_roster_status = resolved.roster_status,
           current_team_last_verified = resolved.verified_at,
           stage_updated_at = NOW()
      FROM resolved
     WHERE stage.playerid::text = resolved.playerid
  `);

  return result.rowCount ?? 0;
}

async function main() {
  console.log("=== Refresh flip_card_front_stage from MLB raw ===");

  try {
    await ensureStageColumns();

    const updated = await refreshStage();

    console.log(`Updated flip_card_front_stage rows: ${updated}`);
    console.log("Refresh complete.");
  } catch (err) {
    console.error("ERROR refreshing flip_card_front_stage:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
