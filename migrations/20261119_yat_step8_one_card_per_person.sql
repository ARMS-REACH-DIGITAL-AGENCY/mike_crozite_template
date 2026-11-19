-- YAT key transition, step 8 (docs/yat-key-transition.md): one person, one
-- flip card (Pete, Nov 18 2026). Any job (TBC, MLB, contributions, later
-- Presto) that tries to create a card for a YAT ID that already has a card
-- is held for review instead of creating a second card. An insert or upsert
-- of a card number that already exists is untouched (its ON CONFLICT still
-- decides), so every job behaves exactly as with ON CONFLICT DO NOTHING.
-- Existing rows are not changed.

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.card_identity_holds (
  id                 bigserial PRIMARY KEY,
  yatid              text        NOT NULL,
  playerid           text        NOT NULL,
  existing_playerid  text        NOT NULL,
  hsid               text,
  attempted          jsonb       NOT NULL,
  held_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (yatid, playerid)
);
COMMENT ON TABLE public.card_identity_holds IS
  'Card inserts held because the person (YAT ID) already has a card. Review: attach the number to the person, or fix the identity.';

CREATE OR REPLACE FUNCTION public.guard_one_card_per_person()
RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE existing text;
BEGIN
  IF NEW.yatid IS NULL THEN RETURN NEW; END IF;
  -- An existing card number: let the statement's ON CONFLICT decide.
  IF EXISTS (SELECT 1 FROM public.flip_card_front_stage WHERE playerid = NEW.playerid) THEN
    RETURN NEW;
  END IF;
  SELECT playerid INTO existing FROM public.flip_card_front_stage
   WHERE yatid = NEW.yatid AND playerid <> NEW.playerid LIMIT 1;
  IF existing IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.card_identity_holds (yatid, playerid, existing_playerid, hsid, attempted)
  VALUES (NEW.yatid, NEW.playerid::text, existing, NEW.hsid::text, to_jsonb(NEW))
  ON CONFLICT (yatid, playerid) DO UPDATE SET attempted = EXCLUDED.attempted, held_at = now();
  RETURN NULL;
END
$f$;

-- BEFORE triggers fire in name order: this runs after trg_stage_player_yatid
-- has resolved NEW.yatid from the registry.
DROP TRIGGER IF EXISTS trg_zz_one_card_per_person ON public.flip_card_front_stage;
CREATE TRIGGER trg_zz_one_card_per_person BEFORE INSERT ON public.flip_card_front_stage
  FOR EACH ROW EXECUTE FUNCTION public.guard_one_card_per_person();

GRANT SELECT, INSERT, UPDATE ON public.card_identity_holds TO authenticator;
GRANT USAGE ON SEQUENCE public.card_identity_holds_id_seq TO authenticator;
