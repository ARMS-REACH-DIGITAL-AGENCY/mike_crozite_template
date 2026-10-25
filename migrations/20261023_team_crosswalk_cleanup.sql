-- 2026-10-23: consolidate team/provider crosswalks.
-- teamid_universe_mapping is the only display identity authority.
-- team_id_map and indy_iscore_team_source_map remain provider-ID crosswalks.
-- Applied live before this migration was committed.

BEGIN;

CREATE OR REPLACE VIEW public.player_next_game AS
 SELECT b.playerid,
    b.teamid AS tbc_teamid,
    m.mlb_stats_api_id,
    u.current_team_name::character varying(200) AS current_team,
    u.level_label AS level,
    s.game_date AS next_game_date,
    s.game_time_utc AS next_game_time,
    (s.away_team_name::text || ' @ '::text) || s.home_team_name::text AS matchup,
        CASE
            WHEN s.home_team_id = m.mlb_stats_api_id THEN 'HOME'::text
            ELSE 'AWAY'::text
        END AS home_away,
    s.venue_name
   FROM ( SELECT DISTINCT ON (tbc_batting_raw.playerid) tbc_batting_raw.playerid,
            tbc_batting_raw.teamid,
            tbc_batting_raw.highlevel
           FROM tbc_batting_raw
          WHERE tbc_batting_raw.year = '2025'::text
          ORDER BY tbc_batting_raw.playerid, tbc_batting_raw.year DESC) b
     JOIN team_id_map m ON m.tbc_teamid = b.teamid
     JOIN teamid_universe_mapping u ON u.teamid = b.teamid
     JOIN LATERAL ( SELECT ts.id,
            ts.game_pk,
            ts.game_date,
            ts.game_time_utc,
            ts.status,
            ts.home_team_id,
            ts.home_team_name,
            ts.away_team_id,
            ts.away_team_name,
            ts.venue_name,
            ts.sport_id,
            ts.level,
            ts.home_score,
            ts.away_score,
            ts.created_at,
            ts.updated_at,
            ts.game_type,
            ts.current_inning,
            ts.inning_state,
            ts.inning_ordinal
           FROM team_schedules ts
          WHERE (ts.home_team_id = m.mlb_stats_api_id OR ts.away_team_id = m.mlb_stats_api_id) AND ts.game_date >= CURRENT_DATE
          ORDER BY ts.game_date
         LIMIT 1) s ON true;

CREATE OR REPLACE VIEW public.v_player_next_game_resolved AS
 WITH school_tz AS (
         SELECT f.playerid,
            NULLIF(TRIM(BOTH FROM f.school_timezone), ''::text) AS school_timezone,
            NULLIF(TRIM(BOTH FROM f.hsid), ''::text) AS hsid
           FROM flip_card_front_stage f
        ), pro_player_team AS (
         SELECT pct.playerid,
            u.current_team_name,
            u.level_label AS current_level,
            pct.source_team_id AS mlb_stats_api_id,
            tim.tbc_teamid,
            'pro'::text AS schedule_source
           FROM player_current_team pct
             JOIN team_id_map tim ON tim.mlb_stats_api_id::text = pct.source_team_id
             JOIN teamid_universe_mapping u ON u.teamid = tim.tbc_teamid
          WHERE pct.source = 'mlb_api'::text
        ), candidate_games AS (
         SELECT ppt.playerid,
            ppt.schedule_source,
            ppt.tbc_teamid,
            ppt.current_team_name,
            ppt.current_level,
            vts.game_date,
            vts.game_time_utc,
            vts.home_away,
            vts.opponent,
            vts.status AS game_status_raw,
                CASE
                    WHEN COALESCE(vts.status, ''::character varying)::text = ANY (ARRAY['In Progress'::text, 'Manager Challenge'::text]) THEN 1
                    WHEN COALESCE(vts.status, ''::character varying)::text = ANY (ARRAY['Pre-Game'::text, 'Preview'::text, 'Scheduled'::text, 'Warmup'::text, 'Delayed Start'::text]) THEN 2
                    WHEN COALESCE(vts.status, ''::character varying)::text = ANY (ARRAY['Final'::text, 'Game Over'::text, 'Completed Early'::text]) THEN 9
                    ELSE 5
                END AS status_priority
           FROM pro_player_team ppt
             JOIN v_team_schedule_feed vts ON vts.tbc_teamid = ppt.tbc_teamid
          WHERE vts.game_date > CURRENT_DATE OR vts.game_date = CURRENT_DATE AND (COALESCE(vts.status, ''::character varying)::text = ANY (ARRAY['In Progress'::text, 'Manager Challenge'::text, 'Pre-Game'::text, 'Preview'::text, 'Scheduled'::text, 'Warmup'::text, 'Delayed Start'::text]))
        ), picked_game AS (
         SELECT DISTINCT ON (cg.playerid) cg.playerid,
            cg.schedule_source,
            cg.tbc_teamid,
            cg.current_team_name,
            cg.current_level,
            cg.game_date,
            cg.game_time_utc,
            cg.home_away,
            cg.opponent,
            cg.game_status_raw,
                CASE
                    WHEN cg.game_status_raw::text = ANY (ARRAY['In Progress'::text, 'Manager Challenge'::text]) THEN 'IN PROGRESS'::text
                    ELSE 'NEXT GAME'::text
                END AS next_game_status_label
           FROM candidate_games cg
          ORDER BY cg.playerid, cg.status_priority, cg.game_date, cg.game_time_utc
        )
 SELECT pg.playerid,
    pg.schedule_source,
    pg.tbc_teamid,
    pg.current_team_name,
    pg.current_level,
    pg.game_status_raw,
    pg.next_game_status_label,
    to_char(pg.game_date::timestamp with time zone, 'FMDay | FMMonth FMDD, YYYY'::text) AS next_game_date,
        CASE
            WHEN pg.home_away ~~* 'home'::text THEN 'vs.'::text
            WHEN pg.home_away ~~* 'away'::text THEN '@'::text
            ELSE pg.home_away
        END AS next_game_home_away,
    pg.opponent AS next_game_opponent,
    pg.game_time_utc AS next_game_time_utc,
    st.school_timezone,
        CASE
            WHEN pg.game_time_utc IS NULL THEN NULL::text
            WHEN st.school_timezone ~~ '%/%'::text THEN to_char((pg.game_time_utc AT TIME ZONE st.school_timezone), 'FMHH12:MI AM'::text)
            ELSE to_char((pg.game_time_utc AT TIME ZONE 'America/Phoenix'::text), 'FMHH12:MI AM'::text)
        END AS next_game_time_local
   FROM picked_game pg
     LEFT JOIN school_tz st ON st.playerid = pg.playerid;

