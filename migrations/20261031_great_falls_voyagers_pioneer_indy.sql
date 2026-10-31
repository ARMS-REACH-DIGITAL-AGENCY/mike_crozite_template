-- Canonical 2021-2026 Great Falls team identity.
-- TBC: https://www.thebaseballcube.com/content/stats_indy/2026~12386
-- 2026 source Team ID 12386 is the Great Falls Voyagers, Pioneer League (INDY).
-- Historic Team ID 10208 predates the league's 2021 independent transition.
-- MLB Stats API ID 581 currently has a distinct YAT mapping 900581; leave its
-- crosswalk untouched until a separate provider-identity reconciliation.
-- This migration changes team reference metadata only. It does NOT classify
-- a player ACTIVE or assign his current team from season statistics.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $verify$
BEGIN
  IF (SELECT COUNT(*) FROM public.teamid_universe_mapping
      WHERE teamid='12386'
        AND current_team_name='Great Falls'
        AND level_label='PRO'
        AND source_system='tbc_pro_teams_map_raw') <> 1 THEN
    RAISE EXCEPTION 'Great Falls mapping changed: review before applying 2026 INDY correction';
  END IF;
END;
$verify$;
UPDATE public.teamid_universe_mapping
SET current_team_name='Great Falls Voyagers',
    current_org_or_conference_name='Pioneer League',
    level_label='INDY',
    nickname='Voyagers',
    notes='Verified 2026-10-31: TBC Team ID 12386 identifies the Great Falls Voyagers of the independent Pioneer League (2021-2026). Source: https://www.thebaseballcube.com/content/stats_indy/2026~12386. Retain historic TBC Team ID 10208 separately.'
WHERE teamid='12386'
  AND current_team_name='Great Falls'
  AND level_label='PRO'
  AND source_system='tbc_pro_teams_map_raw';
COMMIT;
