-- Held replacement for the newsletter authority. Only new private objects are
-- created. Existing public rows, ACLs, policies, triggers and schedules remain
-- untouched. The operator-only import below is never called by a migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS tribune_private;

CREATE TABLE IF NOT EXISTS tribune_private.alumni_newsletter_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  approved_layout_version text,
  approved_at timestamptz,
  approved_by text,
  cutover_complete_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (approved_layout_version IS NOT NULL AND cutover_complete_at IS NOT NULL))
);
INSERT INTO tribune_private.alumni_newsletter_control(singleton,enabled)
VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS tribune_private.alumni_newsletter_preferences (
  firebase_uid text PRIMARY KEY CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily','weekly')),
  format text NOT NULL DEFAULT 'html' CHECK (format IN ('html','text')),
  subscribed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tribune_private.alumni_daily_email_delivery (
  report_date date NOT NULL,
  recipient_email text NOT NULL,
  status text DEFAULT 'sending',
  school_name text,
  home_player_count integer,
  favorite_count integer,
  game_stat_count integer,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  template_version text,
  PRIMARY KEY(report_date,recipient_email)
);
CREATE TABLE IF NOT EXISTS tribune_private.alumni_newsletter_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  verified_pilot jsonb NOT NULL,
  imported_preferences integer NOT NULL,
  imported_attempts integer NOT NULL,
  completed_by text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION tribune_private.enforce_alumni_newsletter_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog
AS $$
BEGIN
  -- Only the table owner, inside the explicit legacy importer, can retain an
  -- old 'sending' attempt while the replacement remains held. The app cannot
  -- become the owner, and setting this transaction flag alone grants nothing.
  IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID))
     AND current_setting('tribune.private_legacy_import',true)='on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status='sending' AND NOT EXISTS (
    SELECT 1 FROM tribune_private.alumni_newsletter_control
    WHERE singleton=true AND enabled=true AND cutover_complete_at IS NOT NULL
      AND approved_layout_version=NEW.template_version
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='alumni_newsletter_approval_gate'
    AND tgrelid='tribune_private.alumni_daily_email_delivery'::regclass) THEN
    CREATE TRIGGER alumni_newsletter_approval_gate
      BEFORE INSERT OR UPDATE OF status,template_version
      ON tribune_private.alumni_daily_email_delivery
      FOR EACH ROW EXECUTE FUNCTION tribune_private.enforce_alumni_newsletter_approval();
  END IF;
END;
$$;

