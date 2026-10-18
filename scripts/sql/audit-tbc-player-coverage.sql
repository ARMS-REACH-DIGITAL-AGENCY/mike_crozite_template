-- Read-only TBC source audit. Run on the same Players database used by the app.
-- One SELECT; no DDL, DML, refreshes, temporary tables or external requests.
-- Change hsid in params to audit another school. The table/view season is 2026.
-- Per-player output is capped at 200 rows; mapping output at 200 candidates.
-- All coverage aggregates use the complete selected school, not those caps.
-- No connection strings, feed URLs, raw player records or global ID lists appear.
WITH
params AS (
  SELECT '3722'::text AS hsid, '2026'::text AS canonical_season
),
selected_stage AS (
  SELECT f.playerid, f.display_name
  FROM public.flip_card_front_stage f
  JOIN params p ON btrim(f.hsid) = p.hsid
),
selected AS (
  SELECT DISTINCT
    CASE WHEN btrim(playerid) ~ '^[0-9]+([.]0+)?$'
      THEN coalesce(nullif(regexp_replace(split_part(btrim(playerid), '.', 1), '^0+', ''), ''), '0')
      ELSE btrim(playerid)
    END AS playerid,
    display_name
  FROM selected_stage
),
source_rows AS MATERIALIZED (
  SELECT 'identity_raw'::text AS source, playerid, NULL::text AS year, NULL::text AS teamid
  FROM public.tbc_players_raw
  UNION ALL
  SELECT 'identity_landing', playerid, NULL::text, NULL::text
  FROM public.tbc_players_landing_latest
  UNION ALL
  SELECT 'batting_landing', playerid, year, teamid FROM public.tbc_batting_landing_latest
  UNION ALL
  SELECT 'pitching_landing', playerid, year, teamid FROM public.tbc_pitching_landing_latest
  UNION ALL
  SELECT 'batting_historical_raw', playerid, year, teamid FROM public.tbc_batting_raw
  UNION ALL
  SELECT 'pitching_historical_raw', playerid, year, teamid FROM public.tbc_pitching_raw
  UNION ALL
  SELECT 'batting_current_raw', playerid, year, teamid FROM public.tbc_batting_2026_season_raw
  UNION ALL
  SELECT 'pitching_current_raw', playerid, year, teamid FROM public.tbc_pitching_2026_season_raw
  UNION ALL
  SELECT 'batting_resolved_view', playerid, year, teamid FROM public.v_tbc_batting_all_seasons_resolved
  UNION ALL
  SELECT 'pitching_resolved_view', playerid, year, teamid FROM public.v_tbc_pitching_all_seasons_resolved
),
normalized_sources AS MATERIALIZED (
  SELECT source, year, teamid,
    CASE WHEN btrim(playerid) ~ '^[0-9]+([.]0+)?$'
      THEN coalesce(nullif(regexp_replace(split_part(btrim(playerid), '.', 1), '^0+', ''), ''), '0')
      ELSE btrim(playerid)
    END AS playerid
  FROM source_rows
),
matched AS MATERIALIZED (
  SELECT n.*
  FROM normalized_sources n
  JOIN (SELECT DISTINCT playerid FROM selected) s USING (playerid)
),
source_names AS (
  SELECT * FROM (VALUES
    ('identity_raw'), ('identity_landing'),
    ('batting_landing'), ('pitching_landing'),
    ('batting_historical_raw'), ('pitching_historical_raw'),
    ('batting_current_raw'), ('pitching_current_raw'),
    ('batting_resolved_view'), ('pitching_resolved_view')
  ) names(source)
),
source_counts AS (
  SELECT source, count(*) AS rows, count(DISTINCT playerid) AS distinct_players
  FROM normalized_sources GROUP BY source
),
matched_counts AS (
  SELECT source, count(*) AS rows, count(DISTINCT playerid) AS distinct_players
  FROM matched GROUP BY source
),
coverage AS (
  SELECT n.source,
    coalesce(c.rows, 0) AS total_rows,
    coalesce(c.distinct_players, 0) AS total_distinct_players,
    coalesce(m.rows, 0) AS selected_school_rows,
    coalesce(m.distinct_players, 0) AS selected_school_players
  FROM source_names n
  LEFT JOIN source_counts c USING (source)
  LEFT JOIN matched_counts m USING (source)
),
per_player AS (
  SELECT s.playerid, s.display_name,
    count(*) FILTER (WHERE m.source = 'identity_raw') AS identity_raw,
    count(*) FILTER (WHERE m.source = 'identity_landing') AS identity_landing,
    count(*) FILTER (WHERE m.source = 'batting_landing') AS batting_landing,
    count(*) FILTER (WHERE m.source = 'pitching_landing') AS pitching_landing,
    count(*) FILTER (WHERE m.source = 'batting_historical_raw') AS batting_historical_raw,
    count(*) FILTER (WHERE m.source = 'pitching_historical_raw') AS pitching_historical_raw,
    count(*) FILTER (WHERE m.source = 'batting_current_raw') AS batting_current_raw,
    count(*) FILTER (WHERE m.source = 'pitching_current_raw') AS pitching_current_raw,
    count(*) FILTER (WHERE m.source = 'batting_resolved_view') AS batting_resolved_view,
    count(*) FILTER (WHERE m.source = 'pitching_resolved_view') AS pitching_resolved_view
  FROM selected s
  LEFT JOIN matched m USING (playerid)
  GROUP BY s.playerid, s.display_name
),
season_coverage AS (
  SELECT source,
    CASE WHEN year IS NULL THEN '<NULL>'
         WHEN length(year) > 32 THEN '<invalid long year>'
         ELSE year END AS stored_year,
    count(*) AS rows,
    count(DISTINCT playerid) AS distinct_players
  FROM normalized_sources
  WHERE source NOT IN ('identity_raw', 'identity_landing')
  GROUP BY source,
    CASE WHEN year IS NULL THEN '<NULL>'
         WHEN length(year) > 32 THEN '<invalid long year>'
         ELSE year END
),
current_year_routing AS (
  SELECT n.source, count(*) AS current_table_rows,
    count(*) FILTER (WHERE n.year IS DISTINCT FROM p.canonical_season)
      AS rows_excluded_by_exact_view_year_filter
  FROM normalized_sources n CROSS JOIN params p
  WHERE n.source IN ('batting_current_raw', 'pitching_current_raw')
  GROUP BY n.source
),
selected_stats_teamids AS (
  SELECT DISTINCT playerid, year, nullif(btrim(teamid), '') AS teamid
  FROM matched
  WHERE source IN ('batting_historical_raw', 'pitching_historical_raw',
                   'batting_current_raw', 'pitching_current_raw')
    AND nullif(btrim(teamid), '') IS NOT NULL
),
team_mappings AS (
  SELECT teamid, current_team_name AS team_name,
    current_org_or_conference_name AS organization_or_conference,
    level_label AS level, 'teamid_universe_mapping'::text AS source
  FROM public.teamid_universe_mapping
  WHERE teamid IN (SELECT teamid FROM selected_stats_teamids)
  UNION ALL
  SELECT teamid, school, conference, division, 'college_baseball_programs_with_conferences'
  FROM public.college_baseball_programs_with_conferences
  WHERE teamid IN (SELECT teamid FROM selected_stats_teamids)
),
mapping_candidates AS (
  SELECT s.playerid, s.year, s.teamid,
    coalesce(jsonb_agg(DISTINCT jsonb_build_object(
      'source', m.source, 'team', m.team_name,
      'organization_or_conference', m.organization_or_conference, 'level', m.level
    )) FILTER (WHERE m.teamid IS NOT NULL), '[]'::jsonb) AS candidates
  FROM selected_stats_teamids s
  LEFT JOIN team_mappings m USING (teamid)
  GROUP BY s.playerid, s.year, s.teamid
),
health AS (
  SELECT h.job_name, h.last_success_at, h.last_failure_at, h.consecutive_failures,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'feed', r->>'feed', 'downloadedRows', r->'downloadedRows',
        'insertedRows', r->'insertedRows', 'targetRows', r->'targetRows',
        'skippedRows', r->'skippedRows', 'skippedByReason', r->'skippedByReason'
      ) ORDER BY r->>'feed')
      FROM jsonb_array_elements(coalesce(h.last_result->'results', '[]'::jsonb)) r
    ), '[]'::jsonb) AS feed_counts
  FROM public.ingest_job_health h
  WHERE h.job_name = 'tbc_safe_ingest'
),
view_definitions AS (
  SELECT c.relname AS view_name, pg_get_viewdef(c.oid, true) AS definition
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('v_tbc_batting_all_seasons_resolved', 'v_tbc_pitching_all_seasons_resolved')
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'database', current_database(),
  'hsid', (SELECT hsid FROM params),
  'canonical_season', (SELECT canonical_season FROM params),
  'selected_stage_rows', (SELECT count(*) FROM selected_stage),
  'selected_distinct_players', (SELECT count(DISTINCT playerid) FROM selected),
  'coverage', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.source) FROM coverage c),
  'players', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.playerid)
    FROM (SELECT * FROM per_player ORDER BY playerid LIMIT 200) p), '[]'::jsonb),
  'players_omitted', greatest((SELECT count(*) FROM per_player) - 200, 0),
  'season_coverage', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source, s.stored_year) FROM season_coverage s),
  'current_table_year_routing', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.source) FROM current_year_routing r),
  'team_mapping_candidates', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.playerid, m.year, m.teamid)
    FROM (SELECT * FROM mapping_candidates ORDER BY playerid, year, teamid LIMIT 200) m), '[]'::jsonb),
  'team_mapping_candidates_omitted', greatest((SELECT count(*) FROM mapping_candidates) - 200, 0),
  'ingest_health', coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM health h), '[]'::jsonb),
  'view_definitions', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.view_name) FROM view_definitions v)
) AS audit;
