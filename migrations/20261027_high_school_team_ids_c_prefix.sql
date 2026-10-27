-- High school teams' teamids are C + hsid (Pete, Oct 27, 2026).
--
-- Every high school (hsid) is also a team: each microsite has a current team
-- page, for the school's current high school players. The plain hsid can't be
-- the teamid - 202 hsids are already other teams' teamids (hsid 1 = Bullard,
-- teamid 1 = Anaheim Angels; 25 = Bishop Hendricken / San Francisco Giants)
-- - and YAT is for player ids only. So a high school's teamid is C (current)
-- + hsid: Hamilton (hsid 5004) is C5004.
--
-- The 1,024 high schools in teamid_universe_mapping were YAT + hsid; the 13
-- current Hamilton players' current_teamid was the plain 5004. Nothing else
-- referenced a high school teamid. Old values are kept in
-- teamid_universe_mapping_hs_yat_backup_20261027 and
-- flip_card_front_stage_hs_team_backup_20261027. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.teamid_universe_mapping_hs_yat_backup_20261027 AS
SELECT * FROM public.teamid_universe_mapping WHERE teamid ~ '^YAT\d+$' AND level_label = 'HIGH SCHOOL';

CREATE TABLE IF NOT EXISTS public.flip_card_front_stage_hs_team_backup_20261027 AS
SELECT playerid, hsid, current_teamid, current_team_name, current_team_source, stage_updated_at
  FROM public.flip_card_front_stage
 WHERE current_teamid = '5004' AND current_team_source = 'high_school_roster_hsid_teamid_rule';

UPDATE public.teamid_universe_mapping
   SET teamid = 'C' || substr(teamid, 4),
       notes = concat_ws(E'\n', nullif(notes, ''), '2026-10-27: teamid ' || teamid || ' -> C' || substr(teamid, 4)
         || ' (Pete: a high school''s current team is C + hsid; YAT is for player ids only, and the plain hsid collides with other teams'' teamids).')
 WHERE teamid ~ '^YAT\d+$' AND level_label = 'HIGH SCHOOL';

UPDATE public.flip_card_front_stage
   SET current_teamid = 'C5004', stage_updated_at = now()
 WHERE current_teamid = '5004' AND current_team_source = 'high_school_roster_hsid_teamid_rule';
