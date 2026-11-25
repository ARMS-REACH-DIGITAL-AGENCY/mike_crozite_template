-- YAT?STATS missing flip-card recovery, 2026-11-25
-- Run each numbered statement in ONE transaction on production Neon.
-- Never touch master_bracket, tournament seedings, or locked results.
-- School source is TBC; new source schools/profiles remain explicitly UNVERIFIED.
-- REVIEW (ambiguous same-city schools) and SOURCE_QUARANTINED are excluded.
-- This is data repair only; shared app code remains unchanged.
-- STATEMENT 1
LOCK TABLE public.school_success IN SHARE ROW EXCLUSIVE MODE;
-- STATEMENT 2
CREATE TEMP TABLE _yat_school_repair_map ON COMMIT DROP AS
WITH source_schools AS (
 SELECT DISTINCT t.high_school source_school,
   trim(split_part(t.high_school,'(',1)) school_name,
   trim(split_part(split_part(t.high_school,'(',2),',',1)) school_city,
   upper(trim(split_part(split_part(t.high_school,',',2),')',1))) school_state
 FROM public.yat_registry r
 JOIN public.yat_registry_ids i ON i.yatid=r.yatid AND i.source='tbc'
 JOIN public.tbc_players_raw t ON t.playerid=i.source_id
 WHERE r.merged_into IS NULL
   AND t.high_school ~ '^.+ \(.+,[A-Za-z]{2}\)$'
   AND NOT EXISTS (SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid)
   AND NOT EXISTS (SELECT 1 FROM public.tbc_player_hsid_candidates c
                   WHERE c.playerid=i.source_id AND c.review_reason='SOURCE_QUARANTINED')
), scored AS (
 SELECT x.*, best.hsid match_hsid, best.match_sim,
   CASE WHEN best.match_sim >= 0.60 AND best.first_sim >= 0.45 THEN 'REUSE'
        WHEN best.match_sim >= 0.40 THEN 'REVIEW'
        ELSE 'NEW' END decision
 FROM source_schools x
 LEFT JOIN LATERAL (
   SELECT s.hsid,similarity(lower(x.school_name),lower(s.hsname)) match_sim,
     similarity(
       split_part(lower(regexp_replace(x.school_name,'^The ', '', 'i')),' ',1),
       split_part(lower(regexp_replace(s.hsname,'^The ', '', 'i')),' ',1)
     ) first_sim
   FROM public.school_success s
   WHERE lower(s.cityname)=lower(x.school_city) AND upper(s.regionid)=x.school_state
   ORDER BY similarity(lower(x.school_name),lower(s.hsname)) DESC,s.hsid
   LIMIT 1
 ) best ON true
), numbered AS (
 SELECT scored.*,
   CASE WHEN decision='NEW' THEN row_number() OVER(PARTITION BY decision ORDER BY source_school) END new_ordinal
 FROM scored
)
SELECT numbered.*,
 CASE WHEN decision='REUSE' THEN match_hsid
      WHEN decision='NEW' THEN (SELECT coalesce(max(hsid),0) FROM public.school_success)+new_ordinal::integer
 END canonical_hsid
FROM numbered;
-- STATEMENT 3
CREATE TEMP TABLE _yat_card_repair_people ON COMMIT DROP AS
SELECT r.yatid, i.source_id tbcid, r.first_name, r.last_name,
 t.posit, t.highlevel, t.high_school, m.canonical_hsid hsid, m.decision,
 latest.year last_year, latest.teamid last_teamid,
 tm.current_team_name latest_team_name,
 tm.current_org_or_conference_name latest_org,
 tm.level_label latest_level,
 CASE WHEN latest.year='2026'
        AND upper(coalesce(tm.level_label,'')) IN ('NCAA-D1','NCAA-D2','NCAA-D3','NJCAA','CCCAA','NWAC','NAIA')
      THEN 'ACTIVE'
      WHEN latest.year ~ '^20[0-9]{2}$' AND latest.year::int<=2024 THEN 'RETIRED'
      ELSE 'UNKNOWN' END stage_status,
 CASE WHEN tm.level_label IS NOT NULL THEN tm.level_label
      WHEN upper(t.highlevel)='A+' THEN 'HIGH-A'
      WHEN upper(t.highlevel)='A' THEN 'SINGLE-A'
      WHEN upper(t.highlevel)='AA' THEN 'DOUBLE-A'
      WHEN upper(t.highlevel)='AAA' THEN 'TRIPLE-A'
      WHEN upper(t.highlevel)='MLB' THEN 'MLB'
      ELSE NULL END stage_level
FROM public.yat_registry r
JOIN public.yat_registry_ids i ON i.yatid=r.yatid AND i.source='tbc'
JOIN public.tbc_players_raw t ON t.playerid=i.source_id
JOIN _yat_school_repair_map m ON m.source_school=t.high_school AND m.canonical_hsid IS NOT NULL
LEFT JOIN LATERAL(
 SELECT z.year,z.teamid FROM(
  SELECT p.year,p.teamid FROM public.v_tbc_pitching_all_seasons_resolved p WHERE p.playerid=i.source_id
  UNION ALL
  SELECT b.year,b.teamid FROM public.v_tbc_batting_all_seasons_resolved b WHERE b.playerid=i.source_id
 ) z WHERE z.year ~ '^20[0-9]{2}$'
 ORDER BY z.year::int DESC,z.teamid LIMIT 1
) latest ON true
LEFT JOIN public.teamid_universe_mapping tm ON tm.teamid=latest.teamid
WHERE r.merged_into IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid);
-- STATEMENT 4
INSERT INTO public.school_success
 (hs_lookup_key,high_school,hsid,hsname,cityname,regionid,regionname,hslocation,microsite_url,staging_url)
