-- Independently verified 2026-11-25 school existence, not verified individual alumni.
-- Follow-on to scripts/repair/missing-yat-flip-cards-20261125.sql.
-- Only apply on named production branch. Uses canonical existing HSIDs and 9 new IDs.
-- Replay QA must replicate production's exact school IDs; never recompute.
-- STATEMENT 1
LOCK TABLE public.school_success IN SHARE ROW EXCLUSIVE MODE;
-- STATEMENT 2
CREATE TEMP TABLE _manual_school_map ON COMMIT DROP AS
SELECT source_school,hsid::integer hsid,decision,school_url,
 trim(split_part(source_school,'(',1)) school_name,
 trim(split_part(split_part(source_school,'(',2),',',1)) school_city,
 upper(trim(split_part(split_part(source_school,',',2),')',1))) school_state
FROM (VALUES
('Conway Christian (Conway,AR)','19837','NEW','https://www.conwaychristianschool.org/'),
('Delphi Community (Delphi,IN)','4212','REUSE','https://hs.delphi.k12.in.us/'),
('Frazee-Vergas (Frazee,MN)','17352','REUSE','https://www.frazee.k12.mn.us/resources/activities-athletics/athletics'),
('Jean Augustine Secondary (Brampton,ON)','19838','NEW','https://jeanaugustine.ca/secondary-school-brampton-ontario/'),
('Lynden Christian (Lynden,WA)','19839','NEW','https://www.golyncs.com/athletics-directory/'),
('Martingrove Collegiate Institute (Etobicoke,ON)','19840','NEW','https://www.tdsb.on.ca/Find-your/Schools/schno/2804'),
('Muchin College Prep (Chicago,IL)','19841','NEW','https://nobleschools.org/muchin/'),
('New Braunfels Christian Academy (New Braunfels,TX)','19842','NEW','https://www.nbcatx.org/'),
('Riverdale Collegiate Institute (Toronto,ON)','19843','NEW','https://www.tdsb.on.ca/FindYour/Schools/schno/5555'),
('The Northwest School (Seattle,WA)','19844','NEW','https://www.northwestschool.org/'),
('Univ of Chicago Lab (Chicago,IL)','19845','NEW','https://www.ucls.uchicago.edu/academics/high-school'),
('Walkill Valley (Hamburg,NJ)','8662','REUSE','https://www.wallkillvrhs.org/'),
('Wittenberg-Birnamwood (Wittenberg,WI)','2740','REUSE','https://schools.wiaawi.org/Directory/School/GetDirectorySchool?orgID=491')
) v(source_school,hsid,decision,school_url);
-- STATEMENT 3
CREATE TEMP TABLE _manual_people ON COMMIT DROP AS
SELECT r.yatid,i.source_id tbcid,r.first_name,r.last_name,
 t.posit,t.highlevel,t.high_school,m.hsid,m.decision,m.school_url,
 latest.year last_year,latest.teamid last_teamid,
 tm.current_team_name latest_team_name,
 tm.current_org_or_conference_name latest_org,tm.level_label latest_level,
 CASE WHEN latest.year='2026' AND upper(coalesce(tm.level_label,'')) IN
 ('NCAA-D1','NCAA-D2','NCAA-D3','NJCAA','CCCAA','NWAC','NAIA')
 THEN 'ACTIVE' WHEN latest.year ~ '^20[0-9]{2}$'
 AND latest.year::integer<=2024 THEN 'RETIRED' ELSE 'UNKNOWN' END stage_status,
 CASE WHEN tm.level_label IS NOT NULL THEN tm.level_label
 WHEN upper(t.highlevel)='A+' THEN 'HIGH-A'
 WHEN upper(t.highlevel)='A' THEN 'SINGLE-A'
 WHEN upper(t.highlevel)='AA' THEN 'DOUBLE-A'
 WHEN upper(t.highlevel)='AAA' THEN 'TRIPLE-A'
 WHEN upper(t.highlevel)='MLB' THEN 'MLB' END stage_level
FROM public.yat_registry r
JOIN public.yat_registry_ids i ON i.yatid=r.yatid AND i.source='tbc'
JOIN public.tbc_players_raw t ON t.playerid=i.source_id
JOIN _manual_school_map m ON m.source_school=t.high_school
LEFT JOIN LATERAL(
 SELECT z.year,z.teamid FROM (
 SELECT year,teamid FROM public.v_tbc_pitching_all_seasons_resolved p WHERE p.playerid=i.source_id
 UNION ALL SELECT year,teamid FROM public.v_tbc_batting_all_seasons_resolved b WHERE b.playerid=i.source_id
 ) z WHERE z.year ~ '^20[0-9]{2}$'
 ORDER BY z.year::integer DESC,z.teamid LIMIT 1
) latest ON true
LEFT JOIN public.teamid_universe_mapping tm ON tm.teamid=latest.teamid
WHERE r.merged_into IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid);
-- STATEMENT 4
INSERT INTO public.school_success
 (hs_lookup_key,high_school,hsid,hsname,cityname,regionid,regionname,hslocation,microsite_url,staging_url)
