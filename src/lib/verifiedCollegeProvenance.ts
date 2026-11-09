// Recover only exact, unique 2026 collegiate Team ID matches. No player-team reassignment.
// A 2026 season source is NOT 2027 live roster verification.
export const SAFE_2026_COLLEGE_PROVENANCE_RECOVERY_SQL = `WITH missing_source AS MATERIALIZED (
  SELECT f.playerid, f.current_teamid
  FROM public.flip_card_front_stage f
  JOIN public.teamid_universe_mapping u ON u.teamid=f.current_teamid
  WHERE EXTRACT(YEAR FROM CURRENT_DATE)=2026
    AND f.status_label='ACTIVE'
    AND f.current_teamid IS NOT NULL
    AND f.current_team_source IS NULL
    AND (f.current_team_source_team_id IS NULL OR f.current_team_source_team_id=f.current_teamid)
    AND f.current_team_last_verified IS NULL
    AND f.current_team_source_player_id IS NULL
    AND f.last_transaction_applied_at IS NULL
    AND f.last_transaction_type IS NULL
    AND f.level_label=u.level_label
    AND f.current_team_name=u.current_team_name
    AND f.current_org_or_conference_name IS NOT DISTINCT FROM u.current_org_or_conference_name
    AND u.level_label IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')
    AND NULLIF(BTRIM(u.current_team_name),'') IS NOT NULL
    AND NULLIF(BTRIM(u.current_org_or_conference_name),'') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid)
    AND NOT EXISTS (SELECT 1 FROM public.player_source_map m WHERE m.playerid=f.playerid AND m.source='mlb_api' AND m.is_verified=true)
    AND NOT EXISTS (SELECT 1 FROM public.mlb_org_roster_resolution r WHERE r.playerid=f.playerid AND r.match_status='matched')
    AND NOT EXISTS (SELECT 1 FROM public.school_player_profile_submission_raw s WHERE s.approved_playerid=f.playerid AND s.is_reviewed=true AND s.is_verified=true)
), feed_teams AS MATERIALIZED (
  SELECT b.playerid,b.teamid FROM public.tbc_batting_2026_season_raw b JOIN missing_source f ON f.playerid=b.playerid
  WHERE b.year='2026' AND b.teamid ~ '^[0-9]+$'
  UNION
  SELECT p.playerid,p.teamid FROM public.tbc_pitching_2026_season_raw p JOIN missing_source f ON f.playerid=p.playerid
  WHERE p.year='2026' AND p.teamid ~ '^[0-9]+$'
), archive_teams AS (
  SELECT b.playerid,b.teamid FROM public.tbc_complete_batting_history b JOIN missing_source f ON f.playerid=b.playerid
  WHERE b.year='2026' AND b.teamid ~ '^[0-9]+$' AND NOT EXISTS(SELECT 1 FROM feed_teams d WHERE d.playerid=b.playerid)
  UNION
  SELECT p.playerid,p.teamid FROM public.tbc_complete_pitching_history p JOIN missing_source f ON f.playerid=p.playerid
  WHERE p.year='2026' AND p.teamid ~ '^[0-9]+$' AND NOT EXISTS(SELECT 1 FROM feed_teams d WHERE d.playerid=p.playerid)
), unique_2026 AS (
  SELECT playerid,MIN(teamid) teamid FROM (SELECT * FROM feed_teams UNION SELECT * FROM archive_teams) x
  GROUP BY playerid HAVING COUNT(DISTINCT teamid)=1
), verified AS MATERIALIZED (
  SELECT f.playerid,f.current_teamid FROM missing_source f JOIN unique_2026 x ON x.playerid=f.playerid AND x.teamid=f.current_teamid
), changed AS (
  UPDATE public.flip_card_front_stage f
  SET current_team_source='tbc_2026_college_participation',
      current_team_source_team_id=COALESCE(f.current_team_source_team_id,v.current_teamid),
      source_summary=COALESCE(f.source_summary,'{}'::jsonb) ||
        jsonb_build_object('current_team_resolution',jsonb_build_object(
          'source','unique_2026_college_participation','season',2026,'teamid',v.current_teamid,
          'assignment_unchanged',true,'provenance_recovered_at',NOW())),
      updated_at=NOW(),stage_updated_at=NOW()
  FROM verified v
  WHERE f.playerid=v.playerid AND f.status_label='ACTIVE'
    AND f.current_teamid=v.current_teamid AND f.current_team_source IS NULL
    AND (f.current_team_source_team_id IS NULL OR f.current_team_source_team_id=v.current_teamid)
    AND f.current_team_last_verified IS NULL AND f.last_transaction_applied_at IS NULL AND f.last_transaction_type IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid)
  RETURNING f.playerid
)
SELECT COUNT(*)::int AS recovered FROM changed`;
