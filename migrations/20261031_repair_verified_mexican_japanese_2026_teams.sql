-- Resolve 2026 Mexican and Japanese league team references by exact TBC teamid.
-- TBC identifies Mexican League as Intl and Nippon leagues as Intl.
-- Preserve nonblank name aliases; changing a team's name requires separate verified review.
BEGIN;
SET LOCAL app.yatstats_canonical_reason = 'Exact TBC 2026 team IDs verified against Mexican League and NPB Central/Pacific source pages 2026-10-31; INTERNATIONAL level applies';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE intl_repair_count(n integer) ON COMMIT DROP;
WITH verified(teamid,league,source_url) AS (
VALUES
('10124','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10124/'),
('10296','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10296/'),
('10463','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10463/'),
('10464','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10464/'),
('10474','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10474/'),
('10479','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10479/'),
('10551','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10551/'),
('10588','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10588/'),
('10615','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10615/'),
('10632','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10632/'),
('10655','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10655/'),
('10658','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10658/'),
('10899','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10899/'),
('10905','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10905/'),
('10912','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10912/'),
('10916','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~10916/'),
('12084','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~12084/'),
('12246','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~12246/'),
('12420','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~12420/'),
('12421','Mexican League','https://www.thebaseballcube.com/content/stats_minor/2026~12421/'),
('10141','Japanese Central League','https://www.thebaseballcube.com/content/stats_minor/2026~10141/'),
('10446','Japanese Central League','https://www.thebaseballcube.com/content/stats_minor/2026~10446/'),
('10483','Japanese Central League','https://www.thebaseballcube.com/content/stats_minor/2026~10483/'),
('10203','Japanese Pacific League','https://www.thebaseballcube.com/content/stats_minor/2026~10203/'),
('10333','Japanese Pacific League','https://www.thebaseballcube.com/content/stats_minor/2026~10333/'),
('10385','Japanese Pacific League','https://www.thebaseballcube.com/content/stats_minor/2026~10385/'),
('10452','Japanese Pacific League','https://www.thebaseballcube.com/content/stats_minor/2026~10452/'),
('11067','Japanese Pacific League','https://www.thebaseballcube.com/content/stats_minor/2026~11067/')
), changed AS (
 UPDATE public.teamid_universe_mapping m
 SET current_org_or_conference_name=v.league,level_label='INTERNATIONAL',
 source_system='manual_verified_tbc_2026_international',
 notes=concat_ws(E'\n',NULLIF(m.notes,''),'2026-10-31: Official Intl level and 2026 league from '||v.source_url)
 FROM verified v WHERE m.teamid=v.teamid AND m.level_label='PRO'
 AND NULLIF(BTRIM(m.current_org_or_conference_name),'') IS NULL
 AND m.source_system='tbc_pro_teams_map_raw'
 RETURNING m.teamid
)
INSERT INTO intl_repair_count SELECT COUNT(*)::int FROM changed;
DO $check$
BEGIN
 IF (SELECT n FROM intl_repair_count)<>28 THEN
  RAISE EXCEPTION 'Expected 28 exactly verified international teams';
 END IF;
END;
$check$;
COMMIT;