SELECT m.source_school,m.source_school,m.hsid,m.school_name,m.school_city,m.school_state,m.school_state,
 m.school_city||','||m.school_state,
 'https://'||trim(both '-' FROM regexp_replace(lower(m.school_name),'[^a-z0-9]+','-','g'))||'-'||
 trim(both '-' FROM regexp_replace(lower(m.school_city),'[^a-z0-9]+','-','g'))||
 '.'||lower(m.school_state)||'.yatstats.com',
 'https://'||m.hsid||'.yatstats.com'
FROM _manual_school_map m WHERE m.decision='NEW'
 AND NOT EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=m.hsid OR lower(s.hs_lookup_key)=lower(m.source_school))
ON CONFLICT(hs_lookup_key) DO NOTHING;
-- STATEMENT 5
INSERT INTO public.school_source_keys(source,source_key,source_text,hsid,note)
SELECT 'tbc',lower(regexp_replace(source_school,'[^a-zA-Z0-9]','','g')),
 source_school,hsid,'2026-11-25 distinct school official evidence: '||school_url
FROM _manual_school_map m WHERE EXISTS (SELECT 1 FROM public.school_success s WHERE s.hsid=m.hsid)
ON CONFLICT DO NOTHING;
-- STATEMENT 6
INSERT INTO public.yat_school_links(source,source_player_id,hsid,yatid,method)
SELECT 'tbc',p.tbcid,p.hsid,p.yatid,
 CASE WHEN p.decision='REUSE' THEN 'official_school_name_alias_20261125'
 ELSE 'tbc_school_20261125_external_school_exists_player_unverified' END
FROM _manual_people p
WHERE EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=p.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.source='tbc' AND l.source_player_id=p.tbcid AND l.hsid<>p.hsid)
ON CONFLICT DO NOTHING;
-- STATEMENT 7
INSERT INTO public.player_school_profile
 (playerid,yatid,hsid,hs_display_name,hs_position,notes,is_verified)
SELECT p.tbcid,p.yatid,p.hsid::text,m.school_name,p.posit,
 'TBC school assignment: '||p.high_school||'; school independently exists: '||
 m.school_url||'; individual player attendance unverified',false
FROM _manual_people p JOIN _manual_school_map m ON m.source_school=p.high_school
WHERE EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.yatid=p.yatid AND l.hsid=p.hsid)
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 8
INSERT INTO public.flip_card_front_stage
 (playerid,yatid,hsid,first_name,last_name,display_name,position,status_label,display_status_label,
 level_label,display_level_label,highest_level_label,current_teamid,current_team_name,
 current_org_or_conference_name,current_team_level,current_team_source,current_team_source_player_id,
 current_team_source_team_id,source_notes,source_summary)
SELECT p.yatid,p.yatid,p.hsid::text,p.first_name,p.last_name,trim(p.first_name||' '||p.last_name),
 p.posit,p.stage_status,p.stage_status,p.stage_level,p.stage_level,
 CASE WHEN upper(p.highlevel)='A+' THEN 'HIGH-A'
 WHEN upper(p.highlevel)='AA' THEN 'DOUBLE-A'
 WHEN upper(p.highlevel)='AAA' THEN 'TRIPLE-A'
 WHEN upper(p.highlevel)='A' THEN 'SINGLE-A'
 WHEN upper(p.highlevel)='MLB' THEN 'MLB'
 ELSE coalesce(p.stage_level,p.highlevel) END,
 CASE WHEN p.stage_status='ACTIVE' THEN p.last_teamid END,
 CASE WHEN p.stage_status='ACTIVE' THEN p.latest_team_name END,
 CASE WHEN p.stage_status='ACTIVE' THEN p.latest_org END,
 CASE WHEN p.stage_status='ACTIVE' THEN p.latest_level END,
 CASE WHEN p.stage_status='ACTIVE' THEN 'tbc_college_2026_stats' END,p.tbcid,
 CASE WHEN p.stage_status='ACTIVE' THEN p.last_teamid END,
 '2026-11-25 verified school entity, unverified player attribution retained from TBC',
 jsonb_build_object('repair','missing-cards-20261125-reviewed','tbc_playerid',p.tbcid,
 'source_school',p.high_school,'official_school_url',p.school_url,'school_mapping',p.decision,
 'last_stat_year',p.last_year,'external_player_school_verified',false)
FROM _manual_people p
WHERE EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=p.hsid)
 AND EXISTS(SELECT 1 FROM public.player_school_profile ps WHERE ps.yatid=p.yatid AND ps.hsid=p.hsid::text)
 AND EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.yatid=p.yatid AND l.hsid=p.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=p.yatid OR f.playerid=p.yatid)
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 9
SELECT (SELECT count(*) FROM _manual_people) target_people,
 (SELECT count(*) FROM _manual_people p JOIN public.flip_card_front_stage f ON f.yatid=p.yatid AND f.hsid=p.hsid::text) cards_verified,
 (SELECT count(*) FROM public.yat_registry r WHERE r.merged_into IS NULL AND NOT EXISTS
 (SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid)) still_missing;
