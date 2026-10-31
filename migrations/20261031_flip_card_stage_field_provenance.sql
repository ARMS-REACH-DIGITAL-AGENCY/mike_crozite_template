-- Stage source-of-truth change history. Additive; leaves existing contribution audit intact.
-- History starts when this migration is installed; no past timestamps are inferred.
BEGIN;

CREATE TABLE IF NOT EXISTS public.flip_card_stage_change_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  playerid TEXT NOT NULL,
  hsid TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE')),
  changed_fields JSONB NOT NULL,
  attributed_source TEXT,
  writer_context TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  stage_created_at TIMESTAMPTZ,
  stage_updated_at TIMESTAMPTZ,
  current_team_last_verified TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS flip_card_stage_change_audit_player_time
  ON public.flip_card_stage_change_audit (playerid, recorded_at DESC);
CREATE INDEX IF NOT EXISTS flip_card_stage_change_audit_time
  ON public.flip_card_stage_change_audit (recorded_at DESC);

CREATE OR REPLACE FUNCTION public.record_flip_card_stage_field_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $stage_audit$
DECLARE
  before_fields JSONB := '{}'::jsonb;
  after_fields JSONB;
  changes JSONB;
BEGIN
  after_fields := jsonb_build_object(
      'hsid', NEW.hsid,
      'display_name', NEW.display_name,
      'status_label', NEW.status_label,
      'display_status_label', NEW.display_status_label,
      'current_teamid', NEW.current_teamid,
      'current_team_name', NEW.current_team_name,
      'current_org_or_conference_name', NEW.current_org_or_conference_name,
      'level_label', NEW.level_label,
      'display_level_label', NEW.display_level_label,
      'current_team_level', NEW.current_team_level,
      'current_level_label', NEW.current_level_label,
      'current_team_source', NEW.current_team_source,
      'current_team_source_player_id', NEW.current_team_source_player_id,
      'current_team_source_team_id', NEW.current_team_source_team_id,
      'current_team_roster_status', NEW.current_team_roster_status,
      'current_team_last_verified', NEW.current_team_last_verified,
      'highest_level_label', NEW.highest_level_label,
      'is_on_40man', NEW.is_on_40man,
      'forty_man_org_name', NEW.forty_man_org_name,
      'team_affiliation_status', NEW.team_affiliation_status,
      'last_transaction_type', NEW.last_transaction_type,
      'last_transaction_date', NEW.last_transaction_date,
      'last_transaction_applied_at', NEW.last_transaction_applied_at,
      'current_team_absent_since', NEW.current_team_absent_since
  );
  IF TG_OP = 'UPDATE' THEN
    before_fields := jsonb_build_object(
      'hsid', OLD.hsid,
      'display_name', OLD.display_name,
      'status_label', OLD.status_label,
      'display_status_label', OLD.display_status_label,
      'current_teamid', OLD.current_teamid,
      'current_team_name', OLD.current_team_name,
      'current_org_or_conference_name', OLD.current_org_or_conference_name,
      'level_label', OLD.level_label,
      'display_level_label', OLD.display_level_label,
      'current_team_level', OLD.current_team_level,
      'current_level_label', OLD.current_level_label,
      'current_team_source', OLD.current_team_source,
      'current_team_source_player_id', OLD.current_team_source_player_id,
      'current_team_source_team_id', OLD.current_team_source_team_id,
      'current_team_roster_status', OLD.current_team_roster_status,
      'current_team_last_verified', OLD.current_team_last_verified,
      'highest_level_label', OLD.highest_level_label,
      'is_on_40man', OLD.is_on_40man,
      'forty_man_org_name', OLD.forty_man_org_name,
      'team_affiliation_status', OLD.team_affiliation_status,
      'last_transaction_type', OLD.last_transaction_type,
      'last_transaction_date', OLD.last_transaction_date,
      'last_transaction_applied_at', OLD.last_transaction_applied_at,
      'current_team_absent_since', OLD.current_team_absent_since
    );
  END IF;

  SELECT jsonb_object_agg(k, jsonb_build_object(
      'before', before_fields -> k, 'after', after_fields -> k
    ))
    INTO changes
    FROM jsonb_object_keys(after_fields) AS keys(k)
   WHERE CASE
      WHEN TG_OP = 'INSERT' THEN after_fields -> k IS DISTINCT FROM 'null'::jsonb
      ELSE before_fields -> k IS DISTINCT FROM after_fields -> k
   END;

  IF changes IS NOT NULL THEN
    INSERT INTO public.flip_card_stage_change_audit (
      playerid, hsid, operation, changed_fields, attributed_source,
      writer_context, recorded_at, stage_created_at, stage_updated_at,
      current_team_last_verified
    ) VALUES (
      NEW.playerid::text, NEW.hsid::text, TG_OP, changes,
      COALESCE(NULLIF(NEW.current_team_source,''), 'not_yet_resolved'),
      COALESCE(NULLIF(current_setting('app.pipeline_job', true), ''),
               NULLIF(current_setting('application_name', true), ''), 'unattributed'),
      clock_timestamp(), NEW.created_at, NEW.updated_at, NEW.current_team_last_verified
    );
  END IF;
  RETURN NEW;
END;
$stage_audit$;

DO $stage_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.flip_card_front_stage'::regclass
       AND tgname = 'yatstats_stage_field_provenance'
  ) THEN
    CREATE TRIGGER yatstats_stage_field_provenance
    AFTER INSERT OR UPDATE OF
      hsid,
      display_name,
      status_label,
      display_status_label,
      current_teamid,
      current_team_name,
      current_org_or_conference_name,
      level_label,
      display_level_label,
      current_team_level,
      current_level_label,
      current_team_source,
      current_team_source_player_id,
      current_team_source_team_id,
      current_team_roster_status,
      current_team_last_verified,
      highest_level_label,
      is_on_40man,
      forty_man_org_name,
      team_affiliation_status,
      last_transaction_type,
      last_transaction_date,
      last_transaction_applied_at,
      current_team_absent_since
    ON public.flip_card_front_stage
    FOR EACH ROW
    EXECUTE FUNCTION public.record_flip_card_stage_field_changes();
  END IF;
END;
$stage_trigger$;
COMMIT;
