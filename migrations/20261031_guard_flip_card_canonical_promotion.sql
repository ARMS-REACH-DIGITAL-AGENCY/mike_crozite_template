-- Prevent unverified level/team values from being newly promoted to flip cards.
-- Legacy incomplete rows are left available for targeted reconciliation;
-- no historical raw stats or current professional assignments are fabricated.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.guard_flip_card_canonical_promotion()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  canonical record;
  team_changed boolean;
  level_changed boolean;
BEGIN
  team_changed := TG_OP='INSERT';
  level_changed := TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
    team_changed := NEW.current_teamid IS DISTINCT FROM OLD.current_teamid;
    level_changed := NEW.level_label IS DISTINCT FROM OLD.level_label
                  OR NEW.display_level_label IS DISTINCT FROM OLD.display_level_label;
  END IF;

  IF level_changed AND (
    (NEW.level_label IS NOT NULL AND NEW.level_label NOT IN (
      'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
      'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3','NAIA',
      'NJCAA','CCCAA','NWAC','HIGH SCHOOL'))
    OR (NEW.display_level_label IS NOT NULL AND NEW.display_level_label NOT IN (
      'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
      'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3','NAIA',
      'NJCAA','CCCAA','NWAC','HIGH SCHOOL'))
  ) THEN
    RAISE EXCEPTION 'Unverified/PRO/NCAA placeholder level cannot be promoted to flip-card stage'
      USING ERRCODE='23514';
  END IF;

  IF team_changed AND NEW.current_teamid IS NOT NULL THEN
    SELECT teamid,current_team_name,current_org_or_conference_name,level_label
      INTO canonical FROM public.teamid_universe_mapping
      WHERE teamid=NEW.current_teamid;
    IF NOT FOUND
       OR NULLIF(BTRIM(canonical.current_team_name),'') IS NULL
       OR NULLIF(BTRIM(canonical.current_org_or_conference_name),'') IS NULL
       OR canonical.level_label NOT IN (
        'MLB','TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE',
        'INDY','INTERNATIONAL','NCAA-D1','NCAA-D2','NCAA-D3','NAIA',
        'NJCAA','CCCAA','NWAC','HIGH SCHOOL') THEN
      RAISE EXCEPTION 'Unmapped or incomplete canonical Team ID cannot be promoted into flip-card stage'
        USING ERRCODE='23514';
    END IF;
    IF NEW.current_team_name IS DISTINCT FROM canonical.current_team_name
       OR NEW.current_org_or_conference_name IS DISTINCT FROM canonical.current_org_or_conference_name
       OR NEW.level_label IS DISTINCT FROM canonical.level_label THEN
      RAISE EXCEPTION 'New flip-card team assignment must match exact canonical Team ID identity and level'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$body$;

DO $install$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.flip_card_front_stage'::regclass AND tgname='yatstats_guard_stage_canonical_promotion') THEN
  CREATE TRIGGER yatstats_guard_stage_canonical_promotion
  BEFORE INSERT OR UPDATE OF current_teamid,level_label,display_level_label
  ON public.flip_card_front_stage FOR EACH ROW
  EXECUTE FUNCTION public.guard_flip_card_canonical_promotion();
 END IF;
END;
$install$;
COMMIT;
