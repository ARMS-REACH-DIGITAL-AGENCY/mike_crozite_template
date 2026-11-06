-- Non-destructive audit of historical team IDs absent from the canonical
-- teamid_universe_mapping. Every unverified identity goes into a review queue.
--
-- Do not insert these into the canonical table without independently
-- verifying official level and organization/conference: the DB has a
-- deliberate guard_canonical_team_identity() trigger requiring those fields.
--
-- On Nov 5 2026 the combined season history contains 58 unmapped numeric IDs,
-- 1,404 batting/pitching rows, 590 distinct players. The TBC raw college
-- catalog supplies readable names for 57 IDs (1,402 rows); teamid 12040,
-- 1981-82 Mark Swinney seasons, has no grounded reference in either catalog.
WITH history AS (
  SELECT playerid,year,teamid FROM public.tbc_complete_batting_history
  UNION ALL
  SELECT playerid,year,teamid FROM public.tbc_complete_pitching_history
),
missing AS (
  SELECT h.teamid,count(*)::bigint AS row_count,
         min(h.year) AS first_year,max(h.year) AS last_year
  FROM history h
  LEFT JOIN public.teamid_universe_mapping m ON m.teamid=h.teamid
  WHERE m.teamid IS NULL AND h.teamid ~ '^[0-9]+$'
  GROUP BY h.teamid
)
INSERT INTO public.tbc_teamid_reconciliation_queue
  (teamid,resolution_status,source_evidence,total_stat_rows,
   first_season,last_season,canonical_team_name)
SELECT x.teamid,
       CASE WHEN nullif(btrim(c.collegename),'') IS NULL
            THEN 'UNMAPPED' ELSE 'INCOMPLETE' END,
       jsonb_build_object(
         'source','TBC historical player batting and pitching records',
         'college_raw_team_name',c.collegename,
         'college_raw_short_name',c.collegeshort,
         'college_raw_location',c.locationlong,
         'has_canonical_mapping',false,
         'review_needed','official level and conference before canonical insert'),
       x.row_count,x.first_year,x.last_year,
       nullif(btrim(c.collegename),'')
FROM missing x LEFT JOIN public.tbc_college_teams_map_raw c ON c.teamid=x.teamid
ON CONFLICT(teamid) DO NOTHING;
