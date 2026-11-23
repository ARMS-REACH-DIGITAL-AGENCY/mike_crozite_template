// Owner-defined rule: A player with 2026 college participation remains ACTIVE
// with that college until reliable newer college/pro evidence says otherwise.
// Stage repair uses all four 2026 batting/pitching sources and does not infer
// a college when multiple teams, MLB evidence or explicit overrides exist.
// This continuity persists into 2027 until a reliable newer source supersedes it.
export const SAFE_2026_COLLEGE_ARCHIVE_CONTINUITY_SQL = `WITH missing AS MATERIALIZED (
 SELECT f.playerid,f.status_label AS prior_status,f.level_label AS prior_level
 FROM public.flip_card_front_stage f
 WHERE (f.status_label IS NULL OR f.status_label IN ('ACTIVE','RETIRED'))
   AND f.current_teamid IS NULL AND f.current_team_name IS NULL
   AND f.current_team_source IS NULL AND f.current_team_source_team_id IS NULL
   AND f.current_team_source_player_id IS NULL AND f.current_team_last_verified IS NULL
   AND f.last_transaction_type IS NULL AND f.last_transaction_applied_at IS NULL
   AND f.current_team_absent_since IS NULL AND f.is_on_40man IS NOT TRUE
   AND (f.level_label IS NULL OR f.level_label IN
     ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'))
   AND (
     COALESCE(UPPER(BTRIM(f.team_affiliation_status)),'')
       NOT IN ('FREE AGENT','RETIRED','RETIRED_LAST_KNOWN')
     OR (
       f.status_label='RETIRED'
       AND f.team_affiliation_status='RETIRED'
       AND f.source_summary#>>'{status_classification,rule}'='no_activity_after_2025'
       AND f.source_summary#>>'{status_classification,source}'='yatstats_retirement_cutoff'
     )
   )
   -- A RETIRED classification may only be reversed when its stored
   -- provenance proves it came from the automatic cutoff, never manually.
   AND NOT EXISTS (SELECT 1 FROM public.player_current_team ct
     WHERE ct.playerid=f.playerid)
   AND NOT EXISTS (SELECT 1 FROM public.player_team_override o
     WHERE o.playerid=f.playerid)
   AND NOT EXISTS (SELECT 1 FROM public.player_source_map p
     WHERE p.playerid=f.playerid AND p.source='mlb_api' AND p.is_verified=true)
   AND NOT EXISTS (SELECT 1 FROM public.mlb_org_roster_resolution r
     WHERE r.playerid=f.playerid AND r.match_status='matched')
   AND NOT EXISTS (SELECT 1 FROM public.player_transactions tx
     WHERE tx.playerid=f.playerid AND tx.source='mlb_api')
   AND NOT EXISTS (SELECT 1 FROM public.school_player_profile_submission_raw s
     WHERE s.approved_playerid=f.playerid AND s.is_reviewed=true AND s.is_verified=true)
), feed AS MATERIALIZED (
 SELECT x.playerid,x.teamid FROM public.tbc_batting_2026_season_raw x
 JOIN missing m ON m.playerid=x.playerid WHERE x.year='2026'
 UNION
 SELECT x.playerid,x.teamid FROM public.tbc_pitching_2026_season_raw x
 JOIN missing m ON m.playerid=x.playerid WHERE x.year='2026'
), archive AS MATERIALIZED (
 SELECT x.playerid,x.teamid FROM public.tbc_complete_batting_history x
 JOIN missing m ON m.playerid=x.playerid WHERE x.year='2026'
 UNION
 SELECT x.playerid,x.teamid FROM public.tbc_complete_pitching_history x
 JOIN missing m ON m.playerid=x.playerid WHERE x.year='2026'
), one_college AS MATERIALIZED (
 SELECT playerid,MIN(teamid) teamid
 FROM (SELECT playerid,teamid FROM feed UNION SELECT playerid,teamid FROM archive) s
 GROUP BY playerid
 HAVING COUNT(DISTINCT teamid)=1
), verified AS MATERIALIZED (
 SELECT m.playerid,m.prior_status,u.teamid,u.current_team_name,
   u.current_org_or_conference_name,u.level_label
 FROM missing m
 JOIN one_college p ON p.playerid=m.playerid
 JOIN public.teamid_universe_mapping u ON u.teamid=p.teamid
 WHERE u.level_label IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
   AND NULLIF(BTRIM(u.current_team_name),'') IS NOT NULL
   AND NULLIF(BTRIM(u.current_org_or_conference_name),'') IS NOT NULL
   -- An explicit newer college roster transfer supersedes the 2026 team.
   AND NOT EXISTS (SELECT 1 FROM public.college_roster_players_raw r
      WHERE r.matched_playerid=m.playerid AND r.roster_season='2027'
        AND r.is_current=true AND r.teamid IS DISTINCT FROM p.teamid)
), updated AS (
 UPDATE public.flip_card_front_stage f
 SET status_label='ACTIVE',display_status_label='ACTIVE',
   team_affiliation_status='CURRENT',
   current_teamid=v.teamid,current_team_source_team_id=v.teamid,
   current_team_name=v.current_team_name,
   current_org_or_conference_name=v.current_org_or_conference_name,
   current_team_level=v.level_label,current_level_label=v.level_label,
   level_label=v.level_label,display_level_label=v.level_label,
   current_team_source='tbc_2026_college_participation',
   source_summary=COALESCE(f.source_summary,'{}'::jsonb)||
     jsonb_build_object('college_2026_continuity',
       jsonb_build_object('source','tbc_2026_stats',
         'teamid',v.teamid,'owner_rule','continue_on_2026_college',
         'prior_status',v.prior_status,'applied_at',NOW())),
   updated_at=NOW(),stage_updated_at=NOW()
 FROM verified v
 WHERE f.playerid=v.playerid
  AND (f.status_label IS NULL OR f.status_label='ACTIVE' OR
      (f.status_label='RETIRED'
       AND f.team_affiliation_status='RETIRED'
       AND f.source_summary#>>'{status_classification,rule}'='no_activity_after_2025'
       AND f.source_summary#>>'{status_classification,source}'='yatstats_retirement_cutoff'))
  AND NOT EXISTS (SELECT 1 FROM public.college_roster_players_raw r
      WHERE r.matched_playerid=f.playerid AND r.roster_season='2027'
        AND r.is_current=true AND r.teamid IS DISTINCT FROM v.teamid)
  AND f.current_teamid IS NULL AND f.current_team_name IS NULL
  AND f.current_team_source IS NULL AND f.last_transaction_type IS NULL
  AND f.last_transaction_applied_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.player_transactions tx
     WHERE tx.playerid=f.playerid AND tx.source='mlb_api')
 RETURNING v.prior_status
)
SELECT COUNT(*)::int AS restored,
 COUNT(*) FILTER(WHERE prior_status IS NULL)::int AS activated_from_blank,
 COUNT(*) FILTER(WHERE prior_status='ACTIVE')::int AS missing_colleges_restored,
 COUNT(*) FILTER(WHERE prior_status='RETIRED')::int AS false_retirements_reversed
FROM updated`;
