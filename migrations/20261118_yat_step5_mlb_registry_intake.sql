-- YAT ID key transition, step 5 (docs/yat-key-transition.md; Pete, Nov 18 2026).
-- Every new MLB ID a job learns for one of our players is attached to his YAT
-- ID in the registry, whichever job writes it (one outside number = one
-- person). Sources: the MLB roster match (mlb_org_roster_resolution,
-- match_status 'matched') and MLB links (player_source_map, source 'mlb_api').
-- Never: a link rejected as a bad identity match, an MLB ID that already
-- belongs to someone, or a person who already has a different MLB ID (left
-- for Pete). New TBC players already get a YAT ID on card creation
-- (trg_yat_auto_register on flip_card_front_stage).
BEGIN;

CREATE OR REPLACE FUNCTION public.yat_attach_mlb_id(p_card text, p_mlb text, p_method text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_yat text;
BEGIN
  IF p_mlb IS NULL OR btrim(p_mlb) !~ '^[0-9]+$' THEN RETURN; END IF;
  v_yat := public.yat_id_for(p_card);
  IF v_yat IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.yat_registry_ids WHERE source = 'mlb' AND source_id = btrim(p_mlb)) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.yat_registry_ids WHERE source = 'mlb' AND yatid = v_yat) THEN RETURN; END IF;
  INSERT INTO public.yat_registry_ids (yatid, source, source_id, match_method)
  VALUES (v_yat, 'mlb', btrim(p_mlb), p_method)
  ON CONFLICT (source, source_id) DO NOTHING;
END;
$f$;

CREATE OR REPLACE FUNCTION public.yat_attach_mlb_from_roster_match()
RETURNS trigger LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.match_status = 'matched' AND NEW.playerid IS NOT NULL THEN
    PERFORM public.yat_attach_mlb_id(NEW.playerid::text, NEW.source_player_id::text, 'auto: MLB roster match');
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS trg_yat_attach_mlb ON public.mlb_org_roster_resolution;
CREATE TRIGGER trg_yat_attach_mlb AFTER INSERT OR UPDATE OF match_status, playerid, source_player_id
  ON public.mlb_org_roster_resolution FOR EACH ROW EXECUTE FUNCTION public.yat_attach_mlb_from_roster_match();

CREATE OR REPLACE FUNCTION public.yat_attach_mlb_from_source_link()
RETURNS trigger LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.source = 'mlb_api' AND NEW.match_method IS DISTINCT FROM 'rejected_bad_identity_match' THEN
    PERFORM public.yat_attach_mlb_id(NEW.playerid::text, NEW.source_player_id::text, 'auto: MLB link');
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS trg_yat_attach_mlb ON public.player_source_map;
CREATE TRIGGER trg_yat_attach_mlb AFTER INSERT OR UPDATE OF source, source_player_id, playerid, match_method
  ON public.player_source_map FOR EACH ROW EXECUTE FUNCTION public.yat_attach_mlb_from_source_link();

-- Catch up on what was missed since Nov 9.
SELECT public.yat_attach_mlb_id(r.playerid::text, r.source_player_id::text, 'auto: MLB roster match (catch-up)')
  FROM (SELECT DISTINCT playerid, source_player_id FROM public.mlb_org_roster_resolution
         WHERE match_status = 'matched' AND playerid IS NOT NULL) r;
SELECT public.yat_attach_mlb_id(s.playerid::text, s.source_player_id::text, 'auto: MLB link (catch-up)')
  FROM public.player_source_map s
 WHERE s.source = 'mlb_api' AND s.match_method IS DISTINCT FROM 'rejected_bad_identity_match';

COMMIT;
