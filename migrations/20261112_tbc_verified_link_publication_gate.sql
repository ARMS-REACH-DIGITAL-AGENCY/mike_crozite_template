-- 2026-11-12: idempotent school-link preparation gate for TBC player publication.
-- Run on isolated Neon QA first; install in production only after QA passes.
-- Existing verified links retain their immutable identity and original source provenance.
-- Batch reads use one indexed source_run_id marker; fan-facing reads are unchanged.
-- Safe rerun: CREATE TABLE IF NOT EXISTS and CREATE OR REPLACE FUNCTION.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tbc_verified_school_link_preparation_runs (
  source_run_id uuid PRIMARY KEY REFERENCES public.tbc_players_full_feed_audit_runs(run_id),
  eligible_links bigint NOT NULL CHECK (eligible_links > 0),
  matching_links bigint NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbc_verified_link_counts_match CHECK (eligible_links = matching_links)
);

CREATE OR REPLACE FUNCTION public.prepare_tbc_verified_school_links(p_run_id uuid)
RETURNS TABLE(source_candidates bigint,valid_school_links bigint,school_conflicts bigint)
LANGUAGE plpgsql AS $fn$
DECLARE v_source bigint; v_candidates bigint; v_conflicts bigint;
        v_eligible bigint; v_matching bigint;
BEGIN
  SELECT source_rows INTO v_source
    FROM public.tbc_players_full_feed_audit_runs
   WHERE run_id=p_run_id AND status IN ('complete','partial') AND source_rows>=208427;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Unverified source run'; END IF;
  SELECT count(*) INTO v_candidates FROM public.tbc_player_hsid_candidates
   WHERE source_run_id=p_run_id;
  IF v_candidates<>v_source THEN RAISE EXCEPTION 'Candidate snapshot incomplete'; END IF;

  SELECT count(*) INTO v_conflicts
    FROM public.tbc_player_hsid_candidates c
    JOIN public.tbc_player_verified_school_links l USING(playerid)
   WHERE c.source_run_id=p_run_id AND c.matched_hsid IS NOT NULL
     AND c.review_reason IN ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD')
     AND l.hsid<>c.matched_hsid;
  INSERT INTO public.tbc_player_verified_school_links
    (playerid,hsid,source_run_id,source_row,source_school)
  SELECT c.playerid,c.matched_hsid,p_run_id,c.source_row,c.source_school
    FROM public.tbc_player_hsid_candidates c
   WHERE c.source_run_id=p_run_id AND c.matched_hsid IS NOT NULL
     AND c.review_reason IN ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD')
  ON CONFLICT(playerid) DO NOTHING;

  -- Validate the current immutable snapshot exactly once, during preparation.
  -- Historical source_run_id values on unchanged player-school links are
  -- provenance, not evidence that the current snapshot is missing its links.
  IF v_conflicts=0 THEN
    SELECT count(*)::bigint,
           count(*) FILTER (WHERE l.hsid=c.matched_hsid)::bigint
      INTO v_eligible,v_matching
      FROM public.tbc_player_hsid_candidates c
      LEFT JOIN public.tbc_player_verified_school_links l USING(playerid)
     WHERE c.source_run_id=p_run_id AND c.matched_hsid IS NOT NULL
       AND c.review_reason IN ('VERIFIED_EXISTING_CARD','UNIQUE_SCHOOL_NEEDS_CARD');

    IF v_eligible=0 OR v_matching<>v_eligible THEN
      RAISE EXCEPTION 'Verified HSID preparation mismatch for run %: eligible %, matching %',
        p_run_id,v_eligible,v_matching;
    END IF;

    INSERT INTO public.tbc_verified_school_link_preparation_runs
      (source_run_id,eligible_links,matching_links,validated_at)
    VALUES (p_run_id,v_eligible,v_matching,now())
    ON CONFLICT(source_run_id) DO UPDATE
      SET eligible_links=excluded.eligible_links,
          matching_links=excluded.matching_links,
          validated_at=excluded.validated_at;
  END IF;

  RETURN QUERY SELECT v_candidates,
    (SELECT count(*)::bigint FROM public.tbc_player_verified_school_links),
    v_conflicts;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.publish_verified_tbc_flip_cards_batch(
  p_run_id uuid,p_batch_size integer DEFAULT 500
) RETURNS TABLE(processed_batch integer,created_batch integer,held_batch integer,
                processed_total bigint,created_total bigint,finished boolean)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_raw_cursor integer; v_raw_done boolean; v_cursor integer;
  v_processed bigint;v_created bigint;v_held bigint;v_finished boolean;
  v_taken integer;v_added integer;v_holds integer;v_last integer;
  v_source_count bigint;v_candidate_count bigint;
