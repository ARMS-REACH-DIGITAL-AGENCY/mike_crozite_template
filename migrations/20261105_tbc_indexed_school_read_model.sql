-- Materialized and indexed replacement candidate for public.player_hsids.
-- First snapshot the *existing* view's non-verified exceptions, preserving
-- currently visible legacy associations without reintroducing fuzzy matching
-- for 80K new players. Do this BEFORE merging the missing TBC raw IDs.
-- DO NOT replace public.player_hsids until parity/performance tests succeed.
CREATE TABLE IF NOT EXISTS public.tbc_legacy_player_school_links (
  playerid text NOT NULL,
  hsid integer NOT NULL REFERENCES public.tbc_schools_raw(hsid),
  reason text NOT NULL DEFAULT 'legacy_view_pre_release',
  preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(playerid,hsid)
);
CREATE INDEX IF NOT EXISTS idx_tbc_legacy_school_hsid_player
  ON public.tbc_legacy_player_school_links(hsid,playerid);

CREATE OR REPLACE FUNCTION public.capture_tbc_legacy_school_links()
RETURNS TABLE(preserved_links bigint,preserved_players bigint)
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Repeatable and non-destructive. Does not change any existing association.
  INSERT INTO public.tbc_legacy_player_school_links(playerid,hsid,reason)
  SELECT DISTINCT p.playerid,p.hsid,'legacy_view_pre_release'
    FROM public.player_hsids p
   WHERE p.hsid IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM public.tbc_player_verified_school_links v
                    WHERE v.playerid=p.playerid)
  ON CONFLICT(playerid,hsid) DO NOTHING;
  -- Keep an existing card's school while mismatched source assignments receive
  -- explicit review; don't silently rewrite the card or choose source HSID.
  INSERT INTO public.tbc_legacy_player_school_links(playerid,hsid,reason)
  SELECT DISTINCT r.playerid,s.hsid,'existing_stage_preserved'
    FROM public.flip_card_front_stage f
    JOIN public.tbc_players_raw r ON r.playerid=f.playerid
    JOIN public.tbc_schools_raw s ON s.hsid::text=f.hsid
   WHERE NOT EXISTS(SELECT 1 FROM public.tbc_player_verified_school_links v
                    WHERE v.playerid=r.playerid)
  ON CONFLICT(playerid,hsid) DO NOTHING;
  RETURN QUERY SELECT count(*)::bigint,count(DISTINCT playerid)::bigint
     FROM public.tbc_legacy_player_school_links;
END;
$fn$;

CREATE OR REPLACE VIEW public.v_player_hsids_verified_prepared AS
SELECT p.playerid,p.firstname,p.lastname,s.hsid,s.hsname,s.hslocation
  FROM public.tbc_player_verified_school_links l
  JOIN public.tbc_players_raw p ON p.playerid=l.playerid
  JOIN public.tbc_schools_raw s ON s.hsid=l.hsid
 WHERE NOT EXISTS (
   SELECT 1 FROM public.player_hsid_exclusion e
    WHERE e.playerid=p.playerid AND e.hsid=s.hsid::text
 )
UNION ALL
SELECT p.playerid,p.firstname,p.lastname,s.hsid,s.hsname,s.hslocation
  FROM public.tbc_legacy_player_school_links l
  JOIN public.tbc_players_raw p ON p.playerid=l.playerid
  JOIN public.tbc_schools_raw s ON s.hsid=l.hsid
 WHERE NOT EXISTS(SELECT 1 FROM public.tbc_player_verified_school_links v
                  WHERE v.playerid=p.playerid)
   AND NOT EXISTS(
     SELECT 1 FROM public.player_hsid_exclusion e
      WHERE e.playerid=p.playerid AND e.hsid=s.hsid::text
   );

-- Manual release step AFTER parity/rollback verification:
-- CREATE OR REPLACE VIEW public.player_hsids AS
--   SELECT playerid,firstname,lastname,hsid,hsname,hslocation
--   FROM public.v_player_hsids_verified_prepared;
-- DO NOT run until the full player import, school/card preview and
-- dependent-view regression checks have passed.
