-- Repair and expand the identity context used by Alumni News.
-- TBC has decimal year variants such as 2018.1/2018.2, so year parsing
-- must be tolerant rather than casting raw text directly to integer.

CREATE OR REPLACE VIEW public.v_news_player_context AS
WITH school_map AS (
  SELECT ph.playerid, min(ph.hsid::text) AS hsid, min(ph.hsname) AS hsname
  FROM public.player_hsids ph
  GROUP BY ph.playerid
),
latest_season_all AS (
  SELECT p.playerid,
         CASE WHEN p.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(p.year::text, '.', 1)::integer END AS year_num,
         p.teamid, p.highlevel AS current_level, p.draft_info, p.playyears, 1 AS source_priority
  FROM public.tbc_pitching_raw p
  UNION ALL
  SELECT b.playerid,
         CASE WHEN b.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(b.year::text, '.', 1)::integer END AS year_num,
         b.teamid, b.highlevel AS current_level, b.draft_info, b.playyears, 2 AS source_priority
  FROM public.tbc_batting_raw b
),
latest_season_choice AS (
  SELECT DISTINCT ON (x.playerid)
         x.playerid, x.year_num, x.teamid AS current_teamid,
         x.current_level, x.draft_info, x.playyears
  FROM latest_season_all x
  WHERE x.year_num IS NOT NULL
  ORDER BY x.playerid, x.year_num DESC, x.source_priority, x.teamid
),
college_rows AS (
  SELECT v.playerid,
         CASE WHEN v.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(v.year::text, '.', 1)::integer END AS yr,
         v.team_display AS college_name
  FROM public.vw_player_pitching_seasons v
  WHERE v.team_level = ANY (ARRAY['JUCO','JrCollege','NCAA','NCAA-D1','NAIA']::text[])
  UNION ALL
  SELECT v.playerid,
         CASE WHEN v.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(v.year::text, '.', 1)::integer END AS yr,
         v.team_display AS college_name
  FROM public.vw_player_batting_seasons v
  WHERE v.team_level = ANY (ARRAY['JUCO','JrCollege','NCAA','NCAA-D1','NAIA']::text[])
),
college_dedup AS (
  SELECT cr.playerid, cr.college_name, min(cr.yr) AS first_year
  FROM college_rows cr
  WHERE cr.college_name IS NOT NULL AND btrim(cr.college_name) <> '' AND cr.yr IS NOT NULL
  GROUP BY cr.playerid, cr.college_name
),
college_path AS (
  SELECT cd.playerid,
         string_agg(cd.college_name, '; ' ORDER BY cd.first_year, cd.college_name) AS college_path_text
  FROM college_dedup cd
  GROUP BY cd.playerid
),
career_rows AS (
  SELECT b.playerid,
         CASE WHEN b.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(b.year::text, '.', 1)::integer END AS yr,
         COALESCE(m.current_team_name, cm.collegeshort, t.team_name) AS team_name
  FROM public.tbc_batting_raw b
  LEFT JOIN public.teamid_universe_mapping m ON m.teamid::text=b.teamid::text
  LEFT JOIN public.tbc_college_teams_map_raw cm ON cm.teamid::text=b.teamid::text
  LEFT JOIN public.teams t ON t.teamid::text=b.teamid::text
  UNION ALL
  SELECT p.playerid,
         CASE WHEN p.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(p.year::text, '.', 1)::integer END AS yr,
         COALESCE(m.current_team_name, cm.collegeshort, t.team_name) AS team_name
  FROM public.tbc_pitching_raw p
  LEFT JOIN public.teamid_universe_mapping m ON m.teamid::text=p.teamid::text
  LEFT JOIN public.tbc_college_teams_map_raw cm ON cm.teamid::text=p.teamid::text
  LEFT JOIN public.teams t ON t.teamid::text=p.teamid::text
),
career_dedup AS (
  SELECT playerid, team_name, min(yr) AS first_year
  FROM career_rows
  WHERE team_name IS NOT NULL AND btrim(team_name) <> '' AND yr IS NOT NULL
  GROUP BY playerid, team_name
),
career_path AS (
  SELECT playerid,
         string_agg(team_name, '; ' ORDER BY first_year, team_name) AS career_team_names
  FROM career_dedup
  GROUP BY playerid
)
SELECT tp.playerid, tp.firstname, tp.lastname, sm.hsid,
       COALESCE(sm.hsname, tp.high_school) AS high_school,
       tp.highlevel, lsc.draft_info, lsc.playyears,
       cp.college_path_text,
       lsc.current_teamid, t.team_name AS current_team_name,
       t.organization_name AS current_org_name, t.level AS current_team_level,
       lsc.current_level, tp.throws, tp.bats, tp.posit,
       cap.career_team_names
FROM public.tbc_players_raw tp
LEFT JOIN school_map sm ON sm.playerid = tp.playerid
LEFT JOIN latest_season_choice lsc ON lsc.playerid = tp.playerid
LEFT JOIN public.teams t ON t.teamid::text = lsc.current_teamid::text
LEFT JOIN college_path cp ON cp.playerid = tp.playerid
LEFT JOIN career_path cap ON cap.playerid = tp.playerid;
