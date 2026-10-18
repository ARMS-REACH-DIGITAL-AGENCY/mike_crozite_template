/**
 * The April legacy MLB refresh copied name-matched player_current_team rows
 * into staging without recording their MLB person ID. The September identity
 * audit could remove a wrong link but could not recognize those unmarked
 * leftovers. Read-time reconciliation prevents them from posing as current
 * assignments while leaving the raw evidence available for review.
 *
 * Missing an MLB link by itself never triggers a correction. All of the
 * legacy provenance checks below must match, and reviewed assignments,
 * canonical team IDs, current identity links and transaction facts win.
 */
export const PLAYER_STAGE_IDENTITY_CTES = `
identity_legacy_mlb AS MATERIALIZED (
  SELECT f.playerid
  FROM public.flip_card_front_stage f
  JOIN public.player_current_team ct ON ct.playerid = f.playerid
  WHERE ct.source = 'mlb_api'
    AND ct.last_verified < NOW() - INTERVAL '48 hours'
    AND NULLIF(BTRIM(f.current_team_source), '') IS NULL
    AND NULLIF(BTRIM(f.current_team_source_player_id), '') IS NULL
    AND (NULLIF(BTRIM(f.current_teamid), '') IS NULL OR f.current_teamid = ct.source_team_id)
    AND f.current_team_name = ct.team_name
    AND f.source_notes LIKE '%MLB refresh: player_current_team%'
    AND f.last_transaction_applied_at IS NULL
    AND COALESCE(UPPER(f.team_affiliation_status), '') NOT IN ('RETIRED', 'FREE AGENT')
    AND NOT EXISTS (
      SELECT 1 FROM public.player_source_map m
      WHERE m.playerid = f.playerid AND m.source = 'mlb_api'
        AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
    )
    AND NOT EXISTS (SELECT 1 FROM public.player_team_override o WHERE o.playerid = f.playerid)
    AND NOT EXISTS (
      SELECT 1 FROM public.school_player_profile_submission_raw s
      WHERE s.approved_playerid = f.playerid AND s.is_reviewed IS TRUE AND s.is_verified IS TRUE
    )
),
identity_season_rows AS (
  -- Current season tables supersede archive rows after source identity repairs.
  -- Historical raw exports may still carry an earlier, discarded person ID.
  SELECT s.playerid, NULLIF(BTRIM(s.teamid), '') AS teamid
  FROM public.tbc_batting_2026_season_raw s
  WHERE BTRIM(s.year) = '2026' AND s.playerid = ANY(ARRAY(SELECT playerid FROM identity_legacy_mlb))
  UNION ALL
  SELECT s.playerid, NULLIF(BTRIM(s.teamid), '') FROM public.tbc_pitching_2026_season_raw s
  WHERE BTRIM(s.year) = '2026' AND s.playerid = ANY(ARRAY(SELECT playerid FROM identity_legacy_mlb))
),
identity_season_teams AS (
  SELECT playerid, TRUE AS has_2026_stats,
    CASE WHEN COUNT(DISTINCT teamid) FILTER (WHERE teamid <> '0') = 1
      THEN MIN(teamid) FILTER (WHERE teamid <> '0') END AS teamid
  FROM identity_season_rows GROUP BY playerid
),
identity_mapping_candidates AS (
  SELECT m.teamid, m.current_team_name AS team_name,
    m.current_org_or_conference_name AS org_name, m.level_label AS level
  FROM public.teamid_universe_mapping m
  WHERE m.teamid IN (SELECT teamid FROM identity_season_teams)
  UNION ALL
  SELECT m.teamid, m.school, m.conference, m.division
  FROM public.college_baseball_programs_with_conferences m
  WHERE m.teamid IN (SELECT teamid FROM identity_season_teams)
    AND NOT EXISTS (SELECT 1 FROM public.teamid_universe_mapping t WHERE t.teamid = m.teamid)
),
identity_unique_mapping AS (
  SELECT teamid, MIN(team_name) AS team_name, MIN(org_name) AS org_name, MIN(level) AS level
  FROM identity_mapping_candidates
  WHERE NULLIF(BTRIM(team_name), '') IS NOT NULL
  GROUP BY teamid
  HAVING COUNT(DISTINCT (team_name, org_name, level)) = 1
),
identity_stage_repairs AS MATERIALIZED (
  SELECT c.playerid, jsonb_build_object(
    'current_team_name', m.team_name,
    'current_org_or_conference_name', m.org_name,
    'current_teamid', m.teamid,
    'current_team_source_team_id', m.teamid,
    'current_team_source_player_id', NULL,
    'current_team_source', CASE WHEN m.teamid IS NOT NULL THEN 'identity_reconciled_2026' END,
    'current_team_level', m.level,
    'current_level_label', m.level,
    'level_label', m.level,
    'display_level_label', m.level,
    'status_label', CASE WHEN s.has_2026_stats THEN 'ACTIVE' END,
    'display_status_label', CASE WHEN s.has_2026_stats THEN 'ACTIVE' END,
    'current_team_roster_status', CASE WHEN s.has_2026_stats THEN 'Active' END,
    'current_team_last_verified', NULL,
    'is_on_40man', NULL,
    'forty_man_org_name', NULL,
    'forty_man_org_abbr', NULL,
    'next_game_date', NULL,
    'next_game_time_local', NULL,
    'next_game_time_utc', NULL,
    'next_game_home_away', NULL,
    'next_game_opponent', NULL,
    'next_game_status_label', NULL
  ) AS patch
  FROM identity_legacy_mlb c
  LEFT JOIN identity_season_teams s USING (playerid)
  LEFT JOIN identity_unique_mapping m ON m.teamid = s.teamid
),
identity_reconciled_player_stage AS NOT MATERIALIZED (
  SELECT f.* FROM public.flip_card_front_stage f
  WHERE NOT EXISTS (SELECT 1 FROM identity_stage_repairs r WHERE r.playerid = f.playerid)
  UNION ALL
  SELECT (jsonb_populate_record(NULL::public.flip_card_front_stage, to_jsonb(f) || r.patch)).*
  FROM public.flip_card_front_stage f JOIN identity_stage_repairs r USING (playerid)
)`;

export const PLAYER_STAGE_IDENTITY_SOURCE = 'identity_reconciled_player_stage';

// Single-player readers already bind the canonical player ID as $1. Scope
// both candidate discovery and season evidence to that exact bound ID, so a
// batch of identity requests does not repeat the global reconciliation. The
// replacements are fixed SQL clauses; no request value becomes SQL text.
export const PLAYER_STAGE_SINGLE_PLAYER_IDENTITY_CTES = PLAYER_STAGE_IDENTITY_CTES
  .replace("WHERE ct.source = 'mlb_api'", "WHERE f.playerid = $1 AND ct.source = 'mlb_api'")
  .replaceAll(
    's.playerid = ANY(ARRAY(SELECT playerid FROM identity_legacy_mlb))',
    's.playerid = $1 AND EXISTS (SELECT 1 FROM identity_legacy_mlb)',
  )
  .replace(
    'LEFT JOIN identity_unique_mapping m ON m.teamid = s.teamid',
    // This one-time gate avoids even starting parallel history-table workers
    // when the requested player has no unsupported legacy assignment.
    'LEFT JOIN identity_unique_mapping m ON m.teamid = s.teamid\n  WHERE EXISTS (SELECT 1 FROM identity_legacy_mlb)',
  );
