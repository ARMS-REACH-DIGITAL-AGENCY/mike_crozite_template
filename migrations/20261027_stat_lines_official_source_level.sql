-- stat_lines.source_level in the official level names (Pete, Oct 27: "The
-- OFFICIAL LEVELS need to be used in the stat_lines database table. AAA is
-- TRIPLE-A, AA is DOUBLE-A and so on").
--
-- source_level is MLB's own level for a game, kept beside level (the team's
-- official level) as a cross-check. It held MLB's abbreviations; now it holds
-- the official names: MLB, AAA -> TRIPLE-A, AA -> DOUBLE-A, A+ -> HIGH-A,
-- A -> SINGLE-A, ROK -> ROOKIE. MLB's two catch-alls aren't levels and get
-- no source_level: WIN (the winter leagues, Fall League and Caribbean) and
-- IND (independent and foreign leagues; its 111 lines so far are all on teams
-- listed INTERNATIONAL). Their level comes from the team, as every line's does.
--
-- 1. The conversion view writes the official name for new and updated lines.
-- 2. Existing lines are converted the same way (updated_at is left alone: no
--    stat changed).
-- 3. A check keeps anything but an official level out of the column.
-- Safe to run again.

BEGIN;

CREATE OR REPLACE VIEW public.v_stat_lines_from_mlb AS
SELECT
  l.id AS source_row_id,
  'mlb_api'::text AS source,
  l.id::text AS source_line_id,
  l.source_game_id,
  coalesce(l.raw_payload -> 'player' ->> 'id', l.raw_payload -> 'person' ->> 'id') AS source_player_id,
  l.source_team_id,
  l.playerid,
  l.stat_type,
  l.game_date,
  l.raw_payload ->> 'gameType' AS game_type,
  l.raw_payload -> 'league' ->> 'name' AS league_name,
  l.team_name,
  l.opponent_name,
  l.home_away,
  t.teamid,
  CASE WHEN u.official THEN u.level END AS level,
  -- MLB's own level for the game, in the official names (Pete, Oct 27): AAA
  -- is TRIPLE-A and so on. NULL for MLB's two catch-alls, which aren't
  -- levels: WIN (the winter leagues, Fall League and Caribbean) and IND
  -- (independent and foreign leagues - its lines so far are all on teams
  -- listed INTERNATIONAL). Those lines' level comes from the team, as every
  -- line's does.
  mlb.level AS source_level,
  coalesce(s.status, l.game_status) AS game_status,
  fin.is_final,
  CASE
    WHEN NOT fin.is_final THEN NULL
    WHEN s.game_pk IS NOT NULL AND s.home_score IS NOT NULL AND s.away_score IS NOT NULL AND s.home_score <> s.away_score
      THEN CASE WHEN s.home_team_id::text = l.source_team_id THEN s.home_score > s.away_score
                WHEN s.away_team_id::text = l.source_team_id THEN s.away_score > s.home_score END
    WHEN jsonb_typeof(l.raw_payload -> 'isWin') = 'boolean' THEN (l.raw_payload ->> 'isWin')::boolean
  END AS team_won,
  l.started,
  b.bat_pa, b.bat_ab, b.bat_r, b.bat_h, b.bat_2b, b.bat_3b, b.bat_hr, b.bat_rbi, b.bat_bb, b.bat_ibb,
  b.bat_hbp, b.bat_so, b.bat_sb, b.bat_cs, b.bat_sf, b.bat_sh, b.bat_gidp, b.bat_tb,
  p.pit_outs, p.pit_h, p.pit_r, p.pit_er, p.pit_bb, p.pit_ibb, p.pit_so, p.pit_hr, p.pit_hbp, p.pit_bf,
  p.pit_pitches, p.pit_w, p.pit_l, p.pit_sv, p.pit_hld, p.pit_bs, p.pit_gs, p.pit_cg, p.pit_sho,
  coalesce(l.stats, '{}'::jsonb) AS stats,
  CASE
    WHEN coalesce(l.playerid, '') = '' THEN 'No player id on the line'
    WHEN l.game_date IS NULL THEN 'No game date on the line'
    WHEN t.n = 0 THEN format('No teamid for MLB team %s (%s%s)', coalesce(l.source_team_id, '?'), coalesce(l.team_name, 'no name'),
      coalesce(', ' || (l.raw_payload -> 'league' ->> 'name'), '') || coalesce(', MLB level ' || (l.raw_payload -> 'sport' ->> 'abbreviation'), ''))
    WHEN t.n > 1 THEN format('MLB team %s (%s) is mapped to more than one teamid', l.source_team_id, coalesce(l.team_name, 'no name'))
    WHEN u.n = 0 THEN format('teamid %s (%s) is not in teamid_universe_mapping', t.teamid, coalesce(l.team_name, 'no name'))
    WHEN u.n > 1 THEN format('teamid %s is in teamid_universe_mapping more than once', t.teamid)
    WHEN NOT u.official THEN format('teamid %s (%s) is listed at level %s, not an official level', t.teamid, coalesce(l.team_name, 'no name'), coalesce(u.level, 'blank'))
    WHEN mlb.level IS NOT NULL AND mlb.level <> u.level THEN format('MLB lists %s at %s (%s); teamid %s is listed %s',
      coalesce(l.team_name, l.source_team_id), mlb.level, l.raw_payload -> 'sport' ->> 'abbreviation', t.teamid, u.level)
  END AS hold_reason
FROM public.player_game_logs l
LEFT JOIN public.team_schedules s
  ON s.game_pk = CASE WHEN l.source_game_id ~ '^\d{1,18}$' THEN l.source_game_id::bigint END
