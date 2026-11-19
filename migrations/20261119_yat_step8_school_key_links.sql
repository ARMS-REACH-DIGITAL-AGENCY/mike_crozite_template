-- YAT key transition, step 8: players placed by their TBC school name.
-- TEST COPY FIRST (claude-test), then live only with Pete's approval.
--
-- tbc_players_raw.high_school is TBC's current name for the player's school.
-- When it equals an hs_lookup_key in tbc_schools_raw the player is linked by
-- TBC's own list (tbc_verified_link / tbc_legacy_link). When TBC renamed the
-- school after we loaded tbc_schools_raw (Taft -> Taft Charter), the name only
-- matches through school_source_keys. Those links (method school_key_match)
-- were made but player_hsids did not read them, so the nightly TBC job
-- (tbc-safe-ingest, ensureFlipCardBaselineRows) never gave those players a
-- flip card. This migration:
--   1. adds the schools Pete checked on thebaseballcube.com (Nov 19 2026),
--   2. keeps school_key_match links current whenever school_source_keys,
--      tbc_players_raw or TBC's own links change (no hand-run step),
--   3. makes player_hsids read school_key_match links too.
-- A name that maps to two hsids never places a player. A player TBC already
-- links to a school is never also placed by name. Exclusions always win.

-- 0 -------------------------------------------------------------------------
-- Schools TBC listed after we loaded tbc_schools_raw (TBC lists a school only
-- once it has an alumnus). Name, city, state and nickname exactly as on TBC's
-- hs_team pages Pete sent (Nov 19 2026); nothing else is filled in.
INSERT INTO public.tbc_schools_raw (hsid, hsname, hslocation, hs_lookup_key, cityname, regionname, regionid, nickname)
SELECT v.hsid, v.hsname, v.city || ',' || v.st, v.hsname || ' (' || v.city || ',' || v.st || ')', v.city, v.region, v.st, v.nickname
  FROM (VALUES
    (12984, 'Christiansburg', 'Christiansburg', 'Virginia', 'VA', 'Demons'),
    (8428,  'Westborough', 'Westborough', 'Massachusetts', 'MA', 'Rangers'),
    (13960, 'Armstrong Central', 'Kittanning', 'Pennsylvania', 'PA', NULL),
    (19362, 'ECA Baseball Academy', 'Goldsboro', 'North Carolina', 'NC', NULL),
    (19476, 'Laingsburg', 'Laingsburg', 'Michigan', 'MI', NULL),
    (19602, 'Port Washington', 'Port Washington', 'New York', 'NY', NULL)
  ) AS v(hsid, hsname, city, region, st, nickname)
 WHERE NOT EXISTS (SELECT 1 FROM public.tbc_schools_raw s WHERE s.hsid = v.hsid);

INSERT INTO public.school_success (hsid, hs_lookup_key, high_school, hsname, nickname, hslocation, cityname, regionname, regionid)
SELECT s.hsid, s.hs_lookup_key, s.hs_lookup_key, s.hsname, s.nickname, s.hslocation, s.cityname, s.regionname, s.regionid
  FROM public.tbc_schools_raw s
 WHERE s.hsid IN (12984, 8428, 13960, 19362, 19476, 19602)
   AND NOT EXISTS (SELECT 1 FROM public.school_success x WHERE x.hsid = s.hsid);

-- 1 -------------------------------------------------------------------------
-- Pete, Nov 19 2026: verified on thebaseballcube.com.
INSERT INTO public.school_source_keys (source, source_key, source_text, hsid, note)
SELECT 'tbc', public.school_key_norm(v.txt), v.txt, v.hsid, 'Pete, Nov 19 2026: verified on thebaseballcube.com'
  FROM (VALUES
    ('Taft Charter (Woodland Hills,CA)', 121),
    ('McKinney North (McKinney,TX)', 10386),
    ('Floyd Central (Floyds Knobs,IN)', 4637),
    ('Hamburg Area (Hamburg,PA)', 13815),
    ('Langley Secondary (Langley,BC)', 9966),
    ('Hanover Area (Hanover,PA)', 5031),
    ('Richfield (Richfield,MN)', 2116),
    ('Waunakee Community (Waunakee,WI)', 15501),
    ('Birmingham Charter (Lake Balboa,CA)', 11912),
    ('Nandua (Onley,VA)', 13802),
    ('Breck School (Golden Valley,MN)', 12950),
    ('Leeds (Leeds,AL)', 5722),
    ('St. George''s School (Middletown,RI)', 12889),
    ('Wildwood (Wildwood,NJ)', 11248),
    ('Harmony (Big Sandy,TX)', 5044),
    ('Christiansburg (Christiansburg,VA)', 12984),
    ('Westborough (Westborough,MA)', 8428),
    ('Armstrong Central (Kittanning,PA)', 13960),
    ('ECA Baseball Academy (Goldsboro,NC)', 19362),
    ('Laingsburg (Laingsburg,MI)', 19476),
    ('Port Washington (Port Washington,NY)', 19602)
  ) AS v(txt, hsid)
 WHERE EXISTS (SELECT 1 FROM public.tbc_schools_raw s WHERE s.hsid = v.hsid)
ON CONFLICT DO NOTHING;

