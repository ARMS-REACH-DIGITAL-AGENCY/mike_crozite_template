-- YAT?STATS 2026 verified player publication. TEST ON AN ISOLATED NEON BRANCH.
-- No cron changes, no drop/truncate, no automatic production promotion.
-- Requires the candidate migration from PR #683 and the resumable raw merge from PR #691.
-- Complete ZIP batting/pitching tables must be present.
-- Run each function in separate short transactions and inspect returned counts.
CREATE TABLE IF NOT EXISTS public.tbc_verified_2026_participation (
  playerid text PRIMARY KEY,
  batting_rows integer NOT NULL DEFAULT 0,
  pitching_rows integer NOT NULL DEFAULT 0,
  prepared_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tbc_player_verified_school_links (
  playerid text PRIMARY KEY,
  hsid integer NOT NULL REFERENCES public.tbc_schools_raw(hsid),
  source_run_id uuid NOT NULL,
  source_row integer NOT NULL,
  source_school text,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tbc_verified_school_hsid_player
  ON public.tbc_player_verified_school_links(hsid,playerid);

CREATE TABLE IF NOT EXISTS public.tbc_flip_card_publication_progress (
  source_run_id uuid PRIMARY KEY REFERENCES public.tbc_players_full_feed_audit_runs(run_id),
  last_source_row integer NOT NULL DEFAULT 0,
  processed_source_rows bigint NOT NULL DEFAULT 0,
  newly_created_cards bigint NOT NULL DEFAULT 0,
  identity_holds bigint NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tbc_flip_card_publication_holds (
  source_run_id uuid NOT NULL,
  playerid text NOT NULL,
  source_row integer NOT NULL,
  hsid integer NOT NULL,
  reason text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_run_id,playerid)
);

-- One-time 2026 coverage preparation. No page request should scan 939K source rows.
CREATE OR REPLACE FUNCTION public.prepare_tbc_verified_2026_participation()
RETURNS TABLE(players bigint,batting_source_rows bigint,pitching_source_rows bigint)
LANGUAGE plpgsql AS $fn$
DECLARE v_bat bigint; v_pitch bigint;
BEGIN
  SELECT count(*) INTO v_bat FROM public.tbc_complete_batting_history;
  SELECT count(*) INTO v_pitch FROM public.tbc_complete_pitching_history;
  IF v_bat < 501242 OR v_pitch < 438097 THEN
    RAISE EXCEPTION 'Incomplete TBC history: batting %, pitching %',v_bat,v_pitch;
  END IF;

  INSERT INTO public.tbc_verified_2026_participation AS t
    (playerid,batting_rows,pitching_rows)
  WITH b AS (
    SELECT playerid,count(*)::integer AS n
      FROM public.tbc_complete_batting_history WHERE year='2026'
     GROUP BY playerid
  ), p AS (
    SELECT playerid,count(*)::integer AS n
      FROM public.tbc_complete_pitching_history WHERE year='2026'
     GROUP BY playerid
  )
  SELECT coalesce(b.playerid,p.playerid),coalesce(b.n,0),coalesce(p.n,0)
    FROM b FULL JOIN p USING(playerid)
  ON CONFLICT(playerid) DO UPDATE
    SET batting_rows=excluded.batting_rows,
        pitching_rows=excluded.pitching_rows,
        prepared_at=now()
  WHERE (t.batting_rows,t.pitching_rows)
        IS DISTINCT FROM (excluded.batting_rows,excluded.pitching_rows);

  RETURN QUERY SELECT count(*)::bigint,v_bat,v_pitch
    FROM public.tbc_verified_2026_participation;
END;
$fn$;

-- Build the durable, indexed school relation from the audited TBC school
-- match. Preserve reviewed existing IDs and NEVER choose an ambiguous HSID.
-- A conflicting newer audit is left unchanged and must be reviewed.
CREATE OR REPLACE FUNCTION public.prepare_tbc_verified_school_links(p_run_id uuid)
RETURNS TABLE(source_candidates bigint,valid_school_links bigint,school_conflicts bigint)
LANGUAGE plpgsql AS $fn$
DECLARE v_source bigint; v_candidates bigint; v_conflicts bigint;
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

  RETURN QUERY SELECT v_candidates,
    (SELECT count(*)::bigint FROM public.tbc_player_verified_school_links),
    v_conflicts;
END;
$fn$;

-- Merge every VERIFIED raw player first, then call this function to materialize
-- source-backed school cards. Every call resumes from the last committed cursor.
-- Existing fan/contributed cards are not overwritten. Holds are explicit.
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
  IF NOT EXISTS (SELECT 1 FROM public.tbc_player_verified_school_links
                 WHERE source_run_id=p_run_id LIMIT 1) THEN
    RAISE EXCEPTION 'Prepare verified HSID school links first';
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
           BTRIM(coalesce(c.firstname,'')||' '||coalesce(c.lastname,'')),
           c.firstname,c.lastname,c.posit,
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

-- 2026 participants misclassified by the *automatic* 2025 cutoff are
-- corrected in short batches. Never override manual/MLB retirement or free
-- agent, injury, 40-man, redshirt or other independently sourced statuses.
CREATE OR REPLACE FUNCTION public.reconcile_auto_retired_2026_batch(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE v_updated integer;
BEGIN
  IF p_limit<1 OR p_limit>2000 THEN RAISE EXCEPTION 'Limit must be 1..2000'; END IF;
  WITH candidates AS (
    SELECT f.playerid
    FROM public.flip_card_front_stage f
    JOIN public.tbc_verified_2026_participation e USING(playerid)
    WHERE f.status_label='RETIRED'
      AND f.source_summary#>>'{status_classification,source}'='yatstats_retirement_cutoff'
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
             jsonb_build_object('source','tbc_complete_history_2026',
                'rule','verified_2026_participation',
                'supersedes','yatstats_retirement_cutoff',
                'applied_at',now()::text),true)
    FROM candidates c WHERE f.playerid=c.playerid
    RETURNING 1
  ) SELECT count(*)::integer INTO v_updated FROM changed;
  RETURN v_updated;
END;
$fn$;
