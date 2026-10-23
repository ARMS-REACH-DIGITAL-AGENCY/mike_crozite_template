-- 2026-10-23: canonical Team ID identity migration
-- teamid_universe_mapping is the sole source of team name,
-- organization/conference, and canonical level for these views.
-- Applied to production Neon before this migration was committed.

BEGIN;

CREATE OR REPLACE VIEW public.v_2026_college_player_team_candidates AS
 SELECT DISTINCT x.playerid,
    x.teamid
   FROM ( SELECT tbc_batting_2026_season_raw.playerid,
            tbc_batting_2026_season_raw.teamid
           FROM tbc_batting_2026_season_raw
          WHERE tbc_batting_2026_season_raw.playerid IS NOT NULL AND tbc_batting_2026_season_raw.teamid IS NOT NULL
        UNION
         SELECT tbc_pitching_2026_season_raw.playerid,
            tbc_pitching_2026_season_raw.teamid
           FROM tbc_pitching_2026_season_raw
          WHERE tbc_pitching_2026_season_raw.playerid IS NOT NULL AND tbc_pitching_2026_season_raw.teamid IS NOT NULL) x
     JOIN teamid_universe_mapping u ON u.teamid = x.teamid
  WHERE u.level_label = ANY (ARRAY['NCAA-D1'::text, 'NCAA-D2'::text, 'NCAA-D3'::text, 'NAIA'::text, 'NJCAA'::text, 'CCCAA'::text, 'NWAC'::text]);

CREATE OR REPLACE VIEW public.v_college_programs_with_tbc_team_map AS
 SELECT u.teamid,
    u.current_team_name AS school,
    u.locationlong AS city_and_state,
    NULL::text AS type,
    u.current_org_or_conference_name AS conference,
    u.level_label AS level,
    u.conference_website,
    u.schedule_rss_feed AS "conference_website_-_schedule_rss_feed",
    u.conference_schedule_url AS "conference_website_-_schedule",
    u.school_baseball_home_url AS "presto_school_site_-_baseball_home",
    u.roster_url AS "presto_school_site_-_roster",
    u.schedule_url AS "presto_school_site_-_schedule",
    u.statistics_url AS statistics,
    u.news_url AS "presto_school_site_-_news",
    u.instagram_url AS instagram,
    u.x_url AS x,
    u.facebook_url AS facebook,
    u.coach_x_url AS coach_x,
    t.collegename,
    t.collegeshort,
    t.nickname,
    t.locationlong
   FROM teamid_universe_mapping u
     LEFT JOIN tbc_college_teams_map_raw t ON t.teamid = u.teamid
  WHERE u.level_label = ANY (ARRAY['NCAA-D1'::text, 'NCAA-D2'::text, 'NCAA-D3'::text, 'NAIA'::text, 'NJCAA'::text, 'CCCAA'::text, 'NWAC'::text]);

CREATE OR REPLACE VIEW public.v_flip_card_college_coverage_audit AS
 SELECT r.playerid,
    r.teamid,
    r.resolution_method,
    p.firstname,
    p.lastname,
    p.high_school,
    u.current_team_name AS resolved_current_team_name,
    u.current_org_or_conference_name AS resolved_conference_name,
    u.level_label AS resolved_level_label,
    f.playerid AS stage_playerid,
    f.display_name AS stage_display_name,
    f.current_team_name AS stage_current_team_name,
    f.current_org_or_conference_name AS stage_conference_name,
    f.level_label AS stage_level_label,
    f.status_label AS stage_status_label,
        CASE
            WHEN f.playerid IS NULL THEN 'MISSING_FROM_FLIP_CARD_STAGE'::text
            WHEN u.teamid IS NULL THEN 'MISSING_CANONICAL_TEAM_MAPPING'::text
            WHEN NULLIF(btrim(f.current_team_name), ''::text) IS NULL THEN 'MISSING_CURRENT_TEAM_NAME'::text
            WHEN NULLIF(btrim(f.current_org_or_conference_name), ''::text) IS NULL THEN 'MISSING_CONFERENCE'::text
            WHEN NULLIF(btrim(f.level_label), ''::text) IS NULL THEN 'MISSING_LEVEL'::text
            WHEN f.current_team_name IS DISTINCT FROM u.current_team_name THEN 'TEAM_MISMATCH'::text
            WHEN f.current_org_or_conference_name IS DISTINCT FROM u.current_org_or_conference_name THEN 'CONFERENCE_MISMATCH'::text
            WHEN f.level_label IS DISTINCT FROM u.level_label THEN 'LEVEL_MISMATCH'::text
            ELSE 'OK'::text
        END AS audit_status
   FROM v_2026_college_player_team_resolved r
     LEFT JOIN tbc_players_raw p ON p.playerid = r.playerid
     LEFT JOIN teamid_universe_mapping u ON u.teamid = r.teamid
     LEFT JOIN flip_card_front_stage f ON f.playerid = r.playerid;

