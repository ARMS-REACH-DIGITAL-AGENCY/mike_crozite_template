#!/usr/bin/env ts-node
// scripts/refresh-flip-card-front-stage-from-mlb.ts
// Updates fan-facing flip_card_front_stage from matched MLB roster resolution rows.

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
    ranked_matches AS (
      SELECT
        res.playerid,
        raw.source_player_id,
        raw.source_player_name,
        raw.source_team_id,
        raw.source_team_name,
        raw.level,
        raw.roster_status,
        raw.seen_at,
        raw.updated_at,
        raw.id AS raw_id,
        row_number() OVER (
          PARTITION BY res.playerid
          ORDER BY
            raw.seen_at DESC NULLS LAST,
            raw.updated_at DESC NULLS LAST,
            raw.id DESC
        ) AS rn
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw
        ON raw.id = res.raw_id
      JOIN latest_completed_run lr
        ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
    ),
    latest_matched AS (
      SELECT
        playerid,
        source_player_id,
        source_player_name,
        source_team_id,
        source_team_name,
        level,
        roster_status,
        COALESCE(seen_at, updated_at, NOW()) AS verified_at
      FROM ranked_matches
      WHERE rn = 1
    )
    UPDATE public.flip_card_front_stage stage
       SET current_team_name = latest_matched.source_team_name,
           current_team_level = latest_matched.level,
           current_team_source = 'mlb_api',
           current_team_source_player_id = latest_matched.source_player_id,
           current_team_source_team_id = latest_matched.source_team_id,
           current_team_roster_status = latest_matched.roster_status,
           current_team_last_verified = latest_matched.verified_at,
           stage_updated_at = NOW()
      FROM latest_matched
     WHERE stage.playerid::text = latest_matched.playerid::text
  `);

  return result.rowCount ?? 0;
}

async function main() {
  console.log("=== Refresh flip_card_front_stage from MLB roster resolution ===");

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
