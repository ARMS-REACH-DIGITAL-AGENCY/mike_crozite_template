-- Additive discovery queue: ingest raw TBC stats even when Team IDs are new.
-- Never invent a canonical identity or change canonical teamid_universe_mapping.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tbc_teamid_reconciliation_queue (
  teamid text PRIMARY KEY,
  resolution_status text NOT NULL CHECK (resolution_status IN ('UNMAPPED','INCOMPLETE','INVALID_ID','RESOLVED')),
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_stat_rows bigint NOT NULL DEFAULT 0,
  first_season text,
  last_season text,
  canonical_team_name text,
  canonical_level text,
  canonical_org text,
  first_detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS tbc_teamid_queue_priority
ON public.tbc_teamid_reconciliation_queue (resolution_status,total_stat_rows DESC,updated_at DESC);
CREATE OR REPLACE FUNCTION public.refresh_tbc_teamid_reconciliation_queue()
RETURNS TABLE (unmapped integer,incomplete integer,invalid_id integer,resolved integer,queue_rows integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public,pg_temp
AS $reconcile$
BEGIN
  -- Every distinct identifier is retained from raw feeds, including future
  -- Team IDs; no join/filter to canonical is used when ingesting raw seasons.
  -- Only 2026 is authoritative from the current-season feed; the archived
  -- feed holds prior years and may also contain redundant 2026 snapshots.
  WITH feed AS MATERIALIZED (
    SELECT NULLIF(BTRIM(teamid),'') AS teamid,year,'historical_batting'::text AS source
      FROM public.tbc_batting_raw WHERE year IS DISTINCT FROM '2026'
    UNION ALL SELECT NULLIF(BTRIM(teamid),''),year,'historical_pitching'
      FROM public.tbc_pitching_raw WHERE year IS DISTINCT FROM '2026'
    UNION ALL SELECT NULLIF(BTRIM(teamid),''),year,'current_batting_2026'
      FROM public.tbc_batting_2026_season_raw WHERE year='2026'
    UNION ALL SELECT NULLIF(BTRIM(teamid),''),year,'current_pitching_2026'
      FROM public.tbc_pitching_2026_season_raw WHERE year='2026'
  ), per_source AS MATERIALIZED (
    SELECT COALESCE(teamid,'') AS teamid,source,
           COUNT(*)::bigint AS stat_rows,MIN(year) AS first_season,
           MAX(year) AS last_season
    FROM feed GROUP BY COALESCE(teamid,''),source
  ), consolidated AS MATERIALIZED (
    SELECT teamid,SUM(stat_rows)::bigint AS total_stat_rows,
           MIN(first_season) AS first_season,MAX(last_season) AS last_season,
           jsonb_object_agg(source,stat_rows) AS evidence
    FROM per_source GROUP BY teamid
  ), labeled AS MATERIALIZED (
    SELECT a.*,
      CASE WHEN a.teamid IN('','0') THEN 'INVALID_ID'
           WHEN c.teamid IS NULL THEN 'UNMAPPED'
           WHEN NULLIF(BTRIM(c.current_team_name),'') IS NULL
             OR NULLIF(BTRIM(c.current_org_or_conference_name),'') IS NULL
             OR c.level_label IS NULL OR c.level_label NOT IN (
              'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
              'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3',
              'NAIA','NJCAA','CCCAA','NWAC','HIGH SCHOOL') THEN 'INCOMPLETE'
           ELSE 'RESOLVED'
      END AS resolution_status,
      c.current_team_name,c.level_label,c.current_org_or_conference_name
    FROM consolidated a LEFT JOIN public.teamid_universe_mapping c ON c.teamid=a.teamid
  )
  INSERT INTO public.tbc_teamid_reconciliation_queue AS q (
   teamid,resolution_status,source_evidence,total_stat_rows,first_season,last_season,
   canonical_team_name,canonical_level,canonical_org,last_seen_at,last_resolved_at,updated_at)
  SELECT teamid,resolution_status,evidence,total_stat_rows,first_season,last_season,
    current_team_name,level_label,current_org_or_conference_name,clock_timestamp(),
    CASE WHEN resolution_status='RESOLVED' THEN clock_timestamp() ELSE NULL END,clock_timestamp()
  FROM labeled
  ON CONFLICT(teamid) DO UPDATE SET
   resolution_status=EXCLUDED.resolution_status,
   source_evidence=EXCLUDED.source_evidence,
   total_stat_rows=EXCLUDED.total_stat_rows,
   first_season=EXCLUDED.first_season,last_season=EXCLUDED.last_season,
   canonical_team_name=EXCLUDED.canonical_team_name,
   canonical_level=EXCLUDED.canonical_level,canonical_org=EXCLUDED.canonical_org,
   last_seen_at=clock_timestamp(),
   last_resolved_at=CASE WHEN EXCLUDED.resolution_status='RESOLVED'
      THEN COALESCE(q.last_resolved_at,clock_timestamp()) ELSE NULL END,
   updated_at=clock_timestamp();

  RETURN QUERY SELECT
   COUNT(*) FILTER(WHERE resolution_status='UNMAPPED')::int,
   COUNT(*) FILTER(WHERE resolution_status='INCOMPLETE')::int,
   COUNT(*) FILTER(WHERE resolution_status='INVALID_ID')::int,
   COUNT(*) FILTER(WHERE resolution_status='RESOLVED')::int,
   COUNT(*)::int
  FROM public.tbc_teamid_reconciliation_queue;
END;
$reconcile$;
COMMIT;
