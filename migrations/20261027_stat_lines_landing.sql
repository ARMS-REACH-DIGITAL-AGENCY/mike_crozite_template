-- stat_lines: the landing table. Every player's stat line from every game,
-- from every source, in one standard shape - one row per player, game and
-- stat type (batting / pitching). The bracket, the school pages and the
-- newsletters read stats from here.
--
-- Today one source fills it: the MLB feed (player_game_logs, the 10-minute
-- live feed plus the 4-hourly game-log sync; Arizona Fall League and winter
-- leagues included). Triggers copy each line in as the feed writes it, so the
-- table is always current with no job to run. Later sources (Presto, The
-- Baseball Cube, Sidearm, iScore) write here too, each with its own source.
--
-- No guessing. A line's team is looked up (MLB team id -> team_id_map ->
-- teamid) and its level is that team's level in teamid_universe_mapping, one
-- of Pete's official levels. When either can't be found for certain the
-- line still lands, with hold_reason saying why, and nothing scores it until
-- Pete decides. stat_lines_ready is every line with no hold; stat_line_holds
-- is the needs-decision list, one row per reason and team.

CREATE TABLE IF NOT EXISTS public.stat_lines (
  id bigserial PRIMARY KEY,
  source text NOT NULL,              -- 'mlb_api' today
  source_line_id text NOT NULL,      -- the source's row (player_game_logs.id)
  source_game_id text NOT NULL,      -- MLB gamePk
  source_player_id text,             -- the source's own player number (MLB person id)
  source_team_id text,               -- MLB team id
  playerid text NOT NULL,            -- our player id
  stat_type text NOT NULL CHECK (stat_type IN ('batting', 'pitching')),
  game_date date NOT NULL,           -- the game's date where it was played
  game_type text,                    -- MLB: R regular season, F/D/L/W postseason rounds, S spring
  league_name text,                  -- "Arizona Fall League", "Pacific Coast League" ...
  team_name text,
  opponent_name text,
  home_away text,
  teamid text,                       -- our team (teamid_universe_mapping)
  level text CHECK (level IN (
    'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
    'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL')),
  source_level text CHECK (source_level IN (   -- MLB's level for the game, in the official names; NULL for WIN and IND
    'MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
    'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL')),
  game_status text,                  -- the schedule's status when it has the game, else the line's
  is_final boolean NOT NULL DEFAULT false,
  team_won boolean,                  -- the player's team won (final games only)
  started boolean,
  -- Batting (stat_type 'batting')
  bat_pa smallint, bat_ab smallint, bat_r smallint, bat_h smallint, bat_2b smallint, bat_3b smallint,
  bat_hr smallint, bat_rbi smallint, bat_bb smallint, bat_ibb smallint, bat_hbp smallint, bat_so smallint,
  bat_sb smallint, bat_cs smallint, bat_sf smallint, bat_sh smallint, bat_gidp smallint, bat_tb smallint,
  -- Pitching (stat_type 'pitching'); pit_outs = innings pitched x 3 (6.2 IP = 20)
  pit_outs smallint, pit_h smallint, pit_r smallint, pit_er smallint, pit_bb smallint, pit_ibb smallint,
  pit_so smallint, pit_hr smallint, pit_hbp smallint, pit_bf smallint, pit_pitches smallint,
  pit_w smallint, pit_l smallint, pit_sv smallint, pit_hld smallint, pit_bs smallint,
  pit_gs smallint, pit_cg smallint, pit_sho smallint,
  stats jsonb NOT NULL,              -- the source's full line, as sent
  hold_reason text,                  -- why the line can't be scored yet; NULL = ready
  removed_at timestamptz,            -- the source deleted the line (kept for history)
  loaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_line_id),
  -- A line without a team and an official level is always held, with a reason.
  CHECK (hold_reason IS NOT NULL OR (teamid IS NOT NULL AND level IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS stat_lines_player_date_idx ON public.stat_lines (playerid, game_date);
CREATE INDEX IF NOT EXISTS stat_lines_date_idx ON public.stat_lines (game_date);
CREATE INDEX IF NOT EXISTS stat_lines_game_idx ON public.stat_lines (source, source_game_id);
CREATE INDEX IF NOT EXISTS stat_lines_held_idx ON public.stat_lines (hold_reason) WHERE hold_reason IS NOT NULL;

-- A whole-number stat from a source line; NULL when the source didn't send it.
CREATE OR REPLACE FUNCTION public.stat_int(j jsonb, k text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN (j ->> k) ~ '^-?\d+(\.\d+)?$' THEN round((j ->> k)::numeric)::integer END
$$;

-- Outs from innings pitched: "6.2" = 20.
CREATE OR REPLACE FUNCTION public.ip_to_outs(ip text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN ip ~ '^\d+(\.[0-2])?$'
    THEN split_part(ip, '.', 1)::integer * 3 + coalesce(nullif(split_part(ip, '.', 2), '')::integer, 0) END
$$;

-- The MLB feed's lines in the landing shape. The one place the conversion is
-- written: the backfill and both triggers read it.
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

-- Land MLB feed lines (by player_game_logs.id; NULL = every line). Returns
-- how many were written. Values the 10-minute feed doesn't send (the game
-- type, league, MLB level, MLB person id) keep what the 4-hourly sync gave.
CREATE OR REPLACE FUNCTION public.stat_lines_land_mlb(p_ids bigint[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  n integer;
BEGIN
  -- Planned fresh each call, so a few lines are looked up by id, not scanned.
  EXECUTE format($sql$
  INSERT INTO public.stat_lines AS t (
    source, source_line_id, source_game_id, source_player_id, source_team_id, playerid, stat_type, game_date,
    game_type, league_name, team_name, opponent_name, home_away, teamid, level, source_level, game_status,
    is_final, team_won, started,
    bat_pa, bat_ab, bat_r, bat_h, bat_2b, bat_3b, bat_hr, bat_rbi, bat_bb, bat_ibb, bat_hbp, bat_so,
    bat_sb, bat_cs, bat_sf, bat_sh, bat_gidp, bat_tb,
    pit_outs, pit_h, pit_r, pit_er, pit_bb, pit_ibb, pit_so, pit_hr, pit_hbp, pit_bf, pit_pitches,
    pit_w, pit_l, pit_sv, pit_hld, pit_bs, pit_gs, pit_cg, pit_sho,
    stats, hold_reason, removed_at, updated_at
  )
  SELECT
    source, source_line_id, source_game_id, source_player_id, source_team_id, playerid, stat_type, game_date,
    game_type, league_name, team_name, opponent_name, home_away, teamid, level, source_level, game_status,
    is_final, team_won, started,
    bat_pa, bat_ab, bat_r, bat_h, bat_2b, bat_3b, bat_hr, bat_rbi, bat_bb, bat_ibb, bat_hbp, bat_so,
    bat_sb, bat_cs, bat_sf, bat_sh, bat_gidp, bat_tb,
    pit_outs, pit_h, pit_r, pit_er, pit_bb, pit_ibb, pit_so, pit_hr, pit_hbp, pit_bf, pit_pitches,
    pit_w, pit_l, pit_sv, pit_hld, pit_bs, pit_gs, pit_cg, pit_sho,
    stats, hold_reason, NULL, now()
  FROM public.v_stat_lines_from_mlb v
  %s
  ON CONFLICT (source, source_line_id) DO UPDATE SET
    source_game_id = EXCLUDED.source_game_id,
    source_player_id = coalesce(EXCLUDED.source_player_id, t.source_player_id),
    source_team_id = EXCLUDED.source_team_id,
    playerid = EXCLUDED.playerid,
    stat_type = EXCLUDED.stat_type,
    game_date = EXCLUDED.game_date,
    game_type = coalesce(EXCLUDED.game_type, t.game_type),
    league_name = coalesce(EXCLUDED.league_name, t.league_name),
    team_name = EXCLUDED.team_name,
    opponent_name = EXCLUDED.opponent_name,
    home_away = EXCLUDED.home_away,
    teamid = EXCLUDED.teamid,
    level = EXCLUDED.level,
    source_level = coalesce(EXCLUDED.source_level, t.source_level),
    game_status = EXCLUDED.game_status,
    is_final = EXCLUDED.is_final,
    team_won = coalesce(EXCLUDED.team_won, CASE WHEN EXCLUDED.is_final THEN t.team_won END),
    started = EXCLUDED.started,
    bat_pa = EXCLUDED.bat_pa, bat_ab = EXCLUDED.bat_ab, bat_r = EXCLUDED.bat_r, bat_h = EXCLUDED.bat_h,
    bat_2b = EXCLUDED.bat_2b, bat_3b = EXCLUDED.bat_3b, bat_hr = EXCLUDED.bat_hr, bat_rbi = EXCLUDED.bat_rbi,
    bat_bb = EXCLUDED.bat_bb, bat_ibb = EXCLUDED.bat_ibb, bat_hbp = EXCLUDED.bat_hbp, bat_so = EXCLUDED.bat_so,
    bat_sb = EXCLUDED.bat_sb, bat_cs = EXCLUDED.bat_cs, bat_sf = EXCLUDED.bat_sf, bat_sh = EXCLUDED.bat_sh,
    bat_gidp = EXCLUDED.bat_gidp, bat_tb = EXCLUDED.bat_tb,
    pit_outs = EXCLUDED.pit_outs, pit_h = EXCLUDED.pit_h, pit_r = EXCLUDED.pit_r, pit_er = EXCLUDED.pit_er,
    pit_bb = EXCLUDED.pit_bb, pit_ibb = EXCLUDED.pit_ibb, pit_so = EXCLUDED.pit_so, pit_hr = EXCLUDED.pit_hr,
    pit_hbp = EXCLUDED.pit_hbp, pit_bf = EXCLUDED.pit_bf, pit_pitches = EXCLUDED.pit_pitches,
    pit_w = EXCLUDED.pit_w, pit_l = EXCLUDED.pit_l, pit_sv = EXCLUDED.pit_sv, pit_hld = EXCLUDED.pit_hld,
    pit_bs = EXCLUDED.pit_bs, pit_gs = EXCLUDED.pit_gs, pit_cg = EXCLUDED.pit_cg, pit_sho = EXCLUDED.pit_sho,
    stats = EXCLUDED.stats,
    hold_reason = EXCLUDED.hold_reason,
    removed_at = NULL,
    updated_at = now()
  $sql$, CASE WHEN p_ids IS NULL THEN '' ELSE 'WHERE v.source_row_id = ANY ($1)' END)
  USING p_ids;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;

-- Lines the landing couldn't take (an error, never a guess), for review.
CREATE TABLE IF NOT EXISTS public.stat_line_load_errors (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  source_line_id text,
  error text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- The feed writes a line -> it lands. A landing error is logged and never
-- blocks the feed's own write.
CREATE OR REPLACE FUNCTION public.stat_lines_on_game_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.stat_lines
       SET removed_at = now(), hold_reason = 'Removed by the source (deleted from player_game_logs)', updated_at = now()
     WHERE source = 'mlb_api' AND source_line_id = OLD.id::text AND removed_at IS NULL;
    RETURN OLD;
  END IF;
  IF NEW.source = 'mlb_api' AND NEW.stat_type IN ('batting', 'pitching') THEN
    BEGIN
      PERFORM public.stat_lines_land_mlb(ARRAY[NEW.id]);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.stat_line_load_errors (source, source_line_id, error) VALUES ('mlb_api', NEW.id::text, SQLERRM);
    END;
  END IF;
  RETURN NEW;
END $$;

-- The 4-hourly sync rewrites the whole season (~100k lines) with the same
-- values: a line lands again only when something in it changed.
DROP TRIGGER IF EXISTS stat_lines_land ON public.player_game_logs;
DROP TRIGGER IF EXISTS stat_lines_land_insert ON public.player_game_logs;
DROP TRIGGER IF EXISTS stat_lines_land_update ON public.player_game_logs;
DROP TRIGGER IF EXISTS stat_lines_land_delete ON public.player_game_logs;
CREATE TRIGGER stat_lines_land_insert AFTER INSERT ON public.player_game_logs
  FOR EACH ROW EXECUTE FUNCTION public.stat_lines_on_game_log();
CREATE TRIGGER stat_lines_land_update AFTER UPDATE ON public.player_game_logs
  FOR EACH ROW
  WHEN (OLD.stats IS DISTINCT FROM NEW.stats OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload
        OR OLD.game_status IS DISTINCT FROM NEW.game_status OR OLD.playerid IS DISTINCT FROM NEW.playerid
        OR OLD.source_team_id IS DISTINCT FROM NEW.source_team_id OR OLD.game_date IS DISTINCT FROM NEW.game_date
        OR OLD.team_name IS DISTINCT FROM NEW.team_name OR OLD.opponent_name IS DISTINCT FROM NEW.opponent_name
        OR OLD.home_away IS DISTINCT FROM NEW.home_away OR OLD.started IS DISTINCT FROM NEW.started
        OR OLD.source IS DISTINCT FROM NEW.source OR OLD.stat_type IS DISTINCT FROM NEW.stat_type)
  EXECUTE FUNCTION public.stat_lines_on_game_log();
CREATE TRIGGER stat_lines_land_delete AFTER DELETE ON public.player_game_logs
  FOR EACH ROW EXECUTE FUNCTION public.stat_lines_on_game_log();

-- A pro game goes final (or its score changes) on the schedule -> its lines
-- are landed again, so is_final and team_won follow the schedule.
CREATE OR REPLACE FUNCTION public.stat_lines_on_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.stat_lines_land_mlb(ARRAY(
      SELECT l.id FROM public.player_game_logs l
       WHERE l.id IN (SELECT source_line_id::bigint FROM public.stat_lines
                       WHERE source = 'mlb_api' AND source_game_id = NEW.game_pk::text)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.stat_line_load_errors (source, source_line_id, error)
    VALUES ('mlb_api', 'game ' || NEW.game_pk, SQLERRM);
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stat_lines_schedule ON public.team_schedules;
CREATE TRIGGER stat_lines_schedule
  AFTER UPDATE ON public.team_schedules
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.home_score IS DISTINCT FROM NEW.home_score
        OR OLD.away_score IS DISTINCT FROM NEW.away_score)
  EXECUTE FUNCTION public.stat_lines_on_schedule();

-- Held lines are landed again after Pete adds a team or a level (the bracket
-- results job runs this every time, so a decision takes effect on its own).
CREATE OR REPLACE FUNCTION public.stat_lines_reland_held() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.stat_lines_land_mlb(ARRAY(
    SELECT source_line_id::bigint FROM public.stat_lines
     WHERE source = 'mlb_api' AND hold_reason IS NOT NULL AND removed_at IS NULL))
$$;

-- Every line that can be scored: a team, an official level, not removed.
CREATE OR REPLACE VIEW public.stat_lines_ready AS
SELECT * FROM public.stat_lines WHERE hold_reason IS NULL AND removed_at IS NULL;

-- The needs-decision list: what is held, why, and how much it holds.
CREATE OR REPLACE VIEW public.stat_line_holds AS
SELECT hold_reason, source, source_team_id, team_name, league_name, source_level,
       count(*) AS lines, count(DISTINCT playerid) AS players,
       min(game_date) AS first_game, max(game_date) AS last_game
  FROM public.stat_lines
 WHERE hold_reason IS NOT NULL AND removed_at IS NULL
 GROUP BY 1, 2, 3, 4, 5, 6;

-- Each school's alumni's lines (the player's school on his card). Scoring
-- uses only lines with no hold_reason; a held line is still a real line.
CREATE OR REPLACE VIEW public.v_school_stat_lines AS
SELECT f.hsid, f.display_name AS player_name, f.status_label AS player_status, s.*
  FROM public.stat_lines s
  JOIN public.flip_card_front_stage f ON f.playerid = s.playerid
 WHERE s.removed_at IS NULL;

-- Read access for the site and the newsletter.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator', 'yatstats_tribune_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON public.stat_lines, public.stat_lines_ready, public.stat_line_holds, public.v_school_stat_lines, public.stat_line_load_errors TO %I', r);
    END IF;
  END LOOP;
END $$;

-- Backfill: every line already in the feed.
SELECT public.stat_lines_land_mlb(NULL);
