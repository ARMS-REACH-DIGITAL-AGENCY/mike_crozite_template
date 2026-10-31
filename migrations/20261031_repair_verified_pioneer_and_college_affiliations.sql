-- Six 2026 Pioneer League TBC identities + ten verified archived college affiliations.
-- Narrow and guarded: no arbitrary fuzzy matches, no overwrite of completed rows.
-- Source: exact The Baseball Cube 2026 Team ID and official league/level pages.
-- College source: archived college_baseball_programs_with_conferences_legacy_archived_2026.
BEGIN;
SET LOCAL app.yatstats_canonical_reason = 'Verified teamid and 2026 league via Baseball Cube; exact college ID and school from preserved conference archive on 2026-10-31';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE canonical_repair_tally (kind text PRIMARY KEY, affected integer) ON COMMIT DROP;

WITH verified(teamid, old_name, full_name, source_url) AS (
 VALUES
 ('12380','Billings','Billings Mustangs','https://www.thebaseballcube.com/content/stats_indy/2026~12380'),
 ('12382','Boise','Boise Hawks','https://www.thebaseballcube.com/content/stats_indy/2026~12382'),
 ('12397','Missoula','Missoula PaddleHeads','https://www.thebaseballcube.com/content/stats_indy/2026~12397'),
 ('12398','Idaho Falls','Idaho Falls Chukars','https://www.thebaseballcube.com/content/stats_indy/2026~12398'),
 ('12409','Glacier Ridge','Glacier Range Riders','https://www.thebaseballcube.com/content/stats_indy/2026~12409'),
 ('12418','Oakland','Oakland Ballers','https://www.thebaseballcube.com/content/stats_indy/2026~12418')
), updated AS (
 UPDATE public.teamid_universe_mapping m
 SET current_team_name=v.full_name,
     current_org_or_conference_name='Pioneer League',
     level_label='INDY',
     source_system='manual_verified_tbc_2026_pioneer',
     notes=concat_ws(E'\n',NULLIF(m.notes,''),'2026-10-31: Independently verified 2026 Pioneer League (INDY) identity by exact TBC Team ID. '||v.source_url)
 FROM verified v
 WHERE m.teamid=v.teamid AND m.current_team_name=v.old_name
   AND m.level_label='PRO' AND m.current_org_or_conference_name IS NULL
   AND m.source_system='tbc_pro_teams_map_raw'
 RETURNING m.teamid
)
INSERT INTO canonical_repair_tally SELECT 'pioneer',COUNT(*)::integer FROM updated;

WITH verified_ids(teamid) AS (
 VALUES ('20027'),('20136'),('20423'),('20600'),('20855'),
        ('20980'),('21185'),('21668'),('21788'),('22084')
), source AS (
 SELECT l.teamid,l.conference,l.school
 FROM public.college_baseball_programs_with_conferences_legacy_archived_2026 l
 JOIN verified_ids i USING(teamid)
 WHERE NULLIF(BTRIM(l.conference),'') IS NOT NULL
), updated AS (
 UPDATE public.teamid_universe_mapping m
 SET current_org_or_conference_name=s.conference,
     notes=concat_ws(E'\n',NULLIF(m.notes,''),'2026-10-31: Exact Team ID and school-name affiliation restored from college_baseball_programs_with_conferences_legacy_archived_2026; archival affiliation may be historical.')
 FROM source s
 WHERE m.teamid=s.teamid
   AND LOWER(BTRIM(m.current_team_name))=LOWER(BTRIM(s.school))
   AND NULLIF(BTRIM(m.current_org_or_conference_name),'') IS NULL
   AND m.level_label IN('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
 RETURNING m.teamid
)
INSERT INTO canonical_repair_tally SELECT 'college',COUNT(*)::integer FROM updated;

DO $guard$
DECLARE
 np integer;
 nc integer;
BEGIN
 SELECT affected INTO np FROM canonical_repair_tally WHERE kind='pioneer';
 SELECT affected INTO nc FROM canonical_repair_tally WHERE kind='college';
 IF np<>6 OR nc<>10 THEN
   RAISE EXCEPTION 'Expected 6 Pioneer and 10 college changes, got % and %; rolling back',np,nc;
 END IF;
END;
$guard$;
COMMIT;
