-- Safe, resumable TBC Players raw merge. Run only with a verified source audit
-- and a prepared immutable HSID candidate snapshot.
-- One invocation merges <= p_batch_size source rows in one short transaction.
-- This migration DOES NOT enable the 3AM/3PM cron or publish flip cards.
CREATE TABLE IF NOT EXISTS public.tbc_player_raw_promotion_progress (
  source_run_id uuid PRIMARY KEY REFERENCES public.tbc_players_full_feed_audit_runs(run_id),
  last_source_row integer NOT NULL DEFAULT 0,
  processed_valid_rows bigint NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.promote_verified_tbc_player_raw_batch(
  p_run_id uuid,
  p_batch_size integer DEFAULT 2000
) RETURNS TABLE(processed_in_batch integer, processed_total bigint, last_row integer, finished boolean)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_rows integer;
  v_unique integer;
  v_candidates bigint;
  v_cursor integer;
  v_current integer;
  v_batch_count integer;
  v_last integer;
  v_processed bigint;
  v_done boolean;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 5000 THEN
    RAISE EXCEPTION 'Batch size must be 1..5000';
  END IF;
  -- Prevent overlapping workers from moving one source cursor simultaneously.
  PERFORM pg_advisory_xact_lock(hashtext('yatstats_tbc_raw_promotion'), hashtext(p_run_id::text));

  SELECT source_rows, unique_ids INTO v_rows, v_unique
    FROM public.tbc_players_full_feed_audit_runs
   WHERE run_id=p_run_id AND status IN ('complete','partial');
  IF v_rows IS NULL OR v_rows < 208427 OR v_rows <> v_unique THEN
    RAISE EXCEPTION 'TBC source snapshot is not verified and complete';
  END IF;
  SELECT count(*) INTO v_candidates
    FROM public.tbc_player_hsid_candidates WHERE source_run_id=p_run_id;
  IF v_candidates <> v_rows THEN
    RAISE EXCEPTION 'Full HSID candidate evaluation is required: % of %',v_candidates,v_rows;
  END IF;

  INSERT INTO public.tbc_player_raw_promotion_progress(source_run_id)
  VALUES(p_run_id) ON CONFLICT(source_run_id) DO NOTHING;

  SELECT last_source_row,processed_valid_rows,completed
  INTO v_cursor,v_processed,v_done
  FROM public.tbc_player_raw_promotion_progress WHERE source_run_id=p_run_id FOR UPDATE;

  IF v_done THEN
    RETURN QUERY SELECT 0::integer,v_processed,v_cursor,true;
    RETURN;
  END IF;

  WITH batch AS MATERIALIZED (
    SELECT a.source_row,a.playerid,a.firstname,a.lastname,a.highlevel,a.ht,a.wt,
           a.bats,a.throws,a.posit,a.borndate,a.currentage,a.place,a.high_school
    FROM public.tbc_players_full_feed_audit_rows a
    JOIN public.tbc_player_hsid_candidates c
      ON c.source_run_id=a.run_id AND c.playerid=a.playerid
    WHERE a.run_id=p_run_id
      AND a.source_row>v_cursor
      AND a.rejection_reason IS NULL
      AND c.review_reason <> 'SOURCE_QUARANTINED'
    ORDER BY a.source_row
    LIMIT p_batch_size
  ),
  upserted AS (
    INSERT INTO public.tbc_players_raw AS t
       (playerid,firstname,lastname,highlevel,ht,wt,bats,throws,posit,
        borndate,currentage,place,high_school)
    SELECT playerid,firstname,lastname,highlevel,ht,wt,bats,throws,posit,
           borndate,currentage,place,high_school
    FROM batch
    ON CONFLICT(playerid) DO UPDATE SET
      firstname=coalesce(nullif(excluded.firstname,''),t.firstname),
      lastname=coalesce(nullif(excluded.lastname,''),t.lastname),
      highlevel=coalesce(nullif(excluded.highlevel,''),t.highlevel),
      ht=coalesce(nullif(excluded.ht,''),t.ht),
      wt=coalesce(nullif(excluded.wt,''),t.wt),
      bats=coalesce(nullif(excluded.bats,''),t.bats),
      throws=coalesce(nullif(excluded.throws,''),t.throws),
      posit=coalesce(nullif(excluded.posit,''),t.posit),
      borndate=coalesce(nullif(excluded.borndate,''),t.borndate),
      currentage=coalesce(nullif(excluded.currentage,''),t.currentage),
      place=coalesce(nullif(excluded.place,''),t.place),
      high_school=coalesce(nullif(excluded.high_school,''),t.high_school)
    WHERE (t.firstname,t.lastname,t.highlevel,t.ht,t.wt,t.bats,t.throws,
           t.posit,t.borndate,t.currentage,t.place,t.high_school)
      IS DISTINCT FROM
          (coalesce(nullif(excluded.firstname,''),t.firstname),
           coalesce(nullif(excluded.lastname,''),t.lastname),
           coalesce(nullif(excluded.highlevel,''),t.highlevel),
           coalesce(nullif(excluded.ht,''),t.ht),
           coalesce(nullif(excluded.wt,''),t.wt),
           coalesce(nullif(excluded.bats,''),t.bats),
           coalesce(nullif(excluded.throws,''),t.throws),
           coalesce(nullif(excluded.posit,''),t.posit),
           coalesce(nullif(excluded.borndate,''),t.borndate),
           coalesce(nullif(excluded.currentage,''),t.currentage),
           coalesce(nullif(excluded.place,''),t.place),
           coalesce(nullif(excluded.high_school,''),t.high_school))
    RETURNING 1
  )
  SELECT (SELECT count(*)::integer FROM batch),
         (SELECT max(source_row) FROM batch)
  INTO v_batch_count,v_last;

  IF v_batch_count=0 THEN
    UPDATE public.tbc_player_raw_promotion_progress
       SET completed=true,updated_at=now()
     WHERE source_run_id=p_run_id;
    RETURN QUERY SELECT 0::integer,v_processed,v_cursor,true;
    RETURN;
  END IF;

  -- Checkpoint advances only when the batch's upsert committed successfully.
  UPDATE public.tbc_player_raw_promotion_progress
     SET last_source_row=v_last,
         processed_valid_rows=processed_valid_rows+v_batch_count,
         updated_at=now()
   WHERE source_run_id=p_run_id
   RETURNING processed_valid_rows INTO v_processed;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.tbc_players_full_feed_audit_rows
    WHERE run_id=p_run_id AND source_row>v_last AND rejection_reason IS NULL
  ) INTO v_done;
  IF v_done THEN
    UPDATE public.tbc_player_raw_promotion_progress
       SET completed=true,updated_at=now()
     WHERE source_run_id=p_run_id;
  END IF;
  RETURN QUERY SELECT v_batch_count,v_processed,v_last,v_done;
END;
$fn$;
