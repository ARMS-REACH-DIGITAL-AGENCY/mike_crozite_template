-- Apply AFTER 20261105_tbc_read_cutover_after_release.sql on an isolated branch.
-- Keep the complete historical archive, but prefer the refreshed 2026 daily feed
-- for matching player/team/season stints. Never UNION overlapping totals.
-- The earlier cutover's archive-only views otherwise freeze daily statistics.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.tbc_complete_batting_history) <> 501242
     OR (SELECT count(*) FROM public.tbc_complete_pitching_history) <> 438097
     OR position('tbc_complete_batting_history' in
          pg_get_viewdef('public.v_tbc_batting_all_seasons_resolved'::regclass,true)) = 0
  THEN
    RAISE EXCEPTION 'Complete-history read cutover must be verified first';
  END IF;
END;
$guard$;

CREATE INDEX IF NOT EXISTS idx_tbc_daily_bat_player_team_year
  ON public.tbc_batting_2026_season_raw(playerid,teamid,year);
CREATE INDEX IF NOT EXISTS idx_tbc_daily_pitch_player_team_year
  ON public.tbc_pitching_2026_season_raw(playerid,teamid,year);

-- Columns/types match exactly (46 batting / 40 pitching). Daily rows replace
-- the archive at the same player/team/year grain; other teams and split years
-- remain untouched, and daily-only players are included.
CREATE OR REPLACE VIEW public.v_tbc_batting_all_seasons_resolved AS
  SELECT a.* FROM public.tbc_complete_batting_history a
  WHERE a.year IS DISTINCT FROM '2026'
    OR NOT EXISTS (
      SELECT 1 FROM public.tbc_batting_2026_season_raw d
      WHERE d.year='2026' AND d.playerid=a.playerid
        AND d.teamid IS NOT DISTINCT FROM a.teamid
    )
  UNION ALL
  SELECT d.* FROM public.tbc_batting_2026_season_raw d
  WHERE d.year='2026';

CREATE OR REPLACE VIEW public.v_tbc_pitching_all_seasons_resolved AS
  SELECT a.* FROM public.tbc_complete_pitching_history a
  WHERE a.year IS DISTINCT FROM '2026'
    OR NOT EXISTS (
      SELECT 1 FROM public.tbc_pitching_2026_season_raw d
      WHERE d.year='2026' AND d.playerid=a.playerid
        AND d.teamid IS NOT DISTINCT FROM a.teamid
    )
  UNION ALL
  SELECT d.* FROM public.tbc_pitching_2026_season_raw d
  WHERE d.year='2026';

-- Refresh after each successful daily batting + pitching sync, in a separate
-- short transaction. No page view performs this aggregation.
CREATE OR REPLACE FUNCTION public.prepare_tbc_verified_2026_participation()
RETURNS TABLE(players bigint, batting_source_rows bigint, pitching_source_rows bigint)
LANGUAGE plpgsql AS $fn$
DECLARE v_bat bigint; v_pitch bigint;
BEGIN
  SELECT count(*) INTO v_bat FROM public.tbc_complete_batting_history;
  SELECT count(*) INTO v_pitch FROM public.tbc_complete_pitching_history;
  IF v_bat <> 501242 OR v_pitch <> 438097 THEN
    RAISE EXCEPTION 'Historical archive does not match verified snapshot';
  END IF;
  INSERT INTO public.tbc_verified_2026_participation AS t
     (playerid,batting_rows,pitching_rows)
  WITH b AS (
    SELECT playerid,count(*)::integer n FROM public.v_tbc_batting_all_seasons_resolved
    WHERE year='2026' GROUP BY playerid
  ), p AS (
    SELECT playerid,count(*)::integer n FROM public.v_tbc_pitching_all_seasons_resolved
    WHERE year='2026' GROUP BY playerid
  )
  SELECT coalesce(b.playerid,p.playerid),coalesce(b.n,0),coalesce(p.n,0)
    FROM b FULL JOIN p USING(playerid)
  ON CONFLICT(playerid) DO UPDATE SET
    batting_rows=excluded.batting_rows,
    pitching_rows=excluded.pitching_rows,
    prepared_at=now()
  WHERE (t.batting_rows,t.pitching_rows)
        IS DISTINCT FROM (excluded.batting_rows,excluded.pitching_rows);
  RETURN QUERY SELECT count(*)::bigint,v_bat,v_pitch
    FROM public.tbc_verified_2026_participation;
END;
$fn$;

-- Source-owned UNKNOWN cards can gain ACTIVE status when new evidence arrives.
-- Do not touch manual retirements, transactions, existing fan profiles or
-- unverified team/level assignments.
CREATE OR REPLACE FUNCTION public.reconcile_pending_tbc_2026_batch(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE v_updated integer;
BEGIN
  IF p_limit<1 OR p_limit>2000 THEN
    RAISE EXCEPTION 'Limit must be 1..2000';
  END IF;
  WITH candidates AS (
    SELECT f.playerid
    FROM public.flip_card_front_stage f
    JOIN public.tbc_verified_2026_participation e USING(playerid)
    WHERE f.status_label='UNKNOWN'
      AND f.source_summary->>'source'='tbc_player_feed'
      AND f.source_summary#>>'{status_classification,source}'='pending_stat_evidence'
      AND f.last_transaction_type IS NULL
      AND f.current_team_source IS NULL
    ORDER BY f.playerid
    LIMIT p_limit
    FOR UPDATE OF f SKIP LOCKED
  ), changed AS (
    UPDATE public.flip_card_front_stage f
       SET status_label='ACTIVE',display_status_label='ACTIVE',
           updated_at=now(),
           source_summary=jsonb_set(coalesce(f.source_summary,'{}'::jsonb),
             '{status_classification}',
             jsonb_build_object(
               'source','tbc_combined_2026_participation',
               'rule','verified_2026_participation',
               'evidence','historical_archive_or_daily_feed',
               'supersedes','pending_stat_evidence',
               'applied_at',now()::text),true)
    FROM candidates c WHERE f.playerid=c.playerid
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_updated FROM changed;
  RETURN v_updated;
END;
$fn$;
COMMIT;