-- Invoke once, as the private-table owner, only after old preference/sender
-- requests are drained and the old sender is held. The JSON must be an explicit
-- verified list of at most seven {"firebase_uid":...,"email":...} pairs. Store
-- that list privately; it never belongs in a migration or a public source file.
CREATE OR REPLACE FUNCTION tribune_private.import_legacy_pilot(
  verified_pilot jsonb,
  legacy_paths_drained boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog
AS $$
DECLARE
  normalized jsonb;
  prior tribune_private.alumni_newsletter_cutover%ROWTYPE;
  held boolean;
  copied_preferences integer;
  copied_attempts integer;
BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class
      WHERE oid='tribune_private.alumni_daily_email_delivery'::regclass)) THEN
    RAISE EXCEPTION 'Only the private-table owner may perform a legacy cutover';
  END IF;
  IF jsonb_typeof(verified_pilot) IS DISTINCT FROM 'array'
     OR jsonb_array_length(verified_pilot) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Supply one to seven explicitly verified pilot identities';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(verified_pilot) item
    WHERE jsonb_typeof(item)<>'object'
      OR jsonb_typeof(item->'firebase_uid') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'email') IS DISTINCT FROM 'string'
      OR item-'firebase_uid'-'email'<>'{}'::jsonb
      OR length(item->>'firebase_uid') NOT BETWEEN 1 AND 128
      OR item->>'firebase_uid'<>btrim(item->>'firebase_uid')
      OR length(item->>'email') NOT BETWEEN 3 AND 320
      OR item->>'email'<>lower(btrim(item->>'email'))
      OR item->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE EXCEPTION 'Pilot identities must contain exact verified UIDs and normalized emails';
  END IF;
  IF (SELECT count(DISTINCT item->>'firebase_uid') FROM jsonb_array_elements(verified_pilot) item)<>jsonb_array_length(verified_pilot)
    OR (SELECT count(DISTINCT item->>'email') FROM jsonb_array_elements(verified_pilot) item)<>jsonb_array_length(verified_pilot) THEN
    RAISE EXCEPTION 'Duplicate pilot identities are not allowed';
  END IF;
  SELECT jsonb_agg(item ORDER BY item->>'firebase_uid') INTO normalized
    FROM jsonb_array_elements(verified_pilot) item;

  -- The control row serializes imports. A rerun never overwrites a later
  -- unsubscribe or changes approval, even if the operator repeats the command.
  PERFORM 1 FROM tribune_private.alumni_newsletter_control WHERE singleton=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Private approval control is missing'; END IF;
  SELECT * INTO prior FROM tribune_private.alumni_newsletter_cutover WHERE singleton=true;
  IF FOUND THEN
    IF prior.verified_pilot<>normalized THEN RAISE EXCEPTION 'Cutover is complete for a different verified pilot list'; END IF;
    RETURN jsonb_build_object('status','already_complete','preferences',prior.imported_preferences,'attempts',prior.imported_attempts);
  END IF;
  IF legacy_paths_drained IS DISTINCT FROM true THEN RAISE EXCEPTION 'Drain the legacy preference and sender paths before importing'; END IF;
  IF EXISTS (SELECT 1 FROM tribune_private.alumni_newsletter_control WHERE singleton=true AND enabled=true) THEN
    RAISE EXCEPTION 'The replacement sender must remain disabled during cutover';
  END IF;
  -- Read locks stabilize the source snapshot without altering shared data.
  -- Draining the old endpoints first also prevents a queued unsubscribe from
  -- landing in legacy storage immediately after these locks are released.
  LOCK TABLE public.alumni_newsletter_control,public.alumni_newsletter_preferences,
    public.alumni_daily_email_delivery,public.user_profiles IN SHARE MODE;
  SELECT NOT enabled INTO held FROM public.alumni_newsletter_control WHERE singleton=true;
  IF held IS DISTINCT FROM true THEN RAISE EXCEPTION 'The legacy sender must be held before cutover'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(normalized) AS pilot(firebase_uid text,email text)
    WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles profile
      WHERE profile.firebase_uid=pilot.firebase_uid AND lower(btrim(profile.email))=pilot.email)
  ) THEN RAISE EXCEPTION 'A verified pilot identity does not match its canonical profile'; END IF;

  INSERT INTO tribune_private.alumni_newsletter_preferences(firebase_uid,cadence,format,subscribed,updated_at)
    SELECT preference.firebase_uid,preference.cadence,preference.format,preference.subscribed,preference.updated_at
    FROM public.alumni_newsletter_preferences preference
    JOIN jsonb_to_recordset(normalized) AS pilot(firebase_uid text,email text) USING(firebase_uid)
    ON CONFLICT(firebase_uid) DO NOTHING;
  GET DIAGNOSTICS copied_preferences=ROW_COUNT;
  -- Missing source preferences stay missing; an account is never consent.
  -- All prior attempt statuses remain dedupe claims, including failed/sending.
  PERFORM set_config('tribune.private_legacy_import','on',true);
  INSERT INTO tribune_private.alumni_daily_email_delivery
    (report_date,recipient_email,status,school_name,home_player_count,favorite_count,game_stat_count,error_detail,created_at,updated_at,template_version)
    SELECT delivery.report_date,lower(delivery.recipient_email),delivery.status,delivery.school_name,
      delivery.home_player_count,delivery.favorite_count,delivery.game_stat_count,delivery.error_detail,
      delivery.created_at,delivery.updated_at,delivery.template_version
    FROM public.alumni_daily_email_delivery delivery
    JOIN jsonb_to_recordset(normalized) AS pilot(firebase_uid text,email text) ON lower(delivery.recipient_email)=pilot.email
    ON CONFLICT(report_date,recipient_email) DO NOTHING;
  GET DIAGNOSTICS copied_attempts=ROW_COUNT;
  PERFORM set_config('tribune.private_legacy_import','off',true);
  INSERT INTO tribune_private.alumni_newsletter_cutover
    (singleton,verified_pilot,imported_preferences,imported_attempts,completed_by)
    VALUES(true,normalized,copied_preferences,copied_attempts,current_user);
  UPDATE tribune_private.alumni_newsletter_control
    SET cutover_complete_at=now(),updated_at=now() WHERE singleton=true;
  RETURN jsonb_build_object('status','imported','preferences',copied_preferences,'attempts',copied_attempts,'enabled',false);
END;
$$;
REVOKE ALL ON FUNCTION tribune_private.import_legacy_pilot(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION tribune_private.enforce_alumni_newsletter_approval() FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname IN ('anonymous','authenticated','authenticator','yatstats_tribune_app') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION tribune_private.import_legacy_pilot(jsonb,boolean) FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION tribune_private.enforce_alumni_newsletter_approval() FROM %I',role_name);
  END LOOP;
END;
$$;
COMMIT;
