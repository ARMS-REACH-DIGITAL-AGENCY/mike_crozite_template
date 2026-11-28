-- The spring/exhibition schedule sport describes the competition, not
-- each participating team. Preserve provider sport/source_level and use the
-- uniquely mapped official team level. Only an actual scheduled participant
-- can bypass this specific cross-level hold; other validation stays intact.
BEGIN;
CREATE OR REPLACE VIEW public.v_stat_lines_from_mlb AS
SELECT l.id AS source_row_id,
    'mlb_api'::text AS source,
    l.id::text AS source_line_id,
    l.source_game_id,
    COALESCE((l.raw_payload -> 'player'::text) ->> 'id'::text, (l.raw_payload -> 'person'::text) ->> 'id'::text) AS source_player_id,
    l.source_team_id,
    l.playerid,
    l.stat_type,
    l.game_date,
    l.raw_payload ->> 'gameType'::text AS game_type,
    (l.raw_payload -> 'league'::text) ->> 'name'::text AS league_name,
    l.team_name,
    l.opponent_name,
    l.home_away,
    t.teamid,
        CASE
            WHEN u.official THEN u.level
            ELSE NULL::text
        END AS level,
    mlb.level AS source_level,
    COALESCE(s.status, l.game_status::character varying) AS game_status,
    fin.is_final,
        CASE
            WHEN NOT fin.is_final THEN NULL::boolean
            WHEN s.game_pk IS NOT NULL AND s.home_score IS NOT NULL AND s.away_score IS NOT NULL AND s.home_score <> s.away_score THEN
            CASE
                WHEN s.home_team_id::text = l.source_team_id THEN s.home_score > s.away_score
                WHEN s.away_team_id::text = l.source_team_id THEN s.away_score > s.home_score
                ELSE NULL::boolean
            END
            WHEN jsonb_typeof(l.raw_payload -> 'isWin'::text) = 'boolean'::text THEN (l.raw_payload ->> 'isWin'::text)::boolean
            ELSE NULL::boolean
        END AS team_won,
    l.started,
    b.bat_pa,
    b.bat_ab,
    b.bat_r,
    b.bat_h,
    b.bat_2b,
    b.bat_3b,
    b.bat_hr,
    b.bat_rbi,
    b.bat_bb,
    b.bat_ibb,
    b.bat_hbp,
    b.bat_so,
    b.bat_sb,
    b.bat_cs,
    b.bat_sf,
    b.bat_sh,
    b.bat_gidp,
    b.bat_tb,
    p.pit_outs,
    p.pit_h,
    p.pit_r,
    p.pit_er,
    p.pit_bb,
    p.pit_ibb,
    p.pit_so,
    p.pit_hr,
    p.pit_hbp,
    p.pit_bf,
    p.pit_pitches,
    p.pit_w,
    p.pit_l,
    p.pit_sv,
    p.pit_hld,
    p.pit_bs,
    p.pit_gs,
    p.pit_cg,
    p.pit_sho,
    COALESCE(l.stats, '{}'::jsonb) AS stats,
        CASE
            WHEN COALESCE(l.playerid, ''::text) = ''::text THEN 'No player id on the line'::text
            WHEN l.game_date IS NULL THEN 'No game date on the line'::text
            WHEN t.n = 0 THEN format('No teamid for MLB team %s (%s%s)'::text, COALESCE(l.source_team_id, '?'::text), COALESCE(l.team_name, 'no name'::text), COALESCE(', '::text || ((l.raw_payload -> 'league'::text) ->> 'name'::text), ''::text) || COALESCE(', MLB level '::text || ((l.raw_payload -> 'sport'::text) ->> 'abbreviation'::text), ''::text))
            WHEN t.n > 1 THEN format('MLB team %s (%s) is mapped to more than one teamid'::text, l.source_team_id, COALESCE(l.team_name, 'no name'::text))
            WHEN u.n = 0 THEN format('teamid %s (%s) is not in teamid_universe_mapping'::text, t.teamid, COALESCE(l.team_name, 'no name'::text))
            WHEN u.n > 1 THEN format('teamid %s is in teamid_universe_mapping more than once'::text, t.teamid)
            WHEN NOT u.official THEN format('teamid %s (%s) is listed at level %s, not an official level'::text, t.teamid, COALESCE(l.team_name, 'no name'::text), COALESCE(u.level, 'blank'::text))
            WHEN mlb.level IS NOT NULL AND mlb.level <> u.level
              AND NOT (
                mlb.level = 'MLB'
                AND upper(coalesce(l.raw_payload->>'gameType','')) IN ('S','E')
                AND upper(coalesce(s.game_type,'')) IN ('S','E')
                AND coalesce(s.home_team_id::text = l.source_team_id OR s.away_team_id::text = l.source_team_id, false)
              ) THEN format('MLB lists %s at %s (%s); teamid %s is listed %s'::text, COALESCE(l.team_name, l.source_team_id), mlb.level, (l.raw_payload -> 'sport'::text) ->> 'abbreviation'::text, t.teamid, u.level)
            ELSE NULL::text
        END AS hold_reason
   FROM player_game_logs l
     LEFT JOIN team_schedules s ON s.game_pk =
        CASE
            WHEN l.source_game_id ~ '^\d{1,18}$'::text THEN l.source_game_id::bigint
            ELSE NULL::bigint
        END
     CROSS JOIN LATERAL ( SELECT count(DISTINCT m.tbc_teamid)::integer AS n,
            min(m.tbc_teamid) AS teamid
           FROM team_id_map m
          WHERE m.mlb_stats_api_id =
                CASE
                    WHEN l.source_team_id ~ '^\d{1,9}$'::text THEN l.source_team_id::integer
                    ELSE NULL::integer
                END) t
     CROSS JOIN LATERAL ( SELECT count(*)::integer AS n,
            min(x.level_label) AS level,
            COALESCE(bool_and(x.level_label = ANY (ARRAY['MLB'::text, 'TRIPLE-A'::text, 'DOUBLE-A'::text, 'HIGH-A'::text, 'SINGLE-A'::text, 'ROOKIE'::text, 'INDY'::text, 'INTERNATIONAL'::text, 'NCAA-D1'::text, 'NCAA-D2'::text, 'NCAA-D3'::text, 'NAIA'::text, 'NJCAA'::text, 'CCCAA'::text, 'NWAC'::text, 'HIGH SCHOOL'::text])), false) AS official
           FROM teamid_universe_mapping x
          WHERE x.teamid = t.teamid) u
     CROSS JOIN LATERAL ( SELECT
                CASE (l.raw_payload -> 'sport'::text) ->> 'abbreviation'::text
                    WHEN 'MLB'::text THEN 'MLB'::text
                    WHEN 'AAA'::text THEN 'TRIPLE-A'::text
                    WHEN 'AA'::text THEN 'DOUBLE-A'::text
                    WHEN 'A+'::text THEN 'HIGH-A'::text
                    WHEN 'A'::text THEN 'SINGLE-A'::text
                    WHEN 'ROK'::text THEN 'ROOKIE'::text
                    ELSE NULL::text
                END AS level) mlb
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN s.game_pk IS NOT NULL THEN COALESCE(s.status, ''::character varying)::text ~* '^(final|game over|completed)'::text
                    ELSE COALESCE(l.game_status, ''::text) ~* '^(final|game over|completed)'::text
                END AS is_final) fin
     LEFT JOIN LATERAL ( SELECT stat_int(l.stats, 'plateAppearances'::text) AS bat_pa,
            stat_int(l.stats, 'atBats'::text) AS bat_ab,
            stat_int(l.stats, 'runs'::text) AS bat_r,
            stat_int(l.stats, 'hits'::text) AS bat_h,
            stat_int(l.stats, 'doubles'::text) AS bat_2b,
            stat_int(l.stats, 'triples'::text) AS bat_3b,
            stat_int(l.stats, 'homeRuns'::text) AS bat_hr,
            stat_int(l.stats, 'rbi'::text) AS bat_rbi,
            stat_int(l.stats, 'baseOnBalls'::text) AS bat_bb,
            stat_int(l.stats, 'intentionalWalks'::text) AS bat_ibb,
            stat_int(l.stats, 'hitByPitch'::text) AS bat_hbp,
            stat_int(l.stats, 'strikeOuts'::text) AS bat_so,
            stat_int(l.stats, 'stolenBases'::text) AS bat_sb,
            stat_int(l.stats, 'caughtStealing'::text) AS bat_cs,
            stat_int(l.stats, 'sacFlies'::text) AS bat_sf,
            stat_int(l.stats, 'sacBunts'::text) AS bat_sh,
            stat_int(l.stats, 'groundIntoDoublePlay'::text) AS bat_gidp,
            stat_int(l.stats, 'totalBases'::text) AS bat_tb) b ON l.stat_type = 'batting'::text
     LEFT JOIN LATERAL ( SELECT COALESCE(ip_to_outs(l.stats ->> 'inningsPitched'::text), stat_int(l.stats, 'outs'::text)) AS pit_outs,
            stat_int(l.stats, 'hits'::text) AS pit_h,
            stat_int(l.stats, 'runs'::text) AS pit_r,
            stat_int(l.stats, 'earnedRuns'::text) AS pit_er,
            stat_int(l.stats, 'baseOnBalls'::text) AS pit_bb,
            stat_int(l.stats, 'intentionalWalks'::text) AS pit_ibb,
            stat_int(l.stats, 'strikeOuts'::text) AS pit_so,
            stat_int(l.stats, 'homeRuns'::text) AS pit_hr,
            stat_int(l.stats, 'hitByPitch'::text) AS pit_hbp,
            stat_int(l.stats, 'battersFaced'::text) AS pit_bf,
            COALESCE(stat_int(l.stats, 'numberOfPitches'::text), stat_int(l.stats, 'pitchesThrown'::text)) AS pit_pitches,
            stat_int(l.stats, 'wins'::text) AS pit_w,
            stat_int(l.stats, 'losses'::text) AS pit_l,
            stat_int(l.stats, 'saves'::text) AS pit_sv,
            stat_int(l.stats, 'holds'::text) AS pit_hld,
            stat_int(l.stats, 'blownSaves'::text) AS pit_bs,
            stat_int(l.stats, 'gamesStarted'::text) AS pit_gs,
            stat_int(l.stats, 'completeGames'::text) AS pit_cg,
            stat_int(l.stats, 'shutouts'::text) AS pit_sho) p ON l.stat_type = 'pitching'::text
  WHERE l.source = 'mlb_api'::text AND (l.stat_type = ANY (ARRAY['batting'::text, 'pitching'::text]));
-- Re-land only previously held S/E lines now passing all view guards.
SELECT public.stat_lines_land_mlb(ARRAY(
  SELECT v.source_row_id
  FROM public.stat_lines st
  JOIN public.v_stat_lines_from_mlb v ON v.source_line_id = st.source_line_id
  WHERE st.source = 'mlb_api' AND st.removed_at IS NULL
    AND st.game_type IN ('S','E') AND st.hold_reason LIKE 'MLB lists %'
    AND v.hold_reason IS NULL
));
COMMIT;