CREATE OR REPLACE VIEW public.v_news_player_context AS
 WITH school_map AS (
         SELECT ph.playerid,
            min(ph.hsid::text) AS hsid,
            min(ph.hsname) AS hsname
           FROM player_hsids ph
          GROUP BY ph.playerid
        ), latest_season_all AS (
         SELECT p.playerid,
                CASE
                    WHEN p.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(p.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS year_num,
            p.teamid,
            p.highlevel AS current_level,
            p.draft_info,
            p.playyears,
            1 AS source_priority
           FROM tbc_pitching_raw p
        UNION ALL
         SELECT b.playerid,
                CASE
                    WHEN b.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(b.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS "case",
            b.teamid,
            b.highlevel,
            b.draft_info,
            b.playyears,
            2
           FROM tbc_batting_raw b
        ), latest_season_choice AS (
         SELECT DISTINCT ON (x.playerid) x.playerid,
            x.year_num,
            x.teamid AS current_teamid,
            x.current_level,
            x.draft_info,
            x.playyears
           FROM latest_season_all x
          WHERE x.year_num IS NOT NULL
          ORDER BY x.playerid, x.year_num DESC, x.source_priority, x.teamid
        ), college_rows AS (
         SELECT v.playerid,
                CASE
                    WHEN v.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(v.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS yr,
            v.team_display AS college_name
           FROM vw_player_pitching_seasons v
          WHERE v.team_level = ANY (ARRAY['NCAA-D1'::text, 'NCAA-D2'::text, 'NCAA-D3'::text, 'NAIA'::text, 'NJCAA'::text, 'CCCAA'::text, 'NWAC'::text])
        UNION ALL
         SELECT v.playerid,
                CASE
                    WHEN v.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(v.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS "case",
            v.team_display
           FROM vw_player_batting_seasons v
          WHERE v.team_level = ANY (ARRAY['NCAA-D1'::text, 'NCAA-D2'::text, 'NCAA-D3'::text, 'NAIA'::text, 'NJCAA'::text, 'CCCAA'::text, 'NWAC'::text])
        ), college_dedup AS (
         SELECT college_rows.playerid,
            college_rows.college_name,
            min(college_rows.yr) AS first_year
           FROM college_rows
          WHERE college_rows.college_name IS NOT NULL AND btrim(college_rows.college_name) <> ''::text AND college_rows.yr IS NOT NULL
          GROUP BY college_rows.playerid, college_rows.college_name
        ), college_path AS (
         SELECT college_dedup.playerid,
            string_agg(college_dedup.college_name, chr(59) || ' '::text ORDER BY college_dedup.first_year, college_dedup.college_name) AS college_path_text
           FROM college_dedup
          GROUP BY college_dedup.playerid
        ), career_rows AS (
         SELECT b.playerid,
                CASE
                    WHEN b.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(b.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS yr,
            u_1.current_team_name AS team_name
           FROM tbc_batting_raw b
             LEFT JOIN teamid_universe_mapping u_1 ON u_1.teamid = b.teamid
        UNION ALL
         SELECT p.playerid,
                CASE
                    WHEN p.year ~ '^[0-9]{4}([.][0-9]+)?$'::text THEN split_part(p.year, '.'::text, 1)::integer
                    ELSE NULL::integer
                END AS "case",
            u_1.current_team_name
           FROM tbc_pitching_raw p
             LEFT JOIN teamid_universe_mapping u_1 ON u_1.teamid = p.teamid
        ), career_dedup AS (
         SELECT career_rows.playerid,
            career_rows.team_name,
            min(career_rows.yr) AS first_year
           FROM career_rows
          WHERE career_rows.team_name IS NOT NULL AND btrim(career_rows.team_name) <> ''::text AND career_rows.yr IS NOT NULL
          GROUP BY career_rows.playerid, career_rows.team_name
        ), career_path AS (
         SELECT career_dedup.playerid,
            string_agg(career_dedup.team_name, chr(59) || ' '::text ORDER BY career_dedup.first_year, career_dedup.team_name) AS career_team_names
           FROM career_dedup
          GROUP BY career_dedup.playerid
        )
 SELECT tp.playerid,
    tp.firstname,
    tp.lastname,
    sm.hsid,
    COALESCE(sm.hsname, tp.high_school) AS high_school,
    tp.highlevel,
    lsc.draft_info,
    lsc.playyears,
    cp.college_path_text,
    lsc.current_teamid,
    u.current_team_name,
    u.current_org_or_conference_name AS current_org_name,
    u.level_label AS current_team_level,
    lsc.current_level,
    tp.throws,
    tp.bats,
    tp.posit,
    cap.career_team_names
   FROM tbc_players_raw tp
     LEFT JOIN school_map sm ON sm.playerid = tp.playerid
     LEFT JOIN latest_season_choice lsc ON lsc.playerid = tp.playerid
     LEFT JOIN teamid_universe_mapping u ON u.teamid = lsc.current_teamid
     LEFT JOIN college_path cp ON cp.playerid = tp.playerid
     LEFT JOIN career_path cap ON cap.playerid = tp.playerid;

CREATE OR REPLACE VIEW public.vw_player_batting_seasons AS
 SELECT b.playerid,
    b.year,
    b.teamid,
    COALESCE(u.current_team_name, b.teamid) AS team_display,
    u.level_label AS team_level,
    b.g,
    b.ab,
    b.r,
    b.h,
    b.dbl,
    b.tpl,
    b.hr,
    b.rbi,
    b.sb,
    b.bb,
    b.so,
    b.bavg,
    b.obp,
    b.slg,
    b.ops,
    b.draft_info
   FROM tbc_batting_raw b
     LEFT JOIN teamid_universe_mapping u ON u.teamid = b.teamid;

CREATE OR REPLACE VIEW public.vw_player_pitching_seasons AS
 SELECT p.teamid,
    p.playerid,
    p.year,
    p.uniform,
    p.playername,
    p.age,
    p.ba,
    p.th,
    p.class,
    p.w,
    p.l,
    p.g,
    p.gs,
    p.cg,
    p.sho,
    p.gr,
    p.gf,
    p.sv,
    p.ip,
    p.h,
    p.r,
    p.er,
    p.hr,
    p.bb,
    p.so,
    p.wp,
    p.bk,
    p.hb,
    p.era,
    p.whip,
    p.h9,
    p.hr9,
    p.bb9,
    p.so9,
    p.ra9,
    p.so_bb,
    p.highlevel,
    p.mlbyears,
    p.playyears,
    p.draft_info,
        CASE
            WHEN u.teamid ~ '^[0-9]+$'::text THEN u.teamid::integer
            ELSE NULL::integer
        END AS resolved_teamid,
    COALESCE(u.current_team_name, p.teamid) AS team_display,
    u.current_team_name AS team_name,
    COALESCE(u.level_label, 'UNKNOWN'::text) AS team_level,
    u.current_org_or_conference_name AS league
   FROM tbc_pitching_raw p
     LEFT JOIN teamid_universe_mapping u ON u.teamid = p.teamid;

COMMIT;
