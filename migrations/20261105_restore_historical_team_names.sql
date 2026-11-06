-- Reconcile numeric team IDs appearing in historical batting and pitching season rows.
-- Uses only first-party ingested The Baseball Cube college-team reference records.
-- Deliberately does NOT invent NCAA division, conference, current team, or status.
-- Idempotent: never overwrite an existing canonical team ID.
--
-- Expected production discovery on 2026-11-05: 58 missing numeric team IDs
-- covering 1,404 historical stat rows; 57 have approved source names, one
-- (12040; two 1981/1982 rows) lacks a grounded alternate team reference.
-- If new IDs are added to the TBC college catalog later, this is safe to rerun.
WITH observed AS (
  SELECT teamid FROM public.tbc_complete_batting_history
  UNION
  SELECT teamid FROM public.tbc_complete_pitching_history
),
missing AS (
  SELECT c.teamid,
         nullif(btrim(c.collegename), '') AS name,
         nullif(btrim(c.collegeshort), '') AS short_name,
         nullif(btrim(c.nickname), '') AS nickname,
         nullif(btrim(c.locationlong), '') AS location
  FROM observed o
  JOIN public.tbc_college_teams_map_raw c ON c.teamid = o.teamid
  WHERE o.teamid ~ '^[0-9]+$'
    AND nullif(btrim(c.collegename), '') IS NOT NULL
    AND btrim(c.collegename) !~ '^[0-9]+$'
    AND NOT EXISTS (
      SELECT 1 FROM public.teamid_universe_mapping m WHERE m.teamid = o.teamid
    )
)
INSERT INTO public.teamid_universe_mapping
  (teamid, current_team_name, current_team_short_name,
   nickname, locationlong, source_system, notes)
SELECT teamid, name, coalesce(short_name,name), nickname, location,
       'tbc_college_teams_map_raw',
       'Verified name and location from TBC college-team source; recovered for historical season-stat ID display on 2026-11-05. Division and conference not inferred.'
FROM missing
ON CONFLICT (teamid) DO NOTHING;

-- Remaining unresolved names should stay in an auditable review queue.
-- Do not display their numeric IDs as team names on public profiles.