CREATE OR REPLACE VIEW public.v_player_upcoming_games AS
 SELECT p.playerid,
    p.teamid AS tbc_teamid,
    u.current_team_name AS team_name,
    m.mlb_stats_api_id,
    s.game_pk,
    s.game_date,
    s.game_time_utc,
    s.status,
    s.venue_name,
    s.home_team_id,
    s.home_team_name,
    s.away_team_id,
    s.away_team_name,
        CASE
            WHEN s.home_team_id = m.mlb_stats_api_id THEN 'Home'::text
            ELSE 'Away'::text
        END AS home_away,
        CASE
            WHEN s.home_team_id = m.mlb_stats_api_id THEN s.away_team_name
            ELSE s.home_team_name
        END AS opponent,
    s.home_score,
    s.away_score
   FROM v_player_primary_team p
     JOIN team_id_map m ON TRIM(BOTH FROM p.teamid) = TRIM(BOTH FROM m.tbc_teamid)
     JOIN teamid_universe_mapping u ON u.teamid = m.tbc_teamid
     JOIN team_schedules s ON s.home_team_id = m.mlb_stats_api_id OR s.away_team_id = m.mlb_stats_api_id;

CREATE OR REPLACE VIEW public.v_team_schedule_feed AS
 SELECT DISTINCT m.tbc_teamid,
    u.current_team_name AS team_name,
    m.mlb_stats_api_id,
    s.game_pk,
    s.game_date,
    s.game_time_utc,
    s.status,
    s.venue_name,
    s.home_team_id,
    s.home_team_name,
    s.away_team_id,
    s.away_team_name,
        CASE
            WHEN s.home_team_id = m.mlb_stats_api_id THEN 'Home'::text
            ELSE 'Away'::text
        END AS home_away,
        CASE
            WHEN s.home_team_id = m.mlb_stats_api_id THEN s.away_team_name
            ELSE s.home_team_name
        END AS opponent,
    s.home_score,
    s.away_score
   FROM team_id_map m
     JOIN teamid_universe_mapping u ON u.teamid = m.tbc_teamid
     JOIN team_schedules s ON s.home_team_id = m.mlb_stats_api_id OR s.away_team_id = m.mlb_stats_api_id;



DO $$
BEGIN
  IF to_regclass('public.team_level_map') IS NOT NULL
     AND to_regclass('public.team_level_map_legacy_archived_20261023') IS NULL THEN
    ALTER TABLE public.team_level_map RENAME TO team_level_map_legacy_archived_20261023;
  END IF;
  IF to_regclass('public.pro_schedule_team_map_2026') IS NOT NULL
     AND to_regclass('public.pro_schedule_team_map_2026_legacy_archived_20261023') IS NULL THEN
    ALTER TABLE public.pro_schedule_team_map_2026 RENAME TO pro_schedule_team_map_2026_legacy_archived_20261023;
  END IF;
  IF to_regclass('public.tbc_to_mlb_team_map') IS NOT NULL
     AND to_regclass('public.tbc_to_mlb_team_map_legacy_archived_20261023') IS NULL THEN
    ALTER TABLE public.tbc_to_mlb_team_map RENAME TO tbc_to_mlb_team_map_legacy_archived_20261023;
  END IF;
  IF to_regclass('public.team_map_test') IS NOT NULL
     AND to_regclass('public.team_map_test_legacy_archived_20261023') IS NULL THEN
    ALTER TABLE public.team_map_test RENAME TO team_map_test_legacy_archived_20261023;
  END IF;
  IF to_regclass('public."150-pro_team_look_up_tbc_mlb"') IS NOT NULL
     AND to_regclass('public.pro_team_lookup_legacy_archived_20261023') IS NULL THEN
    ALTER TABLE public."150-pro_team_look_up_tbc_mlb" RENAME TO pro_team_lookup_legacy_archived_20261023;
  END IF;
END $$;


COMMIT;
