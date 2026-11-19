-- YAT key transition, step 8 groundwork (docs/yat-key-transition.md):
-- schools and school links that work for every source (Pete, Nov 18 2026).
--
-- 1. school_key_norm(): one matching rule for school text, ignoring capitals
--    and spacing ("McKinney (Mckinney,TX)" = "McKinney (McKinney,TX)").
-- 2. school_source_keys: a source's school text -> our hsid, like
--    yat_registry_ids does for people. Filled from TBC's school list, plus
--    "Home Schooled (--,--)" -> 15322 (TBC's page hs_team/15322; Pete).
-- 3. school_success repair (backup first): 196 schools were in the table
--    twice, Pete's original row (his numbers, no hsid) and a later row (hsid
--    and address, no numbers), split by capital letters (194) or by Pete's
--    ' #hsid' tag (2: Hamilton East (Steinert) 5008, Ida B. Wells-Barnett
--    2084; TBC confirms one hsid each). Pete's numbers
--    fill the EMPTY fields of the hsid row; nothing filled is overwritten;
--    the hsid-less copy is removed. 3 more of Pete's rows get their hsid.
--    Pete's ^ / ^^ marker rows (72 duplicate TBC schools) are not touched.
-- 4. yat_school_links: which school pages show a person, keyed by YAT ID,
--    with where each link came from. Filled from today's player_hsids
--    EXACTLY (TBC verified + legacy links, every past correction kept), plus
--    card-only links (e.g. a coach) and the Home Schooled players. Kept
--    current automatically when TBC's school links or the exclusions change.
-- 5. player_hsids reads from yat_school_links and returns the same rows as
--    before, so nothing that reads it changes.
--
-- Run on the claude-test copy first; compare player_hsids before and after.

SET LOCAL lock_timeout = '10s';

-- 1 -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_key_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT NULLIF(lower(regexp_replace(regexp_replace(btrim(t), '\s*([,()\-])\s*', '\1', 'g'), '\s+', ' ', 'g')), '')
$f$;

-- 2 -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_source_keys (
  source      text    NOT NULL,
  source_key  text    NOT NULL,
  source_text text    NOT NULL,
  hsid        integer NOT NULL,
  note        text,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_key, hsid)
);
COMMENT ON TABLE public.school_source_keys IS
  'A source''s school text (normalized by school_key_norm) -> our hsid. A key with two hsids is ambiguous (TBC''s 72 duplicate schools) and never places a new player by itself.';

INSERT INTO public.school_source_keys (source, source_key, source_text, hsid, note)
SELECT 'tbc', public.school_key_norm(hs_lookup_key), hs_lookup_key, hsid, 'tbc_schools_raw'
  FROM public.tbc_schools_raw
 WHERE public.school_key_norm(hs_lookup_key) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.school_source_keys (source, source_key, source_text, hsid, note)
VALUES ('tbc', public.school_key_norm('Home Schooled (--,--)'), 'Home Schooled (--,--)', 15322,
        'Pete, Nov 18 2026: TBC hs_team/15322 Home Schooled')
ON CONFLICT DO NOTHING;

-- 3 -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_success_backup_20261118 AS SELECT * FROM public.school_success;

CREATE TEMP TABLE ss_twins ON COMMIT DROP AS
-- A key that ends in Pete's ' #<its own hsid>' tag (e.g. 'Hamilton East
-- (Steinert) (Trenton,NJ) #5008') is compared without the tag.
WITH a AS (SELECT ctid AS a_ctid, hsid,
                  public.school_key_norm(regexp_replace(hs_lookup_key, '\s*#' || hsid::text || '\s*$', '')) k
             FROM public.school_success WHERE hsid IS NOT NULL),
     b AS (SELECT ctid AS b_ctid, public.school_key_norm(hs_lookup_key) k FROM public.school_success
            WHERE hsid IS NULL AND hsname NOT LIKE '^%'),
     one_a AS (SELECT k FROM a GROUP BY k HAVING count(*) = 1),
     one_b AS (SELECT k FROM b GROUP BY k HAVING count(*) = 1)
SELECT a.a_ctid, b.b_ctid, a.hsid
  FROM a JOIN b USING (k) JOIN one_a USING (k) JOIN one_b USING (k);

