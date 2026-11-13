-- YAT ID is the authoritative person key. Legacy TBC playerid remains
-- the stable external reference for scoring, import histories, and old URLs.
-- Each school card gets a cached YAT identity (multiple schools may share
-- one YAT ID). No extra fan-page identity scan or 207k record rewrite.
-- This migration is additive and safely reversible by dropping the trigger,
-- index and column after disabling YAT-ID reader code.
BEGIN;

ALTER TABLE public.flip_card_front_stage ADD COLUMN IF NOT EXISTS yatid text;

UPDATE public.flip_card_front_stage f SET yatid = ids.yatid
 FROM public.yat_registry_ids ids
 WHERE ids.source_id=f.playerid
   AND ids.source=CASE WHEN f.playerid ~ '^YAT[0-9]{6,}$' THEN 'yat_card' ELSE 'tbc' END
   AND f.yatid IS DISTINCT FROM ids.yatid;

CREATE INDEX IF NOT EXISTS idx_flip_card_front_stage_yatid ON public.flip_card_front_stage(yatid);

CREATE OR REPLACE FUNCTION public.resolve_flip_card_yatid_on_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $yat$
BEGIN
  -- No per-row identity scan: verified source key is a compound PK lookup.
  -- Fan-created YAT cards are allocated in the registry by the same
  -- publication transaction; their canonical ID is their YAT playerid.
  IF NEW.playerid ~ '^YAT[0-9]{6,}$' THEN
    NEW.yatid := NEW.playerid;
  ELSE
    SELECT ids.yatid INTO NEW.yatid
    FROM public.yat_registry_ids ids
    WHERE ids.source='tbc' AND ids.source_id=NEW.playerid;
  END IF;
  RETURN NEW;
END;
$yat$;

DROP TRIGGER IF EXISTS trg_stage_player_yatid ON public.flip_card_front_stage;

CREATE TRIGGER trg_stage_player_yatid
  BEFORE INSERT OR UPDATE OF playerid ON public.flip_card_front_stage
  FOR EACH ROW EXECUTE FUNCTION public.resolve_flip_card_yatid_on_identity_change();

CREATE OR REPLACE FUNCTION public.refresh_flip_card_yatid_on_source_link()
RETURNS trigger LANGUAGE plpgsql AS $linked$
BEGIN
  -- A new TBC player may be staged before his YAT registry association is
  -- imported. Propagate the association once it is verified and attached.
  -- One stage PK lookup; no request-time school or global identity scan.
  IF NEW.source IN ('tbc','yat_card') THEN
    UPDATE public.flip_card_front_stage f SET yatid=NEW.yatid
      WHERE f.playerid=NEW.source_id AND f.yatid IS DISTINCT FROM NEW.yatid;
  END IF;
  RETURN NEW;
END;
$linked$;

DROP TRIGGER IF EXISTS trg_yat_source_link_updates_stage ON public.yat_registry_ids;

CREATE TRIGGER trg_yat_source_link_updates_stage
  AFTER INSERT OR UPDATE OF yatid,source,source_id ON public.yat_registry_ids
  FOR EACH ROW EXECUTE FUNCTION public.refresh_flip_card_yatid_on_source_link();

DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM public.flip_card_front_stage WHERE yatid IS NULL) THEN
   RAISE EXCEPTION 'YAT identity stage backfill incomplete';
 END IF;
END
$check$;

COMMIT;
