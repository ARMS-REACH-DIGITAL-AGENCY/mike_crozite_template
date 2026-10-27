-- Every high school is a team (Pete, Oct 27, 2026): "add all the chsid
-- numbers to the db that the global search uses to pull up results, so a
-- player can add his current team which may be a high school."
--
-- A high school's teamid is C + hsid (Hamilton = C5004). 1,024 schools had a
-- row; this adds the other schools in school_success (14,868 on Oct 27), the
-- same way those 1,024 were made: name = school + mascot ("Kirkwood
-- Pioneers"), mascot, state, town, level HIGH SCHOOL. Global Search (current
-- team) reads these rows; a college commitment never offers one.
--
-- Only adds rows; never changes an existing one. Safe to re-run. To undo:
--   DELETE FROM public.teamid_universe_mapping
--    WHERE source_system = 'YATSTATS_HIGH_SCHOOL'
--      AND notes LIKE 'Added 2026-10-27 from school_success%';
INSERT INTO public.teamid_universe_mapping
  (teamid, current_team_name, nickname, current_org_or_conference_name, locationlong,
   level_label, source_system, notes)
SELECT DISTINCT ON (s.hsid)
       'C' || s.hsid::text,
       btrim(btrim(s.hsname) || ' ' || coalesce(btrim(s.nickname), '')),
       nullif(btrim(s.nickname), ''),
       nullif(btrim(s.regionname), ''),
       nullif(btrim(s.hslocation), ''),
       'HIGH SCHOOL',
       'YATSTATS_HIGH_SCHOOL',
       'Added 2026-10-27 from school_success (Pete: every high school is a team, teamid C + hsid, so a high school player can choose his school as his current team in Global Search).'
  FROM public.school_success s
 WHERE s.hsid IS NOT NULL
   AND coalesce(btrim(s.hsname), '') <> ''
   AND NOT EXISTS (SELECT 1 FROM public.teamid_universe_mapping t WHERE t.teamid = 'C' || s.hsid::text)
 ORDER BY s.hsid;
