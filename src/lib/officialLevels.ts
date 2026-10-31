// src/lib/officialLevels.ts
// The official player levels (Pete, Oct 18, 2026) and the aliases that may be
// rewritten to them without a person looking. Used by the weekly level check
// (src/app/api/cron/level-qc) and the one-time cleanups it was born from.
//
// JUCO is not a level (Pete, Oct 19): JUCO is NJCAA, period. CCCAA and NWAC
// are their own levels, not kinds of JUCO. Not in the alias list on purpose:
// generic NCAA (TBC's career level, which doesn't say the division) and PRO
// (a placeholder put on teams imported from tbc_pro_teams_map_raw, which has
// no level; the real level comes from the team's season on the Baseball Cube).
// The check reports those instead.

export const OFFICIAL_LEVELS = [
  'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
  'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL',
] as const;

// Upper-cased, trimmed alias -> official level.
export const LEVEL_FIXES: Record<string, string> = {
  AAA: 'TRIPLE-A', 'TRIPLE-A (40-MAN)': 'TRIPLE-A',
  AA: 'DOUBLE-A',
  'A+': 'HIGH-A', 'HIGH A': 'HIGH-A',
  A: 'SINGLE-A', 'A-': 'SINGLE-A', 'LOW-A': 'SINGLE-A', 'LOW A': 'SINGLE-A', 'SINGLE A': 'SINGLE-A',
  RK: 'ROOKIE', 'ROOKIE (40-MAN)': 'ROOKIE',
  INTL: 'INTERNATIONAL', "INT'L": 'INTERNATIONAL',
  INDEPENDENT: 'INDY',
  D1: 'NCAA-D1', 'NCAA D1': 'NCAA-D1',
  D2: 'NCAA-D2', 'NCAA D2': 'NCAA-D2',
  D3: 'NCAA-D3', 'NCAA D3': 'NCAA-D3',
  JUCO: 'NJCAA', JRCOLLEGE: 'NJCAA', 'JUNIOR COLLEGE': 'NJCAA',
  HS: 'HIGH SCHOOL',
};

