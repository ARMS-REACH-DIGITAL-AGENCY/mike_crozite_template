#!/usr/bin/env ts-node
// scripts/refresh-flip-card-front-stage-from-mlb.ts
// Updates fan-facing flip_card_front_stage from matched MLB roster resolution rows.
//
// Fan-facing SOP:
// - roster_type='active' owns current team, level, and roster status when present.
// - roster_type='40Man' is context only; it must not override active team/level.
// - A true MLB 40-man context row must come from the MLB parent club endpoint:
//   source_team_id = org_source_team_id.
// - roster_type='fullRoster' is fallback only.
// - If a player is active at a non-MLB level and also on the true MLB 40-man roster,
//   display level becomes e.g. TRIPLE-A (40-MAN), while level_label stays TRIPLE-A for filters.
// - Rehab/injured roster status overrides plain ACTIVE, but level remains the actual assigned level.

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
      ADD COLUMN IF NOT EXISTS current_org_or_conference_name text,
      ADD COLUMN IF NOT EXISTS status_label text,
      ADD COLUMN IF NOT EXISTS level_label text,
      ADD COLUMN IF NOT EXISTS display_status_label text,
      ADD COLUMN IF NOT EXISTS display_level_label text,
      ADD COLUMN IF NOT EXISTS is_on_40man boolean,
      ADD COLUMN IF NOT EXISTS forty_man_org_name text,
      ADD COLUMN IF NOT EXISTS forty_man_org_abbr text,
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
    matched_rows AS (
      SELECT
        res.playerid,
        raw.source_player_id,
        raw.source_player_name,
        raw.source_team_id,
        raw.source_team_name,
        raw.org_source_team_id,
        raw.level,
        CASE UPPER(COALESCE(raw.level, ''))
          WHEN 'MLB' THEN 'MLB'
          WHEN 'AAA' THEN 'TRIPLE-A'
          WHEN 'TRIPLE-A' THEN 'TRIPLE-A'
          WHEN 'AA' THEN 'DOUBLE-A'
          WHEN 'DOUBLE-A' THEN 'DOUBLE-A'
          WHEN 'HIGH-A' THEN 'HIGH-A'
          WHEN 'SINGLE-A' THEN 'LOW-A'
          WHEN 'LOW-A' THEN 'LOW-A'
          WHEN 'A' THEN 'LOW-A'
          WHEN 'ROOKIE' THEN 'ROOKIE'
          ELSE UPPER(COALESCE(raw.level, ''))
        END AS normalized_level,
        raw.roster_status,
        CASE
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%REHAB%' THEN 'REHAB ASSIGNMENT'
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%INJURED%' THEN UPPER(raw.roster_status)
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%IL%' THEN UPPER(raw.roster_status)
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%SUSPENDED%' THEN UPPER(raw.roster_status)
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%RESTRICTED%' THEN UPPER(raw.roster_status)
          WHEN UPPER(COALESCE(raw.roster_status, '')) LIKE '%BEREAVEMENT%' THEN UPPER(raw.roster_status)
          ELSE 'ACTIVE'
        END AS normalized_status,
        raw.roster_type,
        raw.org_name,
        raw.org_abbr,
        raw.seen_at,
        raw.updated_at,
        raw.id AS raw_id,
        (
          LOWER(COALESCE(raw.roster_type, '')) = '40man'
          AND raw.source_team_id::text = raw.org_source_team_id::text
        ) AS is_true_mlb_40man_row
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw
        ON raw.id = res.raw_id
      JOIN latest_completed_run lr
        ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
    ),
    active_truth AS (
      SELECT DISTINCT ON (playerid)
        *
      FROM matched_rows
      WHERE LOWER(COALESCE(roster_type, '')) = 'active'
      ORDER BY playerid, seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, raw_id DESC
    ),
    forty_man_context AS (
      SELECT DISTINCT ON (playerid)
        playerid,
        true AS is_on_40man,
        org_name AS forty_man_org_name,
        org_abbr AS forty_man_org_abbr
      FROM matched_rows
      WHERE is_true_mlb_40man_row IS TRUE
      ORDER BY playerid, seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, raw_id DESC
    ),
    fallback_truth AS (
      SELECT DISTINCT ON (playerid)
        *
      FROM matched_rows
      WHERE LOWER(COALESCE(roster_type, '')) = 'fullroster'
         OR is_true_mlb_40man_row IS TRUE
      ORDER BY
        playerid,
        CASE
          WHEN is_true_mlb_40man_row IS TRUE THEN 1
          WHEN LOWER(COALESCE(roster_type, '')) = 'fullroster' THEN 2
          ELSE 9
        END,
        seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        raw_id DESC
    ),
    player_universe AS (
      SELECT playerid FROM active_truth
      UNION
      SELECT playerid FROM fallback_truth
      UNION
      SELECT playerid FROM forty_man_context
    ),
    chosen_truth AS (
      SELECT
        u.playerid,
        COALESCE(a.source_player_id, f.source_player_id) AS source_player_id,
        COALESCE(a.source_player_name, f.source_player_name) AS source_player_name,
        COALESCE(a.source_team_id, f.source_team_id) AS source_team_id,
        COALESCE(a.source_team_name, f.source_team_name) AS source_team_name,
        COALESCE(a.level, f.level) AS raw_level,
        COALESCE(a.normalized_level, f.normalized_level) AS normalized_level,
        COALESCE(a.roster_status, f.roster_status) AS roster_status,
        COALESCE(a.normalized_status, f.normalized_status, 'ACTIVE') AS normalized_status,
        COALESCE(a.roster_type, f.roster_type) AS chosen_roster_type,
        COALESCE(a.org_name, f.org_name) AS org_name,
        COALESCE(a.org_abbr, f.org_abbr) AS org_abbr,
        COALESCE(a.seen_at, f.seen_at, a.updated_at, f.updated_at, NOW()) AS verified_at,
        COALESCE(fm.is_on_40man, false) AS is_on_40man,
        fm.forty_man_org_name,
        fm.forty_man_org_abbr
      FROM player_universe u
      LEFT JOIN active_truth a
        ON a.playerid = u.playerid
      LEFT JOIN fallback_truth f
        ON f.playerid = u.playerid
      LEFT JOIN forty_man_context fm
        ON fm.playerid = u.playerid
    ),
    display_truth AS (
      SELECT
        *,
        CASE
          WHEN normalized_level IS NULL OR normalized_level = '' THEN NULL
          WHEN normalized_level <> 'MLB' AND is_on_40man IS TRUE THEN normalized_level || ' (40-MAN)'
          ELSE normalized_level
        END AS display_level,
        normalized_status AS display_status
      FROM chosen_truth
    )
    UPDATE public.flip_card_front_stage stage
       SET current_team_name = display_truth.source_team_name,
           current_team_level = display_truth.normalized_level,
           current_team_source = 'mlb_api',
           current_team_source_player_id = display_truth.source_player_id,
           current_team_source_team_id = display_truth.source_team_id,
           current_team_roster_status = display_truth.roster_status,
           current_team_last_verified = display_truth.verified_at,
           current_org_or_conference_name = CASE
             WHEN display_truth.is_on_40man IS TRUE AND display_truth.normalized_level <> 'MLB'
               THEN display_truth.forty_man_org_name
             ELSE stage.current_org_or_conference_name
           END,
           status_label = display_truth.normalized_status,
           level_label = display_truth.normalized_level,
           display_status_label = display_truth.display_status,
           display_level_label = display_truth.display_level,
           is_on_40man = display_truth.is_on_40man,
           forty_man_org_name = display_truth.forty_man_org_name,
           forty_man_org_abbr = display_truth.forty_man_org_abbr,
           stage_updated_at = NOW()
      FROM display_truth
     WHERE stage.playerid::text = display_truth.playerid::text
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
