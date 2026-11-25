-- Canonical new-school URL normalization for repaired records (2026-11-25).
-- school.state.yatstats.com is preferred unless another school in that
-- state has the same normalized name; then school-city.state.yatstats.com.
-- Scope strictly to the source-backed HSIDs allocated by the 314-player
-- repair. Neither tournament fields nor locked fantasy results are touched.
WITH all_slugs AS (
 SELECT s.hsid,s.hsname,s.cityname,s.regionid,
 trim(both '-' FROM regexp_replace(lower(s.hsname),'[^a-z0-9]+','-','g')) school_slug,
 trim(both '-' FROM regexp_replace(lower(s.cityname),'[^a-z0-9]+','-','g')) city_slug
 FROM public.school_success s
), planned AS(
 SELECT a.hsid,
 CASE WHEN (SELECT count(*) FROM all_slugs b
            WHERE b.regionid=a.regionid AND b.school_slug=a.school_slug)=1
  THEN 'https://'||a.school_slug||'.'||lower(a.regionid)||'.yatstats.com'
  ELSE 'https://'||a.school_slug||'-'||a.city_slug||'.'||
     lower(a.regionid)||'.yatstats.com' END target_url
 FROM all_slugs a WHERE a.hsid BETWEEN 19603 AND 19845
), safe AS(
 SELECT p.* FROM planned p
 WHERE NOT EXISTS (
  SELECT 1 FROM public.school_success x
  WHERE x.hsid<>p.hsid AND lower(x.microsite_url)=lower(p.target_url)
 )
)
UPDATE public.school_success s
SET microsite_url=p.target_url
FROM safe p WHERE s.hsid=p.hsid AND s.microsite_url IS DISTINCT FROM p.target_url
RETURNING s.hsid,s.microsite_url;
