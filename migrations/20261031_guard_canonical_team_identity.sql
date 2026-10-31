-- 2026-10-31: Prevent canonical team identity degradation.
-- Existing incomplete rows remain visible but no new placeholder may be added.
-- Reviewed changes must explicitly declare a provenance reason in the transaction:
-- BEGIN;
-- SET LOCAL app.yatstats_canonical_reason = 'Reviewed: authoritative source URL and editor';
-- UPDATE public.teamid_universe_mapping SET ... WHERE teamid = ...;
-- COMMIT;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.teamid_universe_change_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teamid text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  db_role text NOT NULL,
  application_name text,
  reason text NOT NULL,
  before_row jsonb,
  after_row jsonb NOT NULL,
  changed_fields jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS teamid_universe_change_audit_team_time
 ON public.teamid_universe_change_audit(teamid,changed_at DESC);

-- Immutable original baseline for comparison with later audited changes.
CREATE TABLE IF NOT EXISTS public.teamid_universe_baseline_20261031 (
  teamid text PRIMARY KEY,
  baseline_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  baseline_row jsonb NOT NULL
);
INSERT INTO public.teamid_universe_baseline_20261031(teamid,baseline_row)
SELECT teamid,to_jsonb(m) FROM public.teamid_universe_mapping m
WHERE teamid IS NOT NULL
ON CONFLICT (teamid) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_canonical_team_identity()
RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
  reason text := NULLIF(BTRIM(current_setting('app.yatstats_canonical_reason',true)),'');
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Canonical Team IDs cannot be deleted; preserve historical identity'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.teamid IS DISTINCT FROM OLD.teamid THEN
    RAISE EXCEPTION 'Canonical teamid cannot be changed; use an explicit provider crosswalk'
      USING ERRCODE='23514';
  END IF;
  IF reason IS NULL OR length(reason)<20 THEN
    RAISE EXCEPTION 'Canonical team changes require documented reviewed provenance: SET LOCAL app.yatstats_canonical_reason'
      USING ERRCODE='23514';
  END IF;
  IF NULLIF(BTRIM(NEW.teamid),'') IS NULL
    OR NULLIF(BTRIM(NEW.current_team_name),'') IS NULL
    OR NULLIF(BTRIM(NEW.current_org_or_conference_name),'') IS NULL
    OR NULLIF(BTRIM(NEW.source_system),'') IS NULL
    OR NEW.level_label IS NULL
    OR NEW.level_label NOT IN (
      'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
      'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3',
      'NAIA','NJCAA','CCCAA','NWAC','HIGH SCHOOL'
    )
  THEN
    RAISE EXCEPTION 'Canonical team requires nonempty Team ID, name, organization/conference, official level and source'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.audit_canonical_team_identity()
RETURNS trigger LANGUAGE plpgsql AS $audit$
DECLARE
  old_data jsonb := '{}'::jsonb;
  new_data jsonb := to_jsonb(NEW);
  changes jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN old_data := to_jsonb(OLD); END IF;
  SELECT jsonb_object_agg(k,jsonb_build_object('before',old_data->k,'after',new_data->k))
    INTO changes
    FROM jsonb_object_keys(old_data || new_data) AS keys(k)
   WHERE old_data->k IS DISTINCT FROM new_data->k;
  IF changes IS NOT NULL THEN
    INSERT INTO public.teamid_universe_change_audit(
      teamid,operation,db_role,application_name,reason,before_row,after_row,changed_fields
    ) VALUES(
      NEW.teamid,TG_OP,current_user::text,current_setting('application_name',true),
      current_setting('app.yatstats_canonical_reason',true),
      CASE WHEN TG_OP='UPDATE' THEN old_data ELSE NULL END,
      new_data,changes
    );
  END IF;
  RETURN NEW;
END;
$audit$;

DO $install$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.teamid_universe_mapping'::regclass
   AND tgname='canonical_team_identity_guard') THEN
   CREATE TRIGGER canonical_team_identity_guard
   BEFORE INSERT OR UPDATE OR DELETE ON public.teamid_universe_mapping
   FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_team_identity();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.teamid_universe_mapping'::regclass
   AND tgname='canonical_team_identity_audit') THEN
   CREATE TRIGGER canonical_team_identity_audit
   AFTER INSERT OR UPDATE ON public.teamid_universe_mapping
   FOR EACH ROW EXECUTE FUNCTION public.audit_canonical_team_identity();
 END IF;
END;
$install$;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.teamid_universe_mapping FROM authenticated,authenticator,PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON public.teamid_universe_change_audit FROM authenticated,authenticator,PUBLIC;
REVOKE UPDATE,DELETE ON public.teamid_universe_baseline_20261031 FROM authenticated,authenticator,PUBLIC;
COMMIT;