BEGIN
  IF p_batch_size<1 OR p_batch_size>2000 THEN
    RAISE EXCEPTION 'Batch size must be 1..2000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('yatstats_tbc_stage_publish'),hashtext(p_run_id::text));
  SELECT source_rows INTO v_source_count FROM public.tbc_players_full_feed_audit_runs
    WHERE run_id=p_run_id AND status IN ('complete','partial') AND source_rows>=208427;
  SELECT count(*) INTO v_candidate_count FROM public.tbc_player_hsid_candidates
    WHERE source_run_id=p_run_id;
  IF v_source_count IS NULL OR v_candidate_count<>v_source_count THEN
    RAISE EXCEPTION 'Verified complete source/candidates required';
  END IF;
  SELECT last_source_row,completed INTO v_raw_cursor,v_raw_done
    FROM public.tbc_player_raw_promotion_progress WHERE source_run_id=p_run_id;
  IF v_raw_cursor IS NULL THEN
    RAISE EXCEPTION 'Raw Players master promotion must run first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tbc_verified_2026_participation LIMIT 1) THEN
    RAISE EXCEPTION 'Prepare complete 2026 participation first';
  END IF;
  -- PK lookup on one per-run validation row, not a repeated unindexed
  -- provenance scan through hundreds of thousands of verified school links.
  IF NOT EXISTS (
    SELECT 1 FROM public.tbc_verified_school_link_preparation_runs
     WHERE source_run_id=p_run_id AND eligible_links=matching_links
       AND eligible_links>0
  ) THEN
    RAISE EXCEPTION 'Validate verified HSID school links for this source first';
  END IF;
  INSERT INTO public.tbc_flip_card_publication_progress(source_run_id)
  VALUES(p_run_id) ON CONFLICT DO NOTHING;
  SELECT last_source_row,processed_source_rows,newly_created_cards,identity_holds,completed
    INTO v_cursor,v_processed,v_created,v_held,v_finished
    FROM public.tbc_flip_card_publication_progress
   WHERE source_run_id=p_run_id FOR UPDATE;
  IF v_finished THEN
    RETURN QUERY SELECT 0,0,0,v_processed,v_created,true;
    RETURN;
  END IF;

  WITH batch AS MATERIALIZED (
    SELECT c.source_row,c.playerid,c.matched_hsid,
           a.firstname,a.lastname,a.highlevel,a.posit,
           e.playerid IS NOT NULL AS played_2026,
           CASE UPPER(BTRIM(COALESCE(a.highlevel,'')))
             WHEN 'MLB' THEN 'MLB'
             WHEN 'AAA' THEN 'TRIPLE-A'
             WHEN 'AA' THEN 'DOUBLE-A'
             WHEN 'A+' THEN 'HIGH-A'
             WHEN 'A' THEN 'SINGLE-A'
             WHEN 'A-' THEN 'SINGLE-A'
             WHEN 'RK' THEN 'ROOKIE'
             WHEN 'INDY' THEN 'INDY'
             WHEN 'INTL' THEN 'INTERNATIONAL'
             WHEN 'NAIA' THEN 'NAIA'
             WHEN 'JRCOLLEGE' THEN 'NJCAA'
             ELSE NULL END AS highest_known_level,
           (EXISTS(SELECT 1 FROM public.tbc_complete_batting_history bh
                     WHERE bh.playerid=c.playerid LIMIT 1)
             OR EXISTS(SELECT 1 FROM public.tbc_complete_pitching_history ph
                       WHERE ph.playerid=c.playerid LIMIT 1)) AS has_history
      FROM public.tbc_player_hsid_candidates c
      JOIN public.tbc_players_full_feed_audit_rows a
        ON a.run_id=c.source_run_id AND a.playerid=c.playerid
      JOIN public.tbc_players_raw r ON r.playerid=c.playerid
      JOIN public.tbc_player_verified_school_links l
        ON l.playerid=c.playerid AND l.hsid=c.matched_hsid
      LEFT JOIN public.tbc_verified_2026_participation e ON e.playerid=c.playerid
     WHERE c.source_run_id=p_run_id
       AND c.review_reason='UNIQUE_SCHOOL_NEEDS_CARD'
       AND c.source_row>v_cursor AND c.source_row<=v_raw_cursor
     ORDER BY c.source_row LIMIT p_batch_size
  ),
  checked AS MATERIALIZED (
    SELECT b.*,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.player_source_map m
          WHERE m.source='tbc' AND m.source_player_id=b.playerid
            AND m.playerid<>b.playerid
            AND m.is_verified IS TRUE
            AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
        ) THEN 'verified_crosswalk_to_other_player'
        WHEN EXISTS (
          SELECT 1 FROM public.flip_card_front_stage f
          WHERE f.hsid=b.matched_hsid::text
            AND f.playerid<>b.playerid
            AND f.playerid LIKE 'YAT%'
            AND regexp_replace(lower(coalesce(f.first_name,'')),'[^a-z]','','g')
              = regexp_replace(lower(coalesce(b.firstname,'')),'[^a-z]','','g')
            AND regexp_replace(lower(coalesce(f.last_name,'')),'[^a-z]','','g')
              = regexp_replace(lower(coalesce(b.lastname,'')),'[^a-z]','','g')
            AND nullif(btrim(coalesce(b.lastname,'')),'') IS NOT NULL
            AND NOT EXISTS(
              SELECT 1 FROM public.player_source_map m
              WHERE m.source='tbc' AND m.source_player_id=b.playerid
                AND m.playerid=f.playerid
                AND m.match_method='rejected_bad_identity_match'
            )
        ) THEN 'same_name_as_contributed_YAT_player'
        ELSE NULL
      END AS hold_reason
    FROM batch b
  ),
  held AS (
    INSERT INTO public.tbc_flip_card_publication_holds
      (source_run_id,playerid,source_row,hsid,reason)
    SELECT p_run_id,c.playerid,c.source_row,c.matched_hsid,c.hold_reason
      FROM checked c WHERE c.hold_reason IS NOT NULL
    ON CONFLICT(source_run_id,playerid) DO NOTHING
    RETURNING playerid
  ),
  inserted AS (
    INSERT INTO public.flip_card_front_stage
      (playerid,hsid,display_name,first_name,last_name,position,
       status_label,display_status_label,level_label,display_level_label,
       highest_level_label,highest_level_checked_at,source_summary)
    SELECT c.playerid,c.matched_hsid::text,
           BTRIM(regexp_replace(coalesce(c.firstname,'')||' '||coalesce(c.lastname,''),
                                '[[:space:]]+', ' ', 'g')),
           BTRIM(regexp_replace(coalesce(c.firstname,''), '[[:space:]]+', ' ', 'g')),
           BTRIM(regexp_replace(coalesce(c.lastname,''), '[[:space:]]+', ' ', 'g')),c.posit,
           CASE WHEN c.played_2026 THEN 'ACTIVE'
                WHEN c.has_history THEN 'RETIRED' ELSE 'UNKNOWN' END,
           CASE WHEN c.played_2026 THEN 'ACTIVE'
                WHEN c.has_history THEN 'RETIRED' ELSE 'UNKNOWN' END,
           CASE WHEN NOT c.played_2026 THEN c.highest_known_level ELSE NULL END,
           CASE WHEN NOT c.played_2026 THEN c.highest_known_level ELSE NULL END,
           c.highest_known_level,
           CASE WHEN c.highest_known_level IS NOT NULL THEN now() ELSE NULL END,
           jsonb_build_object(
             'source','tbc_player_feed',
             'source_run_id',p_run_id::text,
             'verified_hsid',c.matched_hsid,
             'status_classification',jsonb_build_object(
               'source',CASE WHEN c.played_2026 THEN 'tbc_complete_history_2026'
                             WHEN c.has_history THEN 'tbc_historical_cutoff'
                             ELSE 'pending_stat_evidence' END,
               'evidence',CASE WHEN c.played_2026 THEN 'documented_2026_participation'
                               WHEN c.has_history THEN 'no_2026_participation'
                               ELSE 'no_verified_stat_rows' END))
      FROM checked c WHERE c.hold_reason IS NULL
    ON CONFLICT(playerid) DO NOTHING
    RETURNING playerid
  )
  SELECT (SELECT count(*)::integer FROM batch),
         (SELECT count(*)::integer FROM inserted),
         (SELECT count(*)::integer FROM held),
         (SELECT max(source_row) FROM batch)
    INTO v_taken,v_added,v_holds,v_last;

  IF v_taken=0 THEN
    v_last=v_raw_cursor;
  END IF;
  UPDATE public.tbc_flip_card_publication_progress t SET
    last_source_row=greatest(t.last_source_row,v_last),
    processed_source_rows=t.processed_source_rows+v_taken,
    newly_created_cards=t.newly_created_cards+v_added,
    identity_holds=t.identity_holds+v_holds,
    completed=COALESCE(v_raw_done,false) AND NOT EXISTS(
      SELECT 1 FROM public.tbc_player_hsid_candidates c
      WHERE c.source_run_id=p_run_id
        AND c.review_reason='UNIQUE_SCHOOL_NEEDS_CARD'
        AND c.source_row>v_last
    ),
    updated_at=now()
  WHERE t.source_run_id=p_run_id
  RETURNING t.processed_source_rows,t.newly_created_cards,t.identity_holds,t.completed
  INTO v_processed,v_created,v_held,v_finished;

  RETURN QUERY SELECT v_taken,v_added,v_holds,v_processed,v_created,v_finished;
END;
$fn$;

COMMIT;
