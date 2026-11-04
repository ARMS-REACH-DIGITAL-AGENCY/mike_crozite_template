-- 2026-11-04: build a repeatable, non-publishing TBC identity/HSID candidate layer.
--
-- Run against an isolated Neon branch initially. DO NOT execute against
-- production until issue #675 performance and rollback release checks pass.
-- This migration does not change tbc_players_raw or flip_card_front_stage.
--
-- The source archive is append-only by run_id; the candidate table captures
-- one immutable snapshot per run and never changes an existing run's records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.tbc_player_hsid_candidates (
  source_run_id uuid NOT NULL,
  playerid text NOT NULL,
  source_row integer NOT NULL,
  source_firstname text,
  source_lastname text,
  source_school text,
  source_row_error text,
  matched_hsid integer,
  candidate_hsids integer[],
  matching_school_count integer NOT NULL,
  existing_card_playerid text,
  existing_card_hsid text,
  review_reason text NOT NULL,
  source_captured_at timestamptz NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_run_id, playerid),
  CONSTRAINT tbc_hsid_candidate_reason_check CHECK (review_reason IN (
    'SOURCE_QUARANTINED', 'NO_MATCHING_SCHOOL', 'AMBIGUOUS_SCHOOL',
    'EXISTING_CARD_HSID_MISMATCH', 'EXISTING_CARD_HSID_MISSING',
    'VERIFIED_EXISTING_CARD', 'UNIQUE_SCHOOL_NEEDS_CARD'
  ))
);
CREATE INDEX IF NOT EXISTS tbc_hsid_candidates_review_by_run_idx
  ON public.tbc_player_hsid_candidates (source_run_id, review_reason);
CREATE INDEX IF NOT EXISTS tbc_hsid_candidates_hsid_by_run_idx
  ON public.tbc_player_hsid_candidates (source_run_id, matched_hsid)
  WHERE matched_hsid IS NOT NULL;

-- Promote a source run into candidates only after it passes completeness
-- checks; the source archive's exact row/ID counts must reconcile.
CREATE OR REPLACE FUNCTION public.prepare_tbc_player_hsid_candidates(p_run_id uuid)
RETURNS TABLE (candidate_rows bigint, unique_school_rows bigint, review_rows bigint)
LANGUAGE plpgsql AS $$
DECLARE
  v_source_rows bigint;
  v_distinct_ids bigint;
  v_verified_rows integer;
  v_verified_ids integer;
BEGIN
  SELECT source_rows, unique_ids
    INTO v_verified_rows, v_verified_ids
    FROM public.tbc_players_full_feed_audit_runs
   WHERE run_id = p_run_id AND status IN ('complete', 'partial');

  IF v_verified_rows IS NULL OR v_verified_rows < 208427
     OR v_verified_ids IS NULL OR v_verified_rows <> v_verified_ids THEN
    RAISE EXCEPTION 'Full TBC source run is absent or unverified; refuse crosswalk preparation';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT playerid)
    INTO v_source_rows, v_distinct_ids
    FROM public.tbc_players_full_feed_audit_rows WHERE run_id=p_run_id;
  IF v_source_rows <> v_verified_rows OR v_distinct_ids <> v_verified_ids THEN
    RAISE EXCEPTION 'Source row/ID mismatch: table=%, distinct=%, declared=%',
      v_source_rows, v_distinct_ids, v_verified_rows;
  END IF;

  -- Use an advisory lock to avoid two agents preparing the same run.
  PERFORM pg_advisory_xact_lock(hashtext('yatstats_tbc_hsid_candidates'));
  IF EXISTS (SELECT 1 FROM public.tbc_player_hsid_candidates WHERE source_run_id=p_run_id) THEN
    RAISE EXCEPTION 'Run % already prepared; candidate snapshot is immutable', p_run_id;
  END IF;

  INSERT INTO public.tbc_player_hsid_candidates (
    source_run_id, playerid, source_row, source_firstname, source_lastname,
    source_school, source_row_error, matched_hsid, candidate_hsids,
    matching_school_count, existing_card_playerid, existing_card_hsid,
    review_reason, source_captured_at
  )
  WITH school_names AS MATERIALIZED (
    SELECT
      hsid,
      regexp_replace(lower(trim(hs_lookup_key)), '[.\\s]+', ' ', 'g') AS normalized_school
    FROM public.tbc_schools_raw
    WHERE hs_lookup_key IS NOT NULL AND trim(hs_lookup_key) <> ''
  ),
  linked AS (
    SELECT
      a.playerid, a.source_row, a.firstname, a.lastname, a.high_school,
      a.rejection_reason,
      COUNT(DISTINCT sn.hsid)::integer AS match_count,
      array_agg(DISTINCT sn.hsid ORDER BY sn.hsid)
        FILTER (WHERE sn.hsid IS NOT NULL) AS hsids
    FROM public.tbc_players_full_feed_audit_rows a
    LEFT JOIN school_names sn
      ON regexp_replace(lower(trim(a.high_school)), '[.\\s]+', ' ', 'g') = sn.normalized_school
    WHERE a.run_id=p_run_id
    GROUP BY a.playerid, a.source_row, a.firstname, a.lastname,
             a.high_school, a.rejection_reason
  )
  SELECT p_run_id, l.playerid, l.source_row, l.firstname, l.lastname,
         l.high_school, l.rejection_reason,
         CASE WHEN l.rejection_reason IS NULL AND l.match_count=1
              THEN l.hsids[1] ELSE NULL END,
         COALESCE(l.hsids, ARRAY[]::integer[]), l.match_count,
         f.playerid, f.hsid,
         CASE
           WHEN l.rejection_reason IS NOT NULL THEN 'SOURCE_QUARANTINED'
           WHEN l.match_count=0 THEN 'NO_MATCHING_SCHOOL'
           WHEN l.match_count>1 THEN 'AMBIGUOUS_SCHOOL'
           WHEN f.playerid IS NOT NULL AND
                (f.hsid IS NULL OR trim(f.hsid)='') THEN 'EXISTING_CARD_HSID_MISSING'
           WHEN f.playerid IS NOT NULL AND f.hsid IS DISTINCT FROM l.hsids[1]::text
             THEN 'EXISTING_CARD_HSID_MISMATCH'
           WHEN f.playerid IS NOT NULL THEN 'VERIFIED_EXISTING_CARD'
           ELSE 'UNIQUE_SCHOOL_NEEDS_CARD'
         END,
         r.captured_at
  FROM linked l
  JOIN public.tbc_players_full_feed_audit_runs r ON r.run_id=p_run_id
  LEFT JOIN public.flip_card_front_stage f ON f.playerid=l.playerid;

  RETURN QUERY
  SELECT COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE review_reason IN ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD'))::bigint,
    COUNT(*) FILTER (WHERE review_reason NOT IN ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD'))::bigint
  FROM public.tbc_player_hsid_candidates
  WHERE source_run_id=p_run_id;
END;
$$;

COMMIT;