// The level columns the daily check rewrites. Everything the site reads.
// Never teamid_universe_mapping: it is the canonical team table (Pete's own
// research) and is only read, never written, by code.
// A source's own raw files (fan submissions, college schedule landings, the
// 150-team reference exports) are only reported, never rewritten.
export const LEVEL_FIX_TARGETS: { table: string; column: string; stamp?: string }[] = [
  { table: 'flip_card_front_stage', column: 'level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'display_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'current_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'previous_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'committed_level_label', stamp: 'updated_at' },
  { table: 'flip_card_front_stage', column: 'current_team_level', stamp: 'updated_at' },
  { table: 'player_team_stints', column: 'level' },
  { table: 'team_schedules', column: 'level' },
  { table: 'player_current_team', column: 'level' },
  { table: 'mlb_org_roster_raw', column: 'level' },
  { table: 'news_articles', column: 'level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'display_level_label' },
  { table: 'hamilton_all_time_import_stage', column: 'current_team_level' },
];

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

// One SQL statement that rewrites one level column: known aliases and wrong
// capitalisation become the official level, and placeholder dashes or blanks
// become NULL. Returns the rows it changed.
export function levelFixSql({ table, column, stamp }: { table: string; column: string; stamp?: string }) {
  const pairs = [
    ...Object.entries(LEVEL_FIXES),
    ...OFFICIAL_LEVELS.map((level) => [level, level] as const),
  ];
  const values = pairs.map(([from, to]) => `('${from.replace(/'/g, "''")}', '${to}')`).join(',\n      ');
  const t = `public.${ident(table)}`;
  const c = ident(column);
  return `
    WITH fixes(from_level, to_level) AS (VALUES
      ${values}
    ), changed AS (
      UPDATE ${t} f
         SET ${c} = x.new_level${stamp ? `, ${ident(stamp)} = now()` : ''}
        FROM (SELECT f2.ctid AS rid,
                     CASE WHEN TRIM(f2.${c}) IN ('', '-', '--') THEN NULL ELSE fx.to_level END AS new_level
                FROM ${t} f2
                LEFT JOIN fixes fx ON fx.from_level = UPPER(TRIM(f2.${c}))
               WHERE f2.${c} IS NOT NULL
                 AND (TRIM(f2.${c}) IN ('', '-', '--')
                      OR (fx.to_level IS NOT NULL AND f2.${c} IS DISTINCT FROM fx.to_level))) x
       WHERE f.ctid = x.rid
      RETURNING 1
    )
    SELECT count(*)::int AS fixed FROM changed`;
}

// Every text column named like "level" in every table (backups and snapshots
// aside), and each value in it that isn't official. New tables and columns are
// picked up on their own, so nothing slips in unseen. $1 = OFFICIAL_LEVELS.
export const LEVEL_SCAN_SQL = `
  WITH cols AS (
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying')
       AND c.column_name ILIKE '%level%' AND c.column_name NOT ILIKE '%highlevel%'
       AND c.table_name !~ '(backup|baseline|snapshot|quarantine|landing|suspect|_raw_2$|_[0-9]{8})'
  )
  SELECT c.table_name, c.column_name,
         (xpath('/row/v/text()', r))[1]::text AS value,
         (xpath('/row/n/text()', r))[1]::text::int AS rows
    FROM cols c,
         LATERAL unnest(xpath('/table/row', query_to_xml(format(
           'SELECT %1$I AS v, count(*) AS n FROM public.%2$I
             WHERE %1$I IS NOT NULL AND TRIM(%1$I) <> '''' AND NOT (%1$I = ANY(%3$L::text[]))
             GROUP BY 1', c.column_name, c.table_name, $1::text), true, false, ''))) r
   ORDER BY rows DESC`;

// The same for the cards people see: active players whose card level isn't
// official (generic NCAA ...). $1 = OFFICIAL_LEVELS.
export const ACTIVE_CARD_LEFTOVERS_SQL = `
  SELECT playerid, display_name, current_team_name, display_level_label AS card_level
    FROM public.flip_card_front_stage
   WHERE (status_label ILIKE 'active%' OR status_label ILIKE 'current%')
     AND display_level_label IS NOT NULL
     AND NOT (display_level_label = ANY($1::text[]))
   ORDER BY display_level_label, display_name`;

// Active cards that say one level while the team cross-check
// (teamid_universe_mapping) gives their current team another. $1 = OFFICIAL_LEVELS.
export const TEAM_LEVEL_MISMATCH_SQL = `
  SELECT f.playerid, f.display_name, f.current_team_name,
         f.display_level_label AS card_level, m.level_label AS team_level
    FROM public.flip_card_front_stage f
    JOIN public.teamid_universe_mapping m ON m.teamid = f.current_teamid::text
   WHERE (f.status_label ILIKE 'active%' OR f.status_label ILIKE 'current%')
     AND m.level_label = ANY($1::text[])
     AND f.display_level_label IS DISTINCT FROM m.level_label
   ORDER BY f.display_name`;


// Canonicalize DISPLAY metadata for college, independent and international
// assignments only. MLB and MiLB team assignments are owned by the live roster
// reconciliation workflow, not this daily level-quality check.
//
// IMPORTANT (Oct 29 incident): public.player_current_team is a legacy MLB
// snapshot whose last_verified values stopped in April 2026. The former
// CANONICAL_STAGE_REPAIR_SQL read it and re-published those stale assignments
// every morning, undoing newer MLB roster truth for 596 players on Oct 28.
// The roster job reversed them a few hours later. NEVER reintroduce that
// cross-pipeline write or replace a source MLB team ID with a TBC team ID.
export const CANONICAL_STAGE_REPAIR_SQL = `
  WITH non_pro_targets AS (
    SELECT
      f.playerid,
      u.current_team_name AS team_name,
      u.current_org_or_conference_name AS org_name,
      u.level_label AS level
    FROM public.flip_card_front_stage f
    JOIN public.teamid_universe_mapping u ON u.teamid = f.current_teamid
    WHERE u.level_label IN (
      'NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC',
      'INDY','INTERNATIONAL'
    )
      AND COALESCE(f.current_team_source, '') NOT IN (
        'mlb_api', 'mlb_api_canonical_teamid', 'owner_reported_transfer'
      )
      AND UPPER(COALESCE(f.status_label, '')) NOT IN ('FREE AGENT','RETIRED')
      AND UPPER(COALESCE(f.team_affiliation_status, '')) NOT IN ('FREE AGENT','RETIRED')
  ), changed AS (
    UPDATE public.flip_card_front_stage f
       SET current_team_name = t.team_name,
           current_org_or_conference_name = t.org_name,
           level_label = t.level,
           display_level_label = t.level,
           current_level_label = t.level,
           current_team_level = t.level,
           updated_at = NOW(),
           stage_updated_at = NOW()
      FROM non_pro_targets t
     WHERE f.playerid = t.playerid
       AND (
         f.current_team_name IS DISTINCT FROM t.team_name OR
         f.current_org_or_conference_name IS DISTINCT FROM t.org_name OR
         f.level_label IS DISTINCT FROM t.level OR
         f.display_level_label IS DISTINCT FROM t.level OR
         f.current_level_label IS DISTINCT FROM t.level OR
         f.current_team_level IS DISTINCT FROM t.level
       )
    RETURNING f.playerid
  )
  SELECT COUNT(*)::int AS fixed FROM changed`;

export const CANONICAL_ACTIVE_STAGE_MISMATCH_SQL = `
  SELECT f.playerid, f.display_name, f.current_teamid, f.current_team_name,
         f.current_org_or_conference_name, f.level_label,
         u.current_team_name AS canonical_team_name,
         u.current_org_or_conference_name AS canonical_org_name,
         u.level_label AS canonical_level
    FROM public.flip_card_front_stage f
    JOIN public.teamid_universe_mapping u ON u.teamid = f.current_teamid
   WHERE (f.status_label ILIKE 'active%' OR f.status_label ILIKE 'current%')
     AND (
       f.current_team_name IS DISTINCT FROM u.current_team_name OR
       f.current_org_or_conference_name IS DISTINCT FROM u.current_org_or_conference_name OR
       f.level_label IS DISTINCT FROM u.level_label
     )
   ORDER BY f.display_name`;

// Recover missing ACTIVE college team IDs from exactly one
// canonical 2026 stats team. This is NOT a roster-verification timestamp:
// we deliberately leave current_team_last_verified untouched. Never use the
// April player_current_team snapshot, multi-team seasons, PRO placeholders,
// older stat seasons, overrides, MLB/MiLB assignments, or transaction departures.
// Idempotent; run after TBC ingest and in daily quality control.
export const SAFE_2026_STAGE_TEAM_RECOVERY_SQL = `
WITH season_teams AS MATERIALIZED (
  SELECT playerid::text AS playerid, teamid::text AS teamid
    FROM public.tbc_batting_2026_season_raw
   WHERE year = '2026' AND playerid ~ '^[0-9]+$' AND teamid ~ '^[0-9]+$'
  UNION
  SELECT playerid::text, teamid::text
    FROM public.tbc_pitching_2026_season_raw
   WHERE year = '2026' AND playerid ~ '^[0-9]+$' AND teamid ~ '^[0-9]+$'
), single_team AS MATERIALIZED (
  SELECT playerid, MIN(teamid) AS teamid
    FROM season_teams
   GROUP BY playerid
  HAVING COUNT(DISTINCT teamid) = 1
), eligible AS MATERIALIZED (
  SELECT f.playerid, u.teamid, u.current_team_name AS team_name,
         u.current_org_or_conference_name AS org_name, u.level_label AS level
    FROM public.flip_card_front_stage f
    JOIN single_team s ON s.playerid = f.playerid
    JOIN public.teamid_universe_mapping u ON u.teamid = s.teamid
   WHERE f.status_label = 'ACTIVE'
     AND f.current_teamid IS NULL
     AND f.current_team_source IS NULL
     AND f.current_team_last_verified IS NULL
     AND f.current_team_source_player_id IS NULL
     AND f.current_team_source_team_id IS NULL
     AND f.last_transaction_applied_at IS NULL
     AND f.current_team_absent_since IS NULL
     AND f.is_on_40man IS NOT TRUE
     AND COALESCE(UPPER(BTRIM(f.team_affiliation_status)), '') NOT IN ('FREE AGENT', 'RETIRED')
     AND NOT EXISTS (
       SELECT 1 FROM public.player_team_override o WHERE o.playerid = f.playerid
     )
     AND u.level_label IN (
       'NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'
     )
     AND NULLIF(BTRIM(u.current_team_name), '') IS NOT NULL
     AND NULLIF(BTRIM(u.current_org_or_conference_name), '') IS NOT NULL
), changed AS (
  UPDATE public.flip_card_front_stage f
     SET current_teamid = e.teamid,
         current_team_source_team_id = e.teamid,
         current_team_name = e.team_name,
         current_org_or_conference_name = e.org_name,
         current_team_level = e.level,
         current_level_label = e.level,
         level_label = e.level,
         display_level_label = e.level,
         current_team_source = 'tbc_2026_college_participation',
         stage_updated_at = NOW(), updated_at = NOW()
    FROM eligible e
   WHERE f.playerid = e.playerid
     AND f.status_label = 'ACTIVE'
     AND f.current_teamid IS NULL
     AND f.current_team_source IS NULL
     AND f.current_team_last_verified IS NULL
     AND f.last_transaction_applied_at IS NULL
     AND f.current_team_absent_since IS NULL
     AND f.is_on_40man IS NOT TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.player_team_override o WHERE o.playerid = f.playerid
     )
  RETURNING f.playerid
)
SELECT COUNT(*)::int AS recovered FROM changed
`;

// Full-stage coverage metrics. Historical NULL IDs are expected; active NULL
// IDs and assigned-but-unmapped IDs need investigation.
export const STAGE_TEAM_COVERAGE_SQL = `
SELECT COUNT(*)::int AS stage_rows,
  COUNT(*) FILTER (WHERE f.current_teamid IS NULL)::int AS null_team_ids,
  COUNT(*) FILTER (WHERE f.status_label = 'ACTIVE')::int AS active_rows,
  COUNT(*) FILTER (WHERE f.status_label = 'ACTIVE' AND f.current_teamid IS NULL)::int AS active_null_team_ids,
  COUNT(*) FILTER (WHERE f.current_teamid IS NOT NULL AND u.teamid IS NULL)::int AS unmapped_team_ids,
  COUNT(*) FILTER (
    WHERE f.status_label = 'ACTIVE' AND f.current_teamid IS NOT NULL
      AND f.current_team_source IS NULL
  )::int AS active_team_id_without_source
FROM public.flip_card_front_stage f
LEFT JOIN public.teamid_universe_mapping u ON u.teamid = f.current_teamid
`;

export const UNRESOLVED_ACTIVE_TEAM_SQL = `
SELECT f.playerid, f.display_name, f.status_label, f.current_teamid,
  f.current_team_name, f.level_label, f.current_team_source
FROM public.flip_card_front_stage f
LEFT JOIN public.teamid_universe_mapping u ON u.teamid = f.current_teamid
WHERE f.status_label = 'ACTIVE'
  AND (f.current_teamid IS NULL OR u.teamid IS NULL)
ORDER BY f.display_name, f.playerid
LIMIT 100
`;

// Only 2026 COLLEGE participation may establish ACTIVE from season statistics.
// MLB/MiLB status comes from the MLB Organization API; independent pro status
// needs an authoritative current league roster. Historic pro stats are NOT a
// status or current-team signal. Unmatched/multi-team records are held.
// Historical career-high labels NEVER become current display levels.
// This is season activity evidence, not a live roster verification timestamp.
export const SAFE_2026_BLANK_STATUS_RECOVERY_SQL = `
WITH evidence AS MATERIALIZED (
  SELECT playerid::text AS playerid, teamid::text AS teamid,
         'tbc_2026'::text AS evidence_source
    FROM public.tbc_batting_2026_season_raw
   WHERE year='2026' AND playerid ~ '^[0-9]+$' AND teamid ~ '^[0-9]+$'
  UNION
  SELECT playerid::text, teamid::text, 'tbc_2026'
    FROM public.tbc_pitching_2026_season_raw
   WHERE year='2026' AND playerid ~ '^[0-9]+$' AND teamid ~ '^[0-9]+$'

), unique_evidence AS MATERIALIZED (
  SELECT playerid, MIN(teamid) AS teamid, MIN(evidence_source) AS evidence_source
    FROM evidence
   GROUP BY playerid
  HAVING COUNT(DISTINCT teamid)=1 AND COUNT(DISTINCT evidence_source)=1
), eligible AS MATERIALIZED (
  SELECT f.playerid, u.teamid, u.current_team_name AS team_name,
         u.current_org_or_conference_name AS org_name, u.level_label AS team_level,
         e.evidence_source
    FROM public.flip_card_front_stage f
    JOIN unique_evidence e ON e.playerid=f.playerid
    JOIN public.teamid_universe_mapping u ON u.teamid=e.teamid
   WHERE f.status_label IS NULL
     AND f.current_teamid IS NULL
     AND f.current_team_source IS NULL
     AND f.current_team_last_verified IS NULL
     AND f.current_team_source_player_id IS NULL
     AND f.current_team_source_team_id IS NULL
     AND f.last_transaction_applied_at IS NULL
     AND f.current_team_absent_since IS NULL
     AND f.is_on_40man IS NOT TRUE
     AND COALESCE(UPPER(BTRIM(f.team_affiliation_status)),'') NOT IN ('RETIRED','FREE AGENT')
     AND u.current_team_name IS NOT NULL
     AND NULLIF(BTRIM(u.current_team_name),'') IS NOT NULL
     AND e.evidence_source='tbc_2026'
     AND u.level_label IN
       ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
     AND NULLIF(BTRIM(u.current_org_or_conference_name),'') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid)
     AND NOT EXISTS (
       SELECT 1 FROM public.player_source_map m
       WHERE m.playerid=f.playerid AND m.source='mlb_api' AND m.is_verified IS TRUE
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.mlb_org_roster_resolution r
       WHERE r.playerid=f.playerid AND r.match_status='matched'
     )

), changed AS (
  UPDATE public.flip_card_front_stage f SET
    status_label='ACTIVE', display_status_label='ACTIVE',
    current_teamid=e.teamid, current_team_source_team_id=e.teamid,
    current_team_name=e.team_name,
    current_org_or_conference_name=e.org_name,
    current_team_level=e.team_level, current_level_label=e.team_level,
    level_label=e.team_level, display_level_label=e.team_level,
    current_team_source='tbc_2026_college_participation',
    updated_at=NOW(), stage_updated_at=NOW()
    FROM eligible e
   WHERE f.playerid=e.playerid
     AND f.status_label IS NULL AND f.current_teamid IS NULL
     AND f.current_team_source IS NULL AND f.current_team_last_verified IS NULL
     AND f.last_transaction_applied_at IS NULL
     AND f.current_team_absent_since IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid)
  RETURNING f.playerid
)
SELECT COUNT(*)::int AS activated FROM changed
`;

/** Strict canonical-reference coverage. Missing org/level is never auto-filled
 * from historical Baseball Cube player stats or PRO placeholders. */
export const TEAM_UNIVERSE_INTEGRITY_SQL = `
 SELECT COUNT(*)::int AS total_teams,
 COUNT(*) FILTER(WHERE NULLIF(BTRIM(current_team_name),'') IS NULL)::int AS missing_names,
 COUNT(*) FILTER(WHERE NULLIF(BTRIM(current_org_or_conference_name),'') IS NULL)::int AS missing_orgs,
 COUNT(*) FILTER(WHERE NULLIF(BTRIM(level_label),'') IS NULL)::int AS missing_levels,
 COUNT(*) FILTER(WHERE level_label NOT IN (
   'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
   'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3',
   'NAIA','NJCAA','CCCAA','NWAC','HIGH SCHOOL'
 ))::int AS unofficial_levels,
 COUNT(*) FILTER(WHERE NULLIF(BTRIM(current_team_name),'') IS NULL OR
   NULLIF(BTRIM(current_org_or_conference_name),'') IS NULL OR
   level_label NOT IN (
     'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
     'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3',
     'NAIA','NJCAA','CCCAA','NWAC','HIGH SCHOOL'
   ) OR level_label IS NULL)::int AS teams_needing_review
 FROM public.teamid_universe_mapping
`;
export const TEAM_UNIVERSE_AUDIT_24H_SQL = `
 SELECT COUNT(*)::int AS changes_past_24h
 FROM public.teamid_universe_change_audit
 WHERE changed_at >= NOW() - INTERVAL '24 hours'
`;

/** Every imported stat row must resolve by exact Team ID before it can enter a
 * competitive career bucket. These counts are for visibility and reconciliation:
 * raw archives are never modified, and PRO/UNKNOWN never become MINORS by range. */
export const HISTORICAL_TBC_LEVEL_COVERAGE_SQL = `
WITH imported AS (
  SELECT teamid::text AS teamid, 'batting' AS source
  FROM public.v_tbc_batting_all_seasons_resolved
  UNION ALL
  SELECT teamid::text, 'pitching'
  FROM public.v_tbc_pitching_all_seasons_resolved
), grouped AS (
  SELECT teamid, source, COUNT(*)::bigint AS stat_rows
  FROM imported GROUP BY teamid, source
)
SELECT source,
  COALESCE(SUM(stat_rows),0)::bigint AS total_stat_rows,
  COUNT(DISTINCT g.teamid) FILTER(
    WHERE u.teamid IS NULL OR u.level_label IS NULL
       OR u.level_label NOT IN ('MLB','TRIPLE-A','DOUBLE-A','HIGH-A',
         'SINGLE-A','ROOKIE','INDY','INTERNATIONAL','NCAA-D1',
         'NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
  )::int AS unresolved_teamids,
  COALESCE(SUM(stat_rows) FILTER(
    WHERE u.teamid IS NULL OR u.level_label IS NULL
       OR u.level_label NOT IN ('MLB','TRIPLE-A','DOUBLE-A','HIGH-A',
         'SINGLE-A','ROOKIE','INDY','INTERNATIONAL','NCAA-D1',
         'NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
  ),0)::bigint AS held_stat_rows
FROM grouped g
LEFT JOIN public.teamid_universe_mapping u ON u.teamid=g.teamid
GROUP BY source ORDER BY source
`;

// Explicit 2025 cutoff: absence of playing activity after 2025 => RETIRED.
// Protect any 2026-season activity, live MLB identities, and manual overrides.
// Independent professional players require separate current-roster authority;
// recent stats block retirement but do not establish ACTIVE by themselves.
// No age criterion, no fabricated last team, and no invented career-high level.
// Run in bounded batches; provenance trigger records every change.
export const SAFE_2025_RETIREMENT_BACKFILL_SQL = `

WITH season2026 AS MATERIALIZED (
  SELECT playerid FROM public.tbc_batting_2026_season_raw WHERE year='2026'
  UNION SELECT playerid FROM public.tbc_pitching_2026_season_raw WHERE year='2026'
  UNION SELECT yatstats_playerid FROM public.indy_iscore_batting_2026_season_raw WHERE season_year=2026 AND yatstats_playerid IS NOT NULL
  UNION SELECT yatstats_playerid FROM public.indy_iscore_pitching_2026_season_raw WHERE season_year=2026 AND yatstats_playerid IS NOT NULL
  UNION SELECT playerid FROM public.player_game_logs WHERE game_date>=DATE '2026-01-01' AND game_date<DATE '2027-01-01'
), eligible AS MATERIALIZED (
 SELECT f.playerid
 FROM public.flip_card_front_stage f
 WHERE f.status_label IS NULL
  AND f.current_teamid IS NULL AND f.current_team_source IS NULL
  AND f.current_team_source_player_id IS NULL AND f.current_team_source_team_id IS NULL
  AND f.current_team_last_verified IS NULL
  AND f.last_transaction_applied_at IS NULL AND f.current_team_absent_since IS NULL
  AND f.is_on_40man IS NOT TRUE
  AND COALESCE(UPPER(BTRIM(f.team_affiliation_status)),'') NOT IN ('RETIRED','FREE AGENT','ACTIVE','40-MAN')
  AND NOT EXISTS(SELECT 1 FROM season2026 s WHERE s.playerid=f.playerid)
  AND NOT EXISTS(SELECT 1 FROM public.player_source_map m WHERE m.playerid=f.playerid AND m.source='mlb_api' AND m.is_verified IS TRUE)
  AND NOT EXISTS(SELECT 1 FROM public.mlb_org_roster_resolution r WHERE r.playerid=f.playerid AND r.match_status='matched')
  AND NOT EXISTS(SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid)
 ORDER BY f.playerid LIMIT 5000
), classified AS (
 UPDATE public.flip_card_front_stage f SET
  status_label='RETIRED', display_status_label='RETIRED',
  team_affiliation_status='RETIRED',
  source_summary=COALESCE(f.source_summary,'{}'::jsonb) ||
    jsonb_build_object('status_classification',jsonb_build_object(
      'rule','no_activity_after_2025',
      'evidence','no_documented_2026_participation',
      'source','yatstats_retirement_cutoff',
      'applied_at',NOW())),
  updated_at=NOW(),stage_updated_at=NOW()
 FROM eligible e WHERE f.playerid=e.playerid AND f.status_label IS NULL
 RETURNING f.playerid
)
SELECT COUNT(*)::int AS retired FROM classified
`;

// Restore existing verified career high where legacy NCAA placeholder persisted.
export const SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL = `

WITH fixed AS (
 UPDATE public.flip_card_front_stage f
 SET level_label=f.highest_level_label,
     display_level_label=f.highest_level_label,
     current_team_level=NULL,
     current_level_label=NULL,
     updated_at=NOW(),stage_updated_at=NOW()
 WHERE f.status_label='RETIRED' AND f.level_label='NCAA'
 AND f.highest_level_label IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
 AND f.current_teamid IS NULL AND f.current_team_name IS NULL AND f.current_team_source IS NULL
 RETURNING f.playerid
)
SELECT COUNT(*)::int AS corrected FROM fixed
`;