CROSS JOIN LATERAL (
  SELECT count(DISTINCT m.tbc_teamid)::int AS n, min(m.tbc_teamid) AS teamid
    FROM public.team_id_map m
   WHERE m.mlb_stats_api_id = CASE WHEN l.source_team_id ~ '^\d{1,9}$' THEN l.source_team_id::integer END
) t
CROSS JOIN LATERAL (
  SELECT count(*)::int AS n, min(x.level_label) AS level,
         coalesce(bool_and(x.level_label IN (
           'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
           'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL')), false) AS official
    FROM public.teamid_universe_mapping x
   WHERE x.teamid = t.teamid
) u
CROSS JOIN LATERAL (
  -- MLB's own level for the game, as one of the official levels, to check
  -- against the team's listed level.
  SELECT CASE l.raw_payload -> 'sport' ->> 'abbreviation'
    WHEN 'MLB' THEN 'MLB' WHEN 'AAA' THEN 'TRIPLE-A' WHEN 'AA' THEN 'DOUBLE-A'
    WHEN 'A+' THEN 'HIGH-A' WHEN 'A' THEN 'SINGLE-A' WHEN 'ROK' THEN 'ROOKIE' END AS level
) mlb
CROSS JOIN LATERAL (
  -- The schedule decides whether a scheduled pro game is over: the 4-hourly
  -- sync stamps every line it saves "Final", even mid-game. Games off the
  -- schedule (Fall League, winter leagues) go by the line.
  SELECT CASE WHEN s.game_pk IS NOT NULL THEN coalesce(s.status, '') ~* '^(final|game over|completed)'
              ELSE coalesce(l.game_status, '') ~* '^(final|game over|completed)' END AS is_final
) fin
LEFT JOIN LATERAL (
  SELECT
    public.stat_int(l.stats, 'plateAppearances') AS bat_pa, public.stat_int(l.stats, 'atBats') AS bat_ab,
    public.stat_int(l.stats, 'runs') AS bat_r, public.stat_int(l.stats, 'hits') AS bat_h,
    public.stat_int(l.stats, 'doubles') AS bat_2b, public.stat_int(l.stats, 'triples') AS bat_3b,
    public.stat_int(l.stats, 'homeRuns') AS bat_hr, public.stat_int(l.stats, 'rbi') AS bat_rbi,
    public.stat_int(l.stats, 'baseOnBalls') AS bat_bb, public.stat_int(l.stats, 'intentionalWalks') AS bat_ibb,
    public.stat_int(l.stats, 'hitByPitch') AS bat_hbp, public.stat_int(l.stats, 'strikeOuts') AS bat_so,
    public.stat_int(l.stats, 'stolenBases') AS bat_sb, public.stat_int(l.stats, 'caughtStealing') AS bat_cs,
    public.stat_int(l.stats, 'sacFlies') AS bat_sf, public.stat_int(l.stats, 'sacBunts') AS bat_sh,
    public.stat_int(l.stats, 'groundIntoDoublePlay') AS bat_gidp, public.stat_int(l.stats, 'totalBases') AS bat_tb
) b ON l.stat_type = 'batting'
LEFT JOIN LATERAL (
  SELECT
    coalesce(public.ip_to_outs(l.stats ->> 'inningsPitched'), public.stat_int(l.stats, 'outs')) AS pit_outs,
    public.stat_int(l.stats, 'hits') AS pit_h, public.stat_int(l.stats, 'runs') AS pit_r,
    public.stat_int(l.stats, 'earnedRuns') AS pit_er, public.stat_int(l.stats, 'baseOnBalls') AS pit_bb,
    public.stat_int(l.stats, 'intentionalWalks') AS pit_ibb, public.stat_int(l.stats, 'strikeOuts') AS pit_so,
    public.stat_int(l.stats, 'homeRuns') AS pit_hr, public.stat_int(l.stats, 'hitByPitch') AS pit_hbp,
    public.stat_int(l.stats, 'battersFaced') AS pit_bf,
    coalesce(public.stat_int(l.stats, 'numberOfPitches'), public.stat_int(l.stats, 'pitchesThrown')) AS pit_pitches,
    public.stat_int(l.stats, 'wins') AS pit_w, public.stat_int(l.stats, 'losses') AS pit_l,
    public.stat_int(l.stats, 'saves') AS pit_sv, public.stat_int(l.stats, 'holds') AS pit_hld,
    public.stat_int(l.stats, 'blownSaves') AS pit_bs, public.stat_int(l.stats, 'gamesStarted') AS pit_gs,
    public.stat_int(l.stats, 'completeGames') AS pit_cg, public.stat_int(l.stats, 'shutouts') AS pit_sho
) p ON l.stat_type = 'pitching'
WHERE l.source = 'mlb_api' AND l.stat_type IN ('batting', 'pitching');

UPDATE public.stat_lines SET source_level = CASE source_level
    WHEN 'AAA' THEN 'TRIPLE-A' WHEN 'AA' THEN 'DOUBLE-A' WHEN 'A+' THEN 'HIGH-A'
    WHEN 'A' THEN 'SINGLE-A' WHEN 'ROK' THEN 'ROOKIE' END
 WHERE source_level IN ('AAA', 'AA', 'A+', 'A', 'ROK', 'IND', 'WIN');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.stat_lines'::regclass AND conname = 'stat_lines_source_level_check') THEN
    ALTER TABLE public.stat_lines ADD CONSTRAINT stat_lines_source_level_check CHECK (source_level IN (
      'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
      'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL'));
  END IF;
END $$;

COMMIT;