DO $do$
DECLARE cols text; n int;
BEGIN
  SELECT count(*) INTO n FROM ss_twins;
  IF n <> 196 THEN RAISE EXCEPTION 'expected 196 school_success twins, found %', n; END IF;
  -- Every column except the hsid and the address: fill only what is empty.
  SELECT string_agg(format('%1$I = COALESCE(a.%1$I, b.%1$I)', column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'school_success'
     AND column_name NOT IN ('hsid', 'microsite_url', 'staging_url');
  EXECUTE format(
    'UPDATE public.school_success a SET %s FROM ss_twins t, public.school_success b
      WHERE a.ctid = t.a_ctid AND b.ctid = t.b_ctid', cols);
  DELETE FROM public.school_success s USING ss_twins t WHERE s.ctid = t.b_ctid;
END
$do$;

-- Pete's rows whose school has an hsid but no school_success row yet.
WITH b AS (SELECT ctid AS b_ctid, public.school_key_norm(hs_lookup_key) k FROM public.school_success
            WHERE hsid IS NULL AND hsname NOT LIKE '^%'),
     t AS (SELECT k.source_key, min(k.hsid) hsid FROM public.school_source_keys k
            WHERE k.source = 'tbc' GROUP BY k.source_key HAVING count(*) = 1)
UPDATE public.school_success s SET hsid = t.hsid
  FROM b JOIN t ON t.source_key = b.k
 WHERE s.ctid = b.b_ctid
   AND NOT EXISTS (SELECT 1 FROM public.school_success x WHERE x.hsid = t.hsid);

-- 4 -------------------------------------------------------------------------
-- source: tbc | card | manual | (later) presto; source_player_id: that
-- source's own player number; yatid: filled from the registry (step 3 rule);
-- method: tbc_verified_link | tbc_legacy_link | school_key_match | card.
CREATE TABLE IF NOT EXISTS public.yat_school_links (
  source            text    NOT NULL,
  source_player_id  text    NOT NULL,
  hsid              integer NOT NULL,
  yatid             text,
  method            text    NOT NULL,
  added_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_player_id, hsid)
);
CREATE INDEX IF NOT EXISTS idx_yat_school_links_hsid  ON public.yat_school_links (hsid);
CREATE INDEX IF NOT EXISTS idx_yat_school_links_yatid ON public.yat_school_links (yatid);
COMMENT ON TABLE public.yat_school_links IS
  'Which school pages show a person (YAT ID), with where each link came from. player_hsids reads the TBC links from here.';

-- YAT IDs for the seed in one pass (same rule as public.yat_id_for).
CREATE TEMP TABLE seed_yat ON COMMIT DROP AS
SELECT DISTINCT ON (source_id) source_id, yatid
  FROM public.yat_registry_ids
 WHERE source IN ('tbc', 'yat_card', 'yat_legacy')
 ORDER BY source_id, (source = 'tbc') DESC;
CREATE INDEX ON seed_yat (source_id);
INSERT INTO seed_yat SELECT r.yatid, r.yatid FROM public.yat_registry r
 WHERE NOT EXISTS (SELECT 1 FROM seed_yat x WHERE x.source_id = r.yatid);

-- TBC links: exactly what player_hsids returns today.
INSERT INTO public.yat_school_links (source, source_player_id, hsid, method, yatid)
SELECT 'tbc', v.playerid::text, v.hsid,
       CASE WHEN l.playerid IS NOT NULL THEN 'tbc_verified_link' ELSE 'tbc_legacy_link' END,
       y.yatid
  FROM public.v_player_hsids_verified_prepared v
  LEFT JOIN public.tbc_player_verified_school_links l ON l.playerid = v.playerid::text AND l.hsid = v.hsid
  LEFT JOIN seed_yat y ON y.source_id = v.playerid::text
ON CONFLICT DO NOTHING;

-- Home Schooled players (TBC text -> 15322) with no other school link.
INSERT INTO public.yat_school_links (source, source_player_id, hsid, method, yatid)
SELECT 'tbc', p.playerid::text, k.hsid, 'school_key_match', (SELECT y.yatid FROM seed_yat y WHERE y.source_id = p.playerid::text)
  FROM public.tbc_players_raw p
  JOIN public.school_source_keys k ON k.source = 'tbc' AND k.source_key = public.school_key_norm(p.high_school) AND k.hsid = 15322
 WHERE NOT EXISTS (SELECT 1 FROM public.yat_school_links x WHERE x.source = 'tbc' AND x.source_player_id = p.playerid::text)
ON CONFLICT DO NOTHING;

-- Cards on a school page that no TBC link covers (coaches, non-TBC players),
-- never against an exclusion.
INSERT INTO public.yat_school_links (source, source_player_id, hsid, method, yatid)
SELECT 'card', f.playerid::text, f.hsid::integer, 'card', f.yatid
  FROM public.flip_card_front_stage f
 WHERE f.hsid IS NOT NULL AND f.hsid::text ~ '^[0-9]+$'
   AND NOT EXISTS (SELECT 1 FROM public.yat_school_links x
                    WHERE x.yatid = f.yatid AND x.hsid = f.hsid::integer)
   AND NOT EXISTS (SELECT 1 FROM public.player_hsid_exclusion e
                    WHERE (e.playerid::text = f.playerid::text OR e.yatid = f.yatid) AND e.hsid::text = f.hsid::text)
ON CONFLICT DO NOTHING;

-- New links get their YAT ID as they arrive (step 3 rule).
DROP TRIGGER IF EXISTS trg_yat_school_links_yatid ON public.yat_school_links;
CREATE TRIGGER trg_yat_school_links_yatid BEFORE INSERT OR UPDATE OF source_player_id ON public.yat_school_links
  FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('source_player_id', 'yatid');

-- Keep TBC links current: whenever TBC's school links or the exclusions
-- change, recompute those players' TBC links from the same TBC logic.
CREATE OR REPLACE FUNCTION public.yat_resync_tbc_school_links(p_ids text[])
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RETURN; END IF;
  DELETE FROM public.yat_school_links
   WHERE source = 'tbc' AND method IN ('tbc_verified_link', 'tbc_legacy_link')
     AND source_player_id = ANY (p_ids);
  INSERT INTO public.yat_school_links (source, source_player_id, hsid, method)
  SELECT 'tbc', v.playerid::text, v.hsid,
         CASE WHEN EXISTS (SELECT 1 FROM public.tbc_player_verified_school_links l
                            WHERE l.playerid = v.playerid::text AND l.hsid = v.hsid)
              THEN 'tbc_verified_link' ELSE 'tbc_legacy_link' END
    FROM public.v_player_hsids_verified_prepared v
   WHERE v.playerid::text = ANY (p_ids)
  ON CONFLICT DO NOTHING;
END
$f$;

CREATE OR REPLACE FUNCTION public.trg_yat_resync_tbc_school_links()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.yat_resync_tbc_school_links(ARRAY(SELECT DISTINCT playerid::text FROM new_rows));
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.yat_resync_tbc_school_links(ARRAY(SELECT DISTINCT playerid::text FROM old_rows));
  END IF;
  RETURN NULL;
END
$f$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tbc_player_verified_school_links', 'tbc_legacy_player_school_links', 'player_hsid_exclusion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_yat_links_ins ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_yat_links_upd ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_yat_links_del ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_yat_links_ins AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_tbc_school_links()', t);
    EXECUTE format('CREATE TRIGGER trg_yat_links_upd AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_tbc_school_links()', t);
    EXECUTE format('CREATE TRIGGER trg_yat_links_del AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_resync_tbc_school_links()', t);
  END LOOP;
END
$do$;

-- A person registered later gets his YAT ID on his links.
CREATE OR REPLACE FUNCTION public.trg_yat_school_links_fill_yatid()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.yat_school_links l SET yatid = public.yat_id_for(l.source_player_id)
   WHERE l.yatid IS NULL AND l.source_player_id IN (SELECT source_id FROM new_rows);
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_yat_school_links_fill_yatid ON public.yat_registry_ids;
CREATE TRIGGER trg_yat_school_links_fill_yatid AFTER INSERT ON public.yat_registry_ids
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_yat_school_links_fill_yatid();

-- 5 -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.player_hsids AS
SELECT p.playerid, p.firstname, p.lastname, s.hsid, s.hsname, s.hslocation
  FROM public.yat_school_links l
  JOIN public.tbc_players_raw p ON p.playerid = l.source_player_id
  JOIN public.tbc_schools_raw s ON s.hsid = l.hsid
 WHERE l.source = 'tbc' AND l.method IN ('tbc_verified_link', 'tbc_legacy_link');

GRANT SELECT ON public.yat_school_links, public.school_source_keys TO authenticator;