-- 2 -------------------------------------------------------------------------
-- One function rebuilds a player's TBC links: TBC's own links first, then a
-- school_key_match link only if TBC gave him none.
CREATE OR REPLACE FUNCTION public.yat_resync_tbc_school_links(p_ids text[])
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RETURN; END IF;
  DELETE FROM public.yat_school_links
   WHERE source = 'tbc' AND method IN ('tbc_verified_link', 'tbc_legacy_link', 'school_key_match')
     AND source_player_id = ANY (p_ids);
  INSERT INTO public.yat_school_links (source, source_player_id, hsid, method)
  SELECT 'tbc', v.playerid::text, v.hsid,
         CASE WHEN EXISTS (SELECT 1 FROM public.tbc_player_verified_school_links l
                            WHERE l.playerid = v.playerid::text AND l.hsid = v.hsid)
              THEN 'tbc_verified_link' ELSE 'tbc_legacy_link' END
    FROM public.v_player_hsids_verified_prepared v
   WHERE v.playerid::text = ANY (p_ids)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.yat_school_links (source, source_player_id, hsid, method)
  SELECT 'tbc', p.playerid::text, k.hsid, 'school_key_match'
    FROM public.tbc_players_raw p
    JOIN LATERAL (
      SELECT min(sk.hsid) AS hsid
        FROM public.school_source_keys sk
       WHERE sk.source = 'tbc' AND sk.source_key = public.school_key_norm(p.high_school)
      HAVING count(DISTINCT sk.hsid) = 1
    ) k ON true
   WHERE p.playerid::text = ANY (p_ids)
     AND EXISTS (SELECT 1 FROM public.tbc_schools_raw s WHERE s.hsid = k.hsid)
     AND NOT EXISTS (SELECT 1 FROM public.yat_school_links x
                      WHERE x.source = 'tbc' AND x.source_player_id = p.playerid::text)
     AND NOT EXISTS (SELECT 1 FROM public.player_hsid_exclusion e
                      WHERE e.playerid::text = p.playerid::text AND e.hsid::text = k.hsid::text)
  ON CONFLICT DO NOTHING;
END
$f$;

-- tbc_players_raw: a new player, or a changed school name.
CREATE OR REPLACE FUNCTION public.trg_yat_resync_tbc_players_raw()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.yat_resync_tbc_school_links(ARRAY(SELECT DISTINCT playerid::text FROM new_rows));
  ELSE
    PERFORM public.yat_resync_tbc_school_links(ARRAY(
      SELECT n.playerid::text FROM new_rows n JOIN old_rows o ON o.playerid = n.playerid
       WHERE o.high_school IS DISTINCT FROM n.high_school));
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_yat_links_ins ON public.tbc_players_raw;
DROP TRIGGER IF EXISTS trg_yat_links_upd ON public.tbc_players_raw;
CREATE TRIGGER trg_yat_links_ins AFTER INSERT ON public.tbc_players_raw
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_tbc_players_raw();
CREATE TRIGGER trg_yat_links_upd AFTER UPDATE ON public.tbc_players_raw
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_tbc_players_raw();

-- school_source_keys: a school name added, changed or removed.
CREATE OR REPLACE FUNCTION public.trg_yat_resync_school_source_keys()
RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE keys text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    keys := ARRAY(SELECT source_key FROM new_rows WHERE source = 'tbc');
  ELSIF TG_OP = 'DELETE' THEN
    keys := ARRAY(SELECT source_key FROM old_rows WHERE source = 'tbc');
  ELSE
    keys := ARRAY(SELECT source_key FROM new_rows WHERE source = 'tbc'
                  UNION SELECT source_key FROM old_rows WHERE source = 'tbc');
  END IF;
  IF cardinality(keys) > 0 THEN
    PERFORM public.yat_resync_tbc_school_links(ARRAY(
      SELECT p.playerid::text FROM public.tbc_players_raw p
       WHERE public.school_key_norm(p.high_school) = ANY (keys)));
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_yat_links_ins ON public.school_source_keys;
DROP TRIGGER IF EXISTS trg_yat_links_upd ON public.school_source_keys;
DROP TRIGGER IF EXISTS trg_yat_links_del ON public.school_source_keys;
CREATE TRIGGER trg_yat_links_ins AFTER INSERT ON public.school_source_keys
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_school_source_keys();
CREATE TRIGGER trg_yat_links_upd AFTER UPDATE ON public.school_source_keys
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_school_source_keys();
CREATE TRIGGER trg_yat_links_del AFTER DELETE ON public.school_source_keys
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_school_source_keys();

-- Place the players for the keys added in part 1 (the trigger did not exist
-- yet when they were inserted).
SELECT public.yat_resync_tbc_school_links(ARRAY(
  SELECT p.playerid::text FROM public.tbc_players_raw p
    JOIN public.school_source_keys sk ON sk.source = 'tbc' AND sk.source_key = public.school_key_norm(p.high_school)
   WHERE sk.note LIKE 'Pete, Nov 19 2026%'));

-- 3 -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.player_hsids AS
SELECT p.playerid, p.firstname, p.lastname, s.hsid, s.hsname, s.hslocation
  FROM public.yat_school_links l
  JOIN public.tbc_players_raw p ON p.playerid = l.source_player_id
  JOIN public.tbc_schools_raw s ON s.hsid = l.hsid
 WHERE l.source = 'tbc' AND l.method IN ('tbc_verified_link', 'tbc_legacy_link', 'school_key_match');
