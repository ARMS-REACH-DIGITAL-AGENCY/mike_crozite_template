-- Cached 2026 HS rosters from verified ZIP plus daily stats.
-- Isolated-branch migration only; never modifies live roster/card tables.
CREATE TABLE IF NOT EXISTS public.tbc_verified_2026_active_school_stage (
 source_run_id uuid NOT NULL,hsid integer NOT NULL,playerid text NOT NULL,
 evidence text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_run_id,hsid,playerid));
CREATE INDEX IF NOT EXISTS idx_tbc_verified_2026_active_school_hsid
 ON public.tbc_verified_2026_active_school_stage(hsid,source_run_id);
CREATE TABLE IF NOT EXISTS public.tbc_school_active_2026_count_stage (
 source_run_id uuid NOT NULL,hsid integer NOT NULL,
 active_2026_count integer NOT NULL,refreshed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_run_id,hsid));
CREATE OR REPLACE FUNCTION public.tbc_refresh_verified_school_2026(p_source_run uuid,p_archive_run uuid)
RETURNS TABLE(verified_player_school_links bigint,schools bigint)
LANGUAGE plpgsql AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tbc_historical_archive_runs
 WHERE run_id=p_archive_run AND status='verified') THEN
  RAISE EXCEPTION 'Verified historical ZIP archive required'; END IF;
 IF (SELECT COUNT(*) FROM public.tbc_player_hsid_candidates WHERE source_run_id=p_source_run)<208427 THEN
  RAISE EXCEPTION 'Crosswalk incomplete'; END IF;
 WITH active AS (
 SELECT playerid,'archive' AS origin FROM public.tbc_history_player_coverage
 WHERE run_id=p_archive_run AND (batting_2026_rows>0 OR pitching_2026_rows>0)
 UNION ALL SELECT playerid,'daily' FROM public.tbc_batting_2026_season_raw WHERE year='2026'
 UNION ALL SELECT playerid,'daily' FROM public.tbc_pitching_2026_season_raw WHERE year='2026'
 ), grouped AS (
 SELECT playerid,CASE WHEN bool_or(origin='archive') AND bool_or(origin='daily') THEN 'both'
 WHEN bool_or(origin='archive') THEN 'archive' ELSE 'daily' END AS evidence
 FROM active WHERE playerid IS NOT NULL GROUP BY playerid
 )
 INSERT INTO public.tbc_verified_2026_active_school_stage(source_run_id,hsid,playerid,evidence)
 SELECT p_source_run,c.matched_hsid,c.playerid,a.evidence
 FROM grouped a JOIN public.tbc_player_hsid_candidates c
 ON c.source_run_id=p_source_run AND c.playerid=a.playerid
 WHERE c.matched_hsid IS NOT NULL AND c.review_reason IN
 ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD')
 ON CONFLICT(source_run_id,hsid,playerid) DO UPDATE SET evidence=EXCLUDED.evidence;
 INSERT INTO public.tbc_school_active_2026_count_stage(source_run_id,hsid,active_2026_count)
 SELECT p_source_run,hsid,COUNT(*)::int FROM public.tbc_verified_2026_active_school_stage
 WHERE source_run_id=p_source_run GROUP BY hsid
 ON CONFLICT(source_run_id,hsid) DO UPDATE SET
 active_2026_count=EXCLUDED.active_2026_count,refreshed_at=now();
 RETURN QUERY SELECT COUNT(*)::bigint,COUNT(DISTINCT hsid)::bigint
 FROM public.tbc_verified_2026_active_school_stage WHERE source_run_id=p_source_run;
END;
$fn$;