SELECT m.source_school,m.source_school,m.canonical_hsid,m.school_name,m.school_city,m.school_state,
 m.school_state,m.school_city||','||m.school_state,
 'https://'||
 regexp_replace(trim(both '-' FROM regexp_replace(lower(m.school_name),'[^a-z0-9]+','-','g')),'-+$','')||'-'||
 trim(both '-' FROM regexp_replace(lower(m.school_city),'[^a-z0-9]+','-','g'))||
 '.'||lower(m.school_state)||'.yatstats.com',
 'https://'||m.canonical_hsid||'.yatstats.com'
FROM _yat_school_repair_map m
WHERE m.decision='NEW'
 AND NOT EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=m.canonical_hsid OR lower(s.hs_lookup_key)=lower(m.source_school))
ON CONFLICT(hs_lookup_key) DO NOTHING;
-- STATEMENT 5
INSERT INTO public.school_source_keys(source,source_key,source_text,hsid,note)
SELECT 'tbc',lower(regexp_replace(m.source_school,'[^a-zA-Z0-9]','','g')),
m.source_school,m.canonical_hsid,
CASE WHEN m.decision='NEW' THEN 'TBC-sourced missing-school repair; external identity pending'
 ELSE 'Matched existing school by city/state and strongly similar school name' END
FROM _yat_school_repair_map m
WHERE m.canonical_hsid IS NOT NULL
ON CONFLICT DO NOTHING;
-- STATEMENT 6
INSERT INTO public.yat_school_links(source,source_player_id,hsid,yatid,method)
SELECT 'tbc',p.tbcid,p.hsid,p.yatid,
CASE WHEN p.decision='NEW' THEN 'tbc_source_school_pending_external_verification'
ELSE 'tbc_school_city_name_alias' END
FROM _yat_card_repair_people p
WHERE EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=p.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.source='tbc' AND l.source_player_id=p.tbcid AND l.hsid<>p.hsid)
ON CONFLICT DO NOTHING;
-- STATEMENT 7
INSERT INTO public.player_school_profile
 (playerid,yatid,hsid,hs_display_name,hs_position,notes,is_verified)
SELECT p.tbcid,p.yatid,p.hsid::text,m.school_name,p.posit,
 'TBC player '||p.tbcid||' lists '||p.high_school||
 '; mapped using '||p.decision||'; external affiliation verification still pending',
 false
FROM _yat_card_repair_people p JOIN _yat_school_repair_map m ON m.source_school=p.high_school
WHERE EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.yatid=p.yatid AND l.hsid=p.hsid)
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 8
INSERT INTO public.player_hsids(playerid,firstname,lastname,hsid,hsname,hslocation)
SELECT p.tbcid,p.first_name,p.last_name,p.hsid,s.hsname,s.hslocation
FROM _yat_card_repair_people p JOIN public.school_success s ON s.hsid=p.hsid
WHERE EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.yatid=p.yatid AND l.hsid=p.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.player_hsids x WHERE x.playerid=p.tbcid)
 AND NOT EXISTS(SELECT 1 FROM public.player_hsids x WHERE x.playerid=p.yatid);
-- STATEMENT 9
INSERT INTO public.flip_card_front_stage
 (playerid,yatid,hsid,first_name,last_name,display_name,position,
 status_label,display_status_label,level_label,display_level_label,
 highest_level_label,current_teamid,current_team_name,current_org_or_conference_name,
 current_team_level,current_team_source,current_team_source_player_id,current_team_source_team_id,
 source_notes,source_summary)
SELECT p.yatid,p.yatid,p.hsid::text,p.first_name,p.last_name,
 trim(p.first_name||' '||p.last_name),p.posit,
 p.stage_status,p.stage_status,p.stage_level,p.stage_level,
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
 CASE WHEN p.stage_status='ACTIVE' THEN 'tbc_college_2026_stats' END,
 p.tbcid,
 CASE WHEN p.stage_status='ACTIVE' THEN p.last_teamid END,
 'Recovered TBC-backed canonical YAT identity; high school attribution provenance remains TBC',
 jsonb_build_object('repair','missing-cards-20261125','tbc_playerid',p.tbcid,
   'source_school',p.high_school,'school_mapping',p.decision,
   'last_stat_year',p.last_year,'last_stat_teamid',p.last_teamid,
   'external_school_verified',false)
FROM _yat_card_repair_people p
WHERE EXISTS(SELECT 1 FROM public.school_success s WHERE s.hsid=p.hsid)
 AND EXISTS(SELECT 1 FROM public.player_school_profile ps WHERE ps.yatid=p.yatid AND ps.hsid=p.hsid::text)
 AND EXISTS(SELECT 1 FROM public.yat_school_links l WHERE l.yatid=p.yatid AND l.hsid=p.hsid)
 AND NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=p.yatid OR f.playerid=p.yatid)
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 10
SELECT (SELECT count(*) FROM _yat_school_repair_map WHERE decision='NEW') new_schools,
 (SELECT count(*) FROM _yat_school_repair_map WHERE decision='REUSE') reused_schools,
 (SELECT count(*) FROM _yat_school_repair_map WHERE decision='REVIEW') held_schools,
 (SELECT count(*) FROM _yat_card_repair_people) eligible_players,
 (SELECT count(*) FROM _yat_card_repair_people p JOIN public.flip_card_front_stage f ON f.yatid=p.yatid) cards_present,
 (SELECT count(*) FROM public.yat_registry r WHERE r.merged_into IS NULL AND NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid)) still_missing;
