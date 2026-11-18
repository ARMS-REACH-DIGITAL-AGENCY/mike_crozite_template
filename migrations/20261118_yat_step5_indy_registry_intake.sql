-- YAT ID key transition, step 5 (Pete, Nov 18 2026: "Yes" to attaching the
-- name-matched INDY IDs). Every INDY (iScore) player ID linked to one of our
-- players attaches to his YAT ID in the registry as source 'iscore'. The
-- links come from src/lib/indyIscore.ts (exact first + last name, unique among
-- our players); match_method records that. An INDY ID already attached is
-- never moved to another person. A player may have several INDY IDs
-- (different leagues or seasons): each is its own registry row.
BEGIN;

CREATE OR REPLACE FUNCTION public.yat_attach_indy_from_link()
RETURNS trigger LANGUAGE plpgsql AS $t$
DECLARE v_yat text;
BEGIN
  IF NEW.yatstats_playerid IS NULL OR NULLIF(btrim(NEW.source_player_id), '') IS NULL THEN RETURN NEW; END IF;
  v_yat := public.yat_id_for(NEW.yatstats_playerid::text);
  IF v_yat IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.yat_registry_ids (yatid, source, source_id, match_method)
  VALUES (v_yat, 'iscore', btrim(NEW.source_player_id),
          'auto: INDY link (' || coalesce(NEW.league_code, '?') || ', ' || coalesce(NEW.match_notes, 'name match') || ')')
  ON CONFLICT (source, source_id) DO NOTHING;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS trg_yat_attach_indy ON public.indy_iscore_player_source_map;
CREATE TRIGGER trg_yat_attach_indy AFTER INSERT OR UPDATE OF yatstats_playerid, source_player_id
  ON public.indy_iscore_player_source_map FOR EACH ROW EXECUTE FUNCTION public.yat_attach_indy_from_link();

-- Attach the links that already exist.
INSERT INTO public.yat_registry_ids (yatid, source, source_id, match_method)
SELECT DISTINCT ON (btrim(m.source_player_id)) public.yat_id_for(m.yatstats_playerid::text), 'iscore', btrim(m.source_player_id),
       'auto: INDY link (' || coalesce(m.league_code, '?') || ', ' || coalesce(m.match_notes, 'name match') || ')'
  FROM public.indy_iscore_player_source_map m
 WHERE m.yatstats_playerid IS NOT NULL AND NULLIF(btrim(m.source_player_id), '') IS NOT NULL
   AND public.yat_id_for(m.yatstats_playerid::text) IS NOT NULL
 ORDER BY btrim(m.source_player_id), m.last_seen_at DESC
ON CONFLICT (source, source_id) DO NOTHING;

COMMIT;
