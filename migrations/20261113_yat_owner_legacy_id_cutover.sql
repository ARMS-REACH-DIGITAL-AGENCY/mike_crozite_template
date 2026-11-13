-- Controlled canonicalization of the two legacy fan-created cards.
-- Exact source cards, HSIDs, and expected destinations are mandatory.
-- Only the two specified identities move. No TBC, MLB, or bracket data changes.
-- On success, old YAT links redirect via player_source_map yat_legacy.
BEGIN;
DO $$
DECLARE
  old_john CONSTANT text := 'YAT149256554099832';
  old_pete CONSTANT text := 'YAT816250826200263';
  new_john CONSTANT text := 'YAT000099';
  new_pete CONSTANT text := 'YAT000100';
  r record;
BEGIN
  -- This migration is intentionally one-shot. Refuse partial or reused keys.
  IF (SELECT count(*) FROM public.flip_card_front_stage
      WHERE (playerid=old_john AND hsid='14471' AND display_name='John Johnson')
         OR (playerid=old_pete AND hsid='5976' AND display_name='Pete DeLuca')) <> 2 THEN
    RAISE EXCEPTION 'Legacy YAT cutover aborted: source cards differ from audited identities';
  END IF;
  IF EXISTS (SELECT 1 FROM public.flip_card_front_stage WHERE playerid IN (new_john,new_pete))
     OR EXISTS (SELECT 1 FROM public.yat_registry WHERE yatid IN (new_john,new_pete))
     OR EXISTS (SELECT 1 FROM public.player_source_map
                 WHERE (source='yat_legacy' AND source_player_id IN(old_john,old_pete))
                    OR playerid IN (new_john,new_pete)) THEN
    RAISE EXCEPTION 'Legacy YAT cutover aborted: target key or alias already exists';
  END IF;

  -- Keep a full, immutable record of every impacted row for reconciliation.
  CREATE TABLE IF NOT EXISTS public.yat_identity_cutover_backup_20261113(
    table_name text NOT NULL,
    original_playerid text NOT NULL,
    row_data jsonb NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now()
  );
  FOR r IN SELECT unnest(ARRAY[
      'flip_card_front_stage', 'fan_activity', 'media_upload',
      'player_moment_players', 'newsletter_favorites', 'alumni_where_yat_now',
      'user_favorites', 'player_moment_submissions'
    ]) AS table_name LOOP
    EXECUTE format(
      'INSERT INTO public.yat_identity_cutover_backup_20261113(table_name,original_playerid,row_data)
       SELECT %L, playerid, to_jsonb(src) FROM public.%I src
       WHERE playerid IN (%L,%L)',
       r.table_name,r.table_name,old_john,old_pete);
  END LOOP;

  INSERT INTO public.yat_registry(yatid,first_name,last_name,notes)
  VALUES (new_john,'John','Johnson','Legacy fan-created card canonicalized 2026-11-13; verified by owner'),
         (new_pete,'Pete','DeLuca','Legacy fan-created card canonicalized 2026-11-13; verified by owner');
  INSERT INTO public.yat_registry_ids(yatid,source,source_id,match_method)
  VALUES (new_john,'yat_card',new_john,'legacy_id_canonicalization'),
         (new_pete,'yat_card',new_pete,'legacy_id_canonicalization'),
         (new_john,'yat_legacy',old_john,'legacy_id_canonicalization'),
         (new_pete,'yat_legacy',old_pete,'legacy_id_canonicalization');
  INSERT INTO public.player_source_map
    (playerid,source,source_player_id,match_method,is_verified,match_confidence,notes)
  VALUES
    (new_john,'yat_legacy',old_john,'owner_verified_legacy_yatid',true,1,'Historical URL redirect; preserved all associated content'),
    (new_pete,'yat_legacy',old_pete,'owner_verified_legacy_yatid',true,1,'Historical URL redirect; preserved all associated content');

  UPDATE public.fan_activity SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.media_upload SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.player_moment_players SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.newsletter_favorites SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.alumni_where_yat_now SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.user_favorites SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.player_moment_submissions SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);
  UPDATE public.flip_card_front_stage SET playerid=CASE playerid WHEN old_john THEN new_john ELSE new_pete END
    WHERE playerid IN (old_john,old_pete);

  IF (SELECT count(*) FROM public.flip_card_front_stage WHERE playerid IN(new_john,new_pete)) <> 2
     OR EXISTS (SELECT 1 FROM public.flip_card_front_stage WHERE playerid IN(old_john,old_pete))
     OR EXISTS (SELECT 1 FROM public.yat_identity_cutover_backup_20261113 WHERE table_name='flip_card_front_stage'
                 GROUP BY table_name HAVING count(*)<>2) THEN
    RAISE EXCEPTION 'Legacy YAT cutover reconciliation failed';
  END IF;
END $$;
COMMIT;