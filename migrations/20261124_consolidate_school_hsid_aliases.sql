-- Pete, Nov 24 2026: consolidate verified TBC source-school twins;
-- no generated numeric public addresses. Keep the raw source and player identities.
-- Execute these statements in ONE transaction. The repair is intentionally guarded
-- against changes to the audited source population or the 2027 bracket.
-- statement
CREATE TEMP TABLE school_merge_groups ON COMMIT DROP AS
WITH n AS (
 SELECT hsid,hsname,hslocation,regionid,cityname,
 trim(both '-' from lower(regexp_replace(regexp_replace(hsname,'[''’.]','','g'),'[^a-zA-Z0-9]+','-','g'))) slug,
 trim(both '-' from lower(regexp_replace(regexp_replace(cityname,'[''’.]','','g'),'[^a-zA-Z0-9]+','-','g'))) city
 FROM public.tbc_schools_raw
), g AS (
 SELECT regionid,slug,city,min(hsid) keep,array_agg(hsid order by hsid) ids
 FROM n GROUP BY 1,2,3 HAVING count(*)>1
)
SELECT g.*, 'https://' || slug || CASE WHEN EXISTS
 (SELECT 1 FROM n WHERE n.regionid=g.regionid AND n.slug=g.slug AND n.city<>g.city)
 THEN '-'||city ELSE '' END || '.'||lower(regionid)||'.yatstats.com' url
FROM g
-- statement
DO $$
BEGIN
 IF (SELECT count(*) FROM school_merge_groups) <> 79
 OR (SELECT sum(cardinality(ids)) FROM school_merge_groups) <> 159
 THEN RAISE EXCEPTION 'School merge source population changed; re-audit'; END IF;
 IF EXISTS (SELECT 1 FROM school_merge_groups g JOIN public.school_success s ON lower(trim(both '/' from s.microsite_url))=g.url WHERE NOT coalesce(s.hsid=any(g.ids),false))
 OR EXISTS (SELECT 1 FROM school_merge_groups GROUP BY url HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Canonical URL collision'; END IF;
 IF EXISTS (SELECT 1 FROM school_merge_groups g JOIN public.master_bracket b ON b.season_key='2027' AND (b.home_hsid=any(g.ids) OR b.away_hsid=any(g.ids)))
 THEN RAISE EXCEPTION '2027 bracket school affected'; END IF;
END $$;
-- statement
CREATE TABLE IF NOT EXISTS public.school_hsid_aliases (
 source_hsid integer PRIMARY KEY REFERENCES public.tbc_schools_raw(hsid),
 canonical_hsid integer NOT NULL REFERENCES public.tbc_schools_raw(hsid),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (source_hsid>canonical_hsid)
)
-- statement
INSERT INTO public.school_hsid_aliases(source_hsid,canonical_hsid,reason)
SELECT i,g.keep,'Verified same school: normalized name, city, state; lower HSID per Pete Nov 24 2026'
FROM school_merge_groups g CROSS JOIN LATERAL unnest(g.ids) i
WHERE i<>g.keep
ON CONFLICT (source_hsid) DO UPDATE SET canonical_hsid=excluded.canonical_hsid,reason=excluded.reason
-- statement
GRANT SELECT ON public.school_hsid_aliases TO authenticator
-- statement
CREATE OR REPLACE FUNCTION public.canonical_school_hsid(input integer) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT canonical_hsid FROM public.school_hsid_aliases WHERE source_hsid=input),input)
$$
-- statement
CREATE TEMP TABLE school_merge_directory ON COMMIT DROP AS
SELECT g.keep,g.url,s.*
FROM school_merge_groups g JOIN public.school_success s
ON s.hsid=any(g.ids) OR
(s.hsid IS NULL AND upper(s.regionid)=g.regionid
 AND trim(both '-' from lower(regexp_replace(regexp_replace(ltrim(s.hsname,'^ '),'[''’.]','','g'),'[^a-zA-Z0-9]+','-','g')))=g.slug
 AND trim(both '-' from lower(regexp_replace(regexp_replace(s.cityname,'[''’.]','','g'),'[^a-zA-Z0-9]+','-','g')))=g.city)
-- statement
CREATE TABLE IF NOT EXISTS public.school_identity_repair_directory_20261124 AS SELECT * FROM school_merge_directory
-- statement
CREATE TABLE IF NOT EXISTS public.school_identity_repair_cards_20261124 AS
SELECT f.playerid,f.yatid,f.hsid FROM public.flip_card_front_stage f JOIN public.school_hsid_aliases a ON f.hsid=a.source_hsid::text
-- statement
CREATE TABLE IF NOT EXISTS public.school_identity_repair_links_20261124 AS
SELECT l.* FROM public.yat_school_links l JOIN public.school_hsid_aliases a ON l.hsid=a.source_hsid
-- statement
CREATE TABLE IF NOT EXISTS public.school_identity_repair_news_20261124 AS
SELECT n.* FROM public.news_articles n JOIN public.school_hsid_aliases a ON n.hsid=a.source_hsid::text
-- statement
CREATE TEMP TABLE school_merge_stats ON COMMIT DROP AS
SELECT g.keep,count(DISTINCT f.playerid)::int cards,
 count(DISTINCT f.playerid) FILTER (WHERE upper(trim(coalesce(f.display_status_label,f.status_label,'')))='ACTIVE')::int active,
 count(DISTINCT f.playerid) FILTER (WHERE upper(trim(coalesce(f.level_label,''))) NOT IN ('HIGH SCHOOL','HS'))::int alltime
FROM school_merge_groups g LEFT JOIN public.flip_card_front_stage f ON f.hsid=ANY(ARRAY(SELECT unnest(g.ids)::text))
GROUP BY g.keep
-- statement
INSERT INTO public.school_url_aliases(old_url,hsid,new_url,reason)
SELECT DISTINCT ON (old_url) old_url,keep,url,'Consolidated source-school twin; no public HSID suffix'
FROM (
 SELECT trim(both '/' from microsite_url) old_url,keep,url FROM school_merge_directory WHERE coalesce(trim(microsite_url),'')<>''
 UNION ALL
 SELECT 'https://'||i::text||'.yatstats.com',g.keep,g.url FROM school_merge_groups g CROSS JOIN LATERAL unnest(g.ids) i
) a WHERE old_url<>url
ORDER BY old_url,keep
ON CONFLICT(old_url) DO UPDATE SET hsid=excluded.hsid,new_url=excluded.new_url,reason=excluded.reason
-- statement
UPDATE public.school_url_aliases u SET hsid=g.keep,new_url=g.url FROM school_merge_groups g WHERE u.hsid=any(g.ids) AND (u.hsid<>g.keep OR u.new_url<>g.url)
-- statement
CREATE OR REPLACE FUNCTION public.canonicalize_yat_school_link_hsid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.hsid:=public.canonical_school_hsid(NEW.hsid); RETURN NEW; END
$$
-- statement
DROP TRIGGER IF EXISTS trg_canonicalize_school_link_hsid ON public.yat_school_links
-- statement
CREATE TRIGGER trg_canonicalize_school_link_hsid BEFORE INSERT OR UPDATE OF hsid ON public.yat_school_links
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_yat_school_link_hsid()
-- statement
INSERT INTO public.yat_school_links(source,source_player_id,hsid,yatid,method,added_at)
SELECT DISTINCT ON (l.source,l.source_player_id,a.canonical_hsid)
 l.source,l.source_player_id,a.canonical_hsid,l.yatid,l.method,l.added_at
FROM public.school_identity_repair_links_20261124 l JOIN public.school_hsid_aliases a ON l.hsid=a.source_hsid
ORDER BY l.source,l.source_player_id,a.canonical_hsid,l.added_at
ON CONFLICT(source,source_player_id,hsid) DO NOTHING
-- statement
DELETE FROM public.yat_school_links l USING public.school_hsid_aliases a WHERE l.hsid=a.source_hsid
-- statement
CREATE OR REPLACE FUNCTION public.yat_resync_tbc_school_links(p_ids text[])
 RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_ids IS NULL OR cardinality(p_ids)=0 THEN RETURN; END IF;
 DELETE FROM public.yat_school_links WHERE source='tbc' AND method IN ('tbc_verified_link','tbc_legacy_link','school_key_match') AND source_player_id=ANY(p_ids);
 INSERT INTO public.yat_school_links(source,source_player_id,hsid,method)
 SELECT 'tbc',v.playerid::text,public.canonical_school_hsid(v.hsid),
 CASE WHEN EXISTS(SELECT 1 FROM public.tbc_player_verified_school_links l WHERE l.playerid=v.playerid::text AND public.canonical_school_hsid(l.hsid)=public.canonical_school_hsid(v.hsid)) THEN 'tbc_verified_link' ELSE 'tbc_legacy_link' END
 FROM public.v_player_hsids_verified_prepared v WHERE v.playerid::text=ANY(p_ids)
 ON CONFLICT DO NOTHING;
 INSERT INTO public.yat_school_links(source,source_player_id,hsid,method)
 SELECT 'tbc',p.playerid::text,k.hsid,'school_key_match'
 FROM public.tbc_players_raw p JOIN LATERAL (
 SELECT min(public.canonical_school_hsid(sk.hsid)) AS hsid FROM public.school_source_keys sk
 WHERE sk.source='tbc' AND sk.source_key=public.school_key_norm(p.high_school)
 HAVING count(DISTINCT public.canonical_school_hsid(sk.hsid))=1
 ) k ON true
 WHERE p.playerid::text=ANY(p_ids)
 AND EXISTS(SELECT 1 FROM public.tbc_schools_raw s WHERE s.hsid=k.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.yat_school_links x WHERE x.source='tbc' AND x.source_player_id=p.playerid::text)
 AND NOT EXISTS(SELECT 1 FROM public.player_hsid_exclusion e WHERE e.playerid::text=p.playerid::text AND (e.hsid::text=k.hsid::text OR EXISTS(SELECT 1 FROM public.school_hsid_aliases a WHERE a.source_hsid::text=e.hsid::text AND a.canonical_hsid=k.hsid)))
 ON CONFLICT DO NOTHING;
END $$;
-- statement
CREATE OR REPLACE FUNCTION public.canonicalize_flip_card_school_hsid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT coalesce((SELECT canonical_hsid::text FROM public.school_hsid_aliases WHERE source_hsid::text=NEW.hsid),NEW.hsid) INTO NEW.hsid;
 RETURN NEW;
END
$$
-- statement
DROP TRIGGER IF EXISTS trg_canonicalize_flip_card_school_hsid ON public.flip_card_front_stage
-- statement
CREATE TRIGGER trg_canonicalize_flip_card_school_hsid BEFORE INSERT OR UPDATE OF hsid ON public.flip_card_front_stage
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_flip_card_school_hsid()
-- statement
UPDATE public.flip_card_front_stage f SET hsid=a.canonical_hsid::text FROM public.school_hsid_aliases a WHERE f.hsid=a.source_hsid::text
-- statement
UPDATE public.news_articles n SET hsid=a.canonical_hsid::text FROM public.school_hsid_aliases a WHERE n.hsid=a.source_hsid::text
-- statement
DELETE FROM public.school_success s USING school_merge_directory d WHERE s.hs_lookup_key=d.hs_lookup_key
-- statement
INSERT INTO public.school_success (hs_lookup_key,high_school,hsid,yatstats_national_rank,yatstats_state_rank,"1024_microsites",staging_url,microsite_url,yatstats_master_sort,hsname,nickname,current_aa,mlb,atnla,drafted_hs,drafted,hslocation,cityname,regionname,regionid,region,bracket_seeding)
SELECT t.hs_lookup_key,t.hs_lookup_key,g.keep,
 r.yatstats_national_rank,r.yatstats_state_rank,r."1024_microsites",
 'https://'||g.keep::text||'.yatstats.com',
 CASE WHEN st.cards>0 OR EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.hsid=g.keep) OR EXISTS(SELECT 1 FROM school_merge_directory d WHERE d.keep=g.keep AND coalesce(trim(d.microsite_url),'')<>'') THEN g.url ELSE '' END,
 r.yatstats_master_sort,t.hsname,t.nickname,st.active,
 (SELECT max(d.mlb) FROM school_merge_directory d WHERE d.keep=g.keep),
 greatest(st.alltime,(SELECT max(d.atnla) FROM school_merge_directory d WHERE d.keep=g.keep)),
 (SELECT max(d.drafted_hs) FROM school_merge_directory d WHERE d.keep=g.keep),
 (SELECT max(d.drafted) FROM school_merge_directory d WHERE d.keep=g.keep),
 t.hslocation,t.cityname,t.regionname,t.regionid,r.region,r.bracket_seeding
FROM school_merge_groups g JOIN public.tbc_schools_raw t ON t.hsid=g.keep
JOIN school_merge_stats st ON st.keep=g.keep
LEFT JOIN LATERAL (
 SELECT d.* FROM school_merge_directory d WHERE d.keep=g.keep
 ORDER BY (d.yatstats_national_rank IS NOT NULL) DESC,(d.hsid=g.keep) DESC NULLS LAST,d.yatstats_national_rank NULLS LAST,d.hs_lookup_key LIMIT 1
) r ON true
-- statement
CREATE OR REPLACE FUNCTION public.guard_public_school_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.hsid IS NOT NULL AND EXISTS(SELECT 1 FROM public.school_hsid_aliases WHERE source_hsid=NEW.hsid) THEN
   IF TG_OP='INSERT' THEN RETURN NULL; ELSE RAISE EXCEPTION 'Retired source-school HSID % cannot be published',NEW.hsid; END IF;
 END IF;
 IF NEW.hsid IS NOT NULL AND coalesce(NEW.microsite_url,'') ~* ('-'||NEW.hsid::text||'\.[a-z]{2}\.yatstats\.com/?$') THEN
   RAISE EXCEPTION 'Generated public HSID suffix prohibited: %',NEW.microsite_url;
 END IF;
 IF NEW.hsid IS NULL AND NEW.hsname LIKE '^%' AND EXISTS(
   SELECT 1 FROM public.school_hsid_aliases a JOIN public.tbc_schools_raw t ON t.hsid=a.canonical_hsid
   WHERE lower(trim(t.hsname))=lower(trim(ltrim(NEW.hsname,'^ '))) AND lower(trim(t.hslocation))=lower(trim(NEW.hslocation))
 ) THEN RETURN NULL; END IF;
 RETURN NEW;
END
$$
-- statement
DROP TRIGGER IF EXISTS trg_guard_public_school_identity ON public.school_success
-- statement
CREATE TRIGGER trg_guard_public_school_identity BEFORE INSERT OR UPDATE OF hsid,microsite_url,hsname ON public.school_success
FOR EACH ROW EXECUTE FUNCTION public.guard_public_school_identity()
-- statement
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.school_success s JOIN public.school_hsid_aliases a ON s.hsid=a.source_hsid)
 OR EXISTS(SELECT 1 FROM public.school_success s WHERE s.microsite_url ~* ('-'||s.hsid::text||'\.[a-z]{2}\.yatstats\.com/?$'))
 OR EXISTS(SELECT 1 FROM public.flip_card_front_stage f JOIN public.school_hsid_aliases a ON f.hsid=a.source_hsid::text)
 OR EXISTS(SELECT 1 FROM public.yat_school_links l JOIN public.school_hsid_aliases a ON l.hsid=a.source_hsid)
 OR EXISTS(SELECT 1 FROM public.school_identity_repair_cards_20261124 b LEFT JOIN public.flip_card_front_stage f ON f.playerid=b.playerid AND f.yatid IS NOT DISTINCT FROM b.yatid WHERE f.playerid IS NULL)
 OR EXISTS(SELECT 1 FROM public.school_identity_repair_links_20261124 b JOIN public.school_hsid_aliases a ON a.source_hsid=b.hsid LEFT JOIN public.yat_school_links l ON l.source=b.source AND l.source_player_id=b.source_player_id AND l.hsid=a.canonical_hsid WHERE l.source_player_id IS NULL)
 THEN RAISE EXCEPTION 'School identity repair invariant failed'; END IF;
END $$;
