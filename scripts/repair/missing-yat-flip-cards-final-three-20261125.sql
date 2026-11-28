-- Final three individually researched player school associations, 2026-11-25.
-- Preserves original raw data and quarantined source. No fantasy tables touched.
-- School sources: YAT075338 Historic Charleston High; obituary and original TBC player 167078 confirm Stephen Brown attended | YAT125106 Corrupted local TBC row remains quarantined; live original TBC profile 248578 confirms Clackamas; Indy 2025 alone does not establish ACTIVE | YAT201655 Original TBC high_school Downey Christian is contradicted by player-specific 2025 Calvary Chapel coverage and MaxPreps roster; corrected canonical association
-- STATEMENT 1
LOCK TABLE public.school_success IN SHARE ROW EXCLUSIVE MODE;
-- STATEMENT 2
CREATE TEMP TABLE _final_repair ON COMMIT DROP AS
SELECT yatid,tbcid,hsid::integer hsid,school_key,hsname,cityname,regionid,
 microsite_url,position,status_label,level_label,highest_level_label,teamid,team_name,org_name,
 evidence_url,notes
FROM (VALUES
('YAT075338','167078','19846','Charleston (Charleston,WV)','Charleston','Charleston','WV','https://charleston.wv.yatstats.com','P','RETIRED','ROOKIE','ROOKIE',NULL,NULL,NULL,'https://snodgrassfuneral.com/stephen-steve-brown/','Historic Charleston High; obituary and original TBC player 167078 confirm Stephen Brown attended'),
('YAT125106','248578','3920','Clackamas (Clackamas,OR)','Clackamas','Clackamas','OR','https://clackamas.or.yatstats.com','P','UNKNOWN','INDY','INDY',NULL,NULL,NULL,'https://thebaseballcube.com/content/player/248578/','Corrupted local TBC row remains quarantined; live original TBC profile 248578 confirms Clackamas; Indy 2025 alone does not establish ACTIVE'),
('YAT201655','367703','19847','Calvary Chapel (Downey,CA)','Calvary Chapel','Downey','CA','https://calvary-chapel-downey.ca.yatstats.com','OF','ACTIVE','CCCAA','CCCAA','20339','Los Angeles Harbor College','South Coast Conference','https://www.thedowneypatriot.com/articles/sarah-masterson-joshua-lennear-are-calvary-chapels-athletes-of-the-year','Original TBC high_school Downey Christian is contradicted by player-specific 2025 Calvary Chapel coverage and MaxPreps roster; corrected canonical association')
) v(yatid,tbcid,hsid,school_key,hsname,cityname,regionid,microsite_url,position,status_label,level_label,highest_level_label,teamid,team_name,org_name,evidence_url,notes);
-- STATEMENT 3
INSERT INTO public.school_success(hs_lookup_key,high_school,hsid,hsname,cityname,regionid,
 regionname,hslocation,microsite_url,staging_url)
SELECT s.school_key,s.school_key,s.hsid,s.hsname,s.cityname,s.regionid,
 CASE WHEN s.regionid='WV' THEN 'West Virginia' ELSE 'California' END,
 s.cityname||','||s.regionid,s.microsite_url,'https://'||s.hsid||'.yatstats.com'
FROM _final_repair s WHERE s.hsid IN (19846,19847)
 AND NOT EXISTS (SELECT 1 FROM public.school_success x WHERE x.hsid=s.hsid OR lower(x.hs_lookup_key)=lower(s.school_key))
ON CONFLICT(hs_lookup_key) DO NOTHING;
-- STATEMENT 4
INSERT INTO public.school_source_keys(source,source_key,source_text,hsid,note)
SELECT 'verified_player_school',s.tbcid,s.school_key,s.hsid,
 '2026-11-25 individual identity/school external evidence: '||s.evidence_url
FROM _final_repair s ON CONFLICT DO NOTHING;
-- STATEMENT 5
INSERT INTO public.yat_school_links(source,source_player_id,hsid,yatid,method)
SELECT 'tbc',s.tbcid,s.hsid,s.yatid,'external_player_school_verified_20261125'
FROM _final_repair s
JOIN public.yat_registry_ids i ON i.source='tbc' AND i.source_id=s.tbcid AND i.yatid=s.yatid
JOIN public.school_success sc ON sc.hsid=s.hsid AND sc.hs_lookup_key=s.school_key
WHERE NOT EXISTS(SELECT 1 FROM public.yat_school_links old
 WHERE old.source='tbc' AND old.source_player_id=s.tbcid AND old.hsid<>s.hsid)
ON CONFLICT DO NOTHING;
-- STATEMENT 6
INSERT INTO public.player_school_profile(playerid,yatid,hsid,hs_display_name,hs_position,
 notes,is_verified,verified_by)
SELECT s.tbcid,s.yatid,s.hsid::text,s.hsname,s.position,s.notes||' | '||s.evidence_url,
 true,'reviewed_20261125_original_player_and_school_evidence'
FROM _final_repair s JOIN public.yat_school_links l ON l.yatid=s.yatid AND l.hsid=s.hsid
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 7
INSERT INTO public.flip_card_front_stage(playerid,yatid,hsid,first_name,last_name,display_name,
 position,status_label,display_status_label,level_label,display_level_label,highest_level_label,
 current_teamid,current_team_name,current_org_or_conference_name,current_team_level,
 current_team_source,current_team_source_player_id,current_team_source_team_id,
 source_notes,source_summary)
SELECT s.yatid,s.yatid,s.hsid::text,r.first_name,r.last_name,
 trim(r.first_name||' '||r.last_name),s.position,s.status_label,s.status_label,
 s.level_label,s.level_label,s.highest_level_label,s.teamid,s.team_name,
 s.org_name,CASE WHEN s.status_label='ACTIVE' THEN s.level_label END,
 CASE WHEN s.status_label='ACTIVE' THEN 'tbc_college_2026_stats' END,
 s.tbcid,CASE WHEN s.status_label='ACTIVE' THEN s.teamid END,
 s.notes,
 jsonb_build_object('repair','missing-cards-20261125-final-verified',
 'tbc_playerid',s.tbcid,'verified_player_source',s.evidence_url,
 'raw_source_quarantined',s.yatid='YAT125106',
 'source_school_corrected',s.yatid='YAT201655')
FROM _final_repair s
JOIN public.yat_registry r ON r.yatid=s.yatid AND r.merged_into IS NULL
JOIN public.yat_registry_ids i ON i.source='tbc' AND i.source_id=s.tbcid AND i.yatid=s.yatid
JOIN public.school_success sc ON sc.hsid=s.hsid AND sc.hs_lookup_key=s.school_key
JOIN public.player_school_profile pp ON pp.playerid=s.tbcid AND pp.yatid=s.yatid AND pp.hsid=s.hsid::text
JOIN public.yat_school_links l ON l.source='tbc' AND l.source_player_id=s.tbcid AND l.hsid=s.hsid AND l.yatid=s.yatid
WHERE NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=s.yatid OR f.playerid=s.yatid)
ON CONFLICT(playerid) DO NOTHING;
-- STATEMENT 8
SELECT count(*) target_rows,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=s.yatid AND f.hsid=s.hsid::text)) cards_verified,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.player_school_profile p WHERE p.yatid=s.yatid AND p.hsid=s.hsid::text)) profiles_verified,
 (SELECT count(*) FROM public.yat_registry r WHERE r.merged_into IS NULL AND NOT EXISTS
 (SELECT 1 FROM public.flip_card_front_stage f WHERE f.yatid=r.yatid OR f.playerid=r.yatid)) remaining_missing
FROM _final_repair s;
