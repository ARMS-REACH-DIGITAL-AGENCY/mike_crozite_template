-- master_bracket: the schedule and the results of every fantasy game, every
-- season, in one table. The school pages, the newsletters, the Round 2+
-- pairings and the Monday email read results from here instead of each
-- working them out on their own.
--
-- fantasy_seasons says which season is which: the October 2026 live test
-- (six brackets of 16, opening day Mon Oct 5, 2026) and 2027 (1,024 schools
-- in 8 regions, opening day Mon Feb 1, 2027). The date decides which one is
-- live (fantasy_active_season), so nothing changes in code on Feb 1.
--
-- The bracket results job (scripts/master-bracket-results.ts) scores each
-- game with the bracket engine - the same code the scoreboard runs - and
-- writes the innings, score, winner and box here. Finals are locked: once a
-- game is final nothing changes it without an explicit unlock and a reason,
-- and every change to a result is kept in master_bracket_history.
--
-- master_bracket_schedule_2026 and master_bracket_dbtable (the old January
-- 2026 tables, never read or written by the site) are left as they are.

CREATE TABLE IF NOT EXISTS public.fantasy_seasons (
  season_key text PRIMARY KEY,             -- 'test-2026', '2027'
  name text NOT NULL,
  is_test boolean NOT NULL,
  opening_day date NOT NULL CHECK (extract(isodow FROM opening_day) = 1),  -- a Monday
  last_day date NOT NULL,
  weeks smallint NOT NULL,
  regions smallint NOT NULL,               -- test: 6 brackets; 2027: 8 regions
  schools_per_region smallint NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_day >= opening_day)
);

CREATE TABLE IF NOT EXISTS public.master_bracket (
  id bigserial PRIMARY KEY,
  season_key text NOT NULL REFERENCES public.fantasy_seasons (season_key),
  stage text NOT NULL CHECK (stage IN ('bracket', 'season_championship', 'world_series')),
  region smallint NOT NULL,                -- test: the bracket (1-6); 2027: region 1-8, 0 = national rounds and tournaments
  round smallint NOT NULL,                 -- bracket 1-10; season championship 1-3 (quarterfinal, semifinal, final); world series 1
  round_name text NOT NULL,
  series_no smallint NOT NULL,             -- order in its stage, region and round: the winners of 2k-1 and 2k meet in series k next round
  game_no smallint NOT NULL,               -- 1-3 in a bracket series, 1 otherwise
  game_id integer NOT NULL,                -- the id the site uses for the game (box scores, comments, shares)
  week smallint NOT NULL,
  game_start_date date NOT NULL,           -- Monday
  game_end_date date NOT NULL,             -- Sunday; final at 4 a.m. Arizona the Monday after
  home_hsid integer,                       -- NULL until the round before is decided
  away_hsid integer,
  home_seed smallint,
  away_seed smallint,
  home_school_name text,
  away_school_name text,
  status text NOT NULL DEFAULT 'tbd'
    CHECK (status IN ('tbd', 'scheduled', 'in_progress', 'final', 'awaiting_commissioner')),
  innings smallint[],                      -- runs by inning, home then away: {h1,a1,h2,a2,...}; 9 innings plus any tiebreak innings
  home_runs smallint,
  away_runs smallint,
  winner_hsid integer,
  decided_by text,                         -- runs | players-N | cross | runDiff | fans | commissioner | commissioner-pending
  decided_note text,                       -- the scoreboard's words for it ("Tied after 9 · won on ...")
  box jsonb,                               -- the stat drawer: each side's players, lines and runs, by day and for the week
  computed_at timestamptz,                 -- the last time the results job scored it
  locked_at timestamptz,                   -- final and locked
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_key, stage, region, round, series_no, game_no),
  UNIQUE (season_key, region, game_id),
  CHECK (game_end_date = game_start_date + 6),
  CHECK (winner_hsid IS NULL OR winner_hsid IN (home_hsid, away_hsid)),
  CHECK (status IN ('tbd') OR (home_hsid IS NOT NULL AND away_hsid IS NOT NULL)),
  CHECK (status <> 'final' OR winner_hsid IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS master_bracket_week_idx ON public.master_bracket (season_key, week);
CREATE INDEX IF NOT EXISTS master_bracket_home_idx ON public.master_bracket (season_key, home_hsid);
CREATE INDEX IF NOT EXISTS master_bracket_away_idx ON public.master_bracket (season_key, away_hsid);

-- Every change to a game's matchup or result: old and new, when, by whom and
-- why. (The box is left out; it changes every run while a game is live.)
CREATE TABLE IF NOT EXISTS public.master_bracket_history (
  id bigserial PRIMARY KEY,
  master_bracket_id bigint NOT NULL,
  season_key text NOT NULL,
  region smallint NOT NULL,
  game_id integer NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user,
  reason text,
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX IF NOT EXISTS master_bracket_history_game_idx ON public.master_bracket_history (season_key, region, game_id);

CREATE OR REPLACE FUNCTION public.master_bracket_result(r public.master_bracket) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'home_hsid', r.home_hsid, 'away_hsid', r.away_hsid, 'home_seed', r.home_seed, 'away_seed', r.away_seed,
    'status', r.status, 'innings', r.innings, 'home_runs', r.home_runs, 'away_runs', r.away_runs,
    'winner_hsid', r.winner_hsid, 'decided_by', r.decided_by, 'locked_at', r.locked_at)
$$;

-- A locked final never changes quietly. To correct one on purpose:
--   SET LOCAL master_bracket.unlock = 'on';
--   SET LOCAL master_bracket.reason = 'Pete: ...';
-- in the same transaction as the UPDATE.
CREATE OR REPLACE FUNCTION public.master_bracket_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL
     AND (public.master_bracket_result(OLD) IS DISTINCT FROM public.master_bracket_result(NEW) OR OLD.box IS DISTINCT FROM NEW.box)
     AND coalesce(current_setting('master_bracket.unlock', true), '') <> 'on' THEN
    RAISE EXCEPTION 'master_bracket game % (season %, region %) is final and locked', OLD.game_id, OLD.season_key, OLD.region
      USING HINT = 'SET LOCAL master_bracket.unlock = ''on'' and master_bracket.reason in the same transaction to change it on purpose';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS master_bracket_guard ON public.master_bracket;
CREATE TRIGGER master_bracket_guard BEFORE UPDATE ON public.master_bracket
  FOR EACH ROW EXECUTE FUNCTION public.master_bracket_guard();

CREATE OR REPLACE FUNCTION public.master_bracket_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.master_bracket_history (master_bracket_id, season_key, region, game_id, reason, old_values, new_values)
    VALUES (OLD.id, OLD.season_key, OLD.region, OLD.game_id, current_setting('master_bracket.reason', true), public.master_bracket_result(OLD), NULL);
    RETURN OLD;
  END IF;
  IF public.master_bracket_result(OLD) IS DISTINCT FROM public.master_bracket_result(NEW) THEN
    INSERT INTO public.master_bracket_history (master_bracket_id, season_key, region, game_id, reason, old_values, new_values)
    VALUES (NEW.id, NEW.season_key, NEW.region, NEW.game_id, current_setting('master_bracket.reason', true),
            public.master_bracket_result(OLD), public.master_bracket_result(NEW));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS master_bracket_log ON public.master_bracket;
CREATE TRIGGER master_bracket_log AFTER UPDATE OR DELETE ON public.master_bracket
  FOR EACH ROW EXECUTE FUNCTION public.master_bracket_log();

-- The commissioner's rulings (games tied after every tiebreaker), out of the
-- code: a ruling recorded here is used by the next results run.
CREATE TABLE IF NOT EXISTS public.commissioner_rulings (
  id bigserial PRIMARY KEY,
  season_key text NOT NULL REFERENCES public.fantasy_seasons (season_key),
  region smallint NOT NULL,
  week smallint NOT NULL,
  home_hsid integer NOT NULL,
  away_hsid integer NOT NULL,
  winner_hsid integer NOT NULL,
  ruled_by text NOT NULL,
  ruled_on date NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_key, region, week, home_hsid, away_hsid),
  CHECK (winner_hsid IN (home_hsid, away_hsid))
);

-- Pete's needs-decision list: anything the results job can't settle without
-- a person (a tie waiting on the commissioner, a locked final the stats now
-- disagree with). One row per item; stat lines on hold are listed in
-- stat_line_holds.
CREATE TABLE IF NOT EXISTS public.needs_decision (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,                      -- commissioner_ruling | locked_final_changed | ...
  season_key text,
  ref text NOT NULL,                       -- what it's about, e.g. 'test-2026:3:4:25:265' (season:region:week:home:away)
  summary text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  UNIQUE (kind, ref)
);

-- The season live today (the bracket's day turns over at 4 a.m. Arizona).
CREATE OR REPLACE VIEW public.fantasy_active_season AS
SELECT s.*, ((now() AT TIME ZONE 'America/Phoenix') - interval '4 hours')::date AS bracket_day,
       (((now() AT TIME ZONE 'America/Phoenix') - interval '4 hours')::date - s.opening_day) / 7 + 1 AS current_week
  FROM public.fantasy_seasons s
 WHERE ((now() AT TIME ZONE 'America/Phoenix') - interval '4 hours')::date BETWEEN s.opening_day AND s.last_day;

-- Each series: who leads, who won (2 wins decide it).
CREATE OR REPLACE VIEW public.master_bracket_series AS
SELECT season_key, stage, region, round, round_name, series_no,
       min(home_hsid) AS home_hsid, min(away_hsid) AS away_hsid,
       min(home_seed) AS home_seed, min(away_seed) AS away_seed,
       min(home_school_name) AS home_school_name, min(away_school_name) AS away_school_name,
       count(*) FILTER (WHERE status = 'final' AND winner_hsid = home_hsid) AS home_wins,
       count(*) FILTER (WHERE status = 'final' AND winner_hsid = away_hsid) AS away_wins,
       sum(home_runs) FILTER (WHERE status = 'final') AS home_runs,
       sum(away_runs) FILTER (WHERE status = 'final') AS away_runs,
       CASE WHEN stage <> 'bracket' THEN min(winner_hsid) FILTER (WHERE status = 'final')
            WHEN count(*) FILTER (WHERE status = 'final' AND winner_hsid = home_hsid) >= 2 THEN min(home_hsid)
            WHEN count(*) FILTER (WHERE status = 'final' AND winner_hsid = away_hsid) >= 2 THEN min(away_hsid) END AS winner_hsid,
       min(week) AS first_week, max(week) AS last_week,
       min(game_start_date) AS starts, max(game_end_date) AS ends
  FROM public.master_bracket
 GROUP BY season_key, stage, region, round, round_name, series_no;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator', 'yatstats_tribune_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON public.fantasy_seasons, public.master_bracket, public.master_bracket_history, public.commissioner_rulings, public.needs_decision, public.fantasy_active_season, public.master_bracket_series TO %I', r);
    END IF;
  END LOOP;
  -- The results job (run as the app) writes results and the needs-decision list.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT UPDATE ON public.master_bracket TO authenticator;
    GRANT INSERT, UPDATE ON public.needs_decision TO authenticator;
    GRANT USAGE ON SEQUENCE public.needs_decision_id_seq TO authenticator;
    GRANT EXECUTE ON FUNCTION public.stat_lines_reland_held() TO authenticator;
  END IF;
END $$;

INSERT INTO public.fantasy_seasons (season_key, name, is_test, opening_day, last_day, weeks, regions, schools_per_region, notes) VALUES
  ('test-2026', 'October 2026 live test', true, '2026-10-05', '2026-12-27', 12, 6, 16,
   'Six test brackets of 16 (src/lib/bracket/testBrackets.ts on the test/bracket-* branches): Round 1 Oct 5-25, Round 2 Oct 26-Nov 15, Round 3 Nov 16-Dec 6, Round 4 Dec 7-27.'),
  ('2027', '2027 season', false, '2027-02-01', '2027-09-26', 34, 8, 128,
   'The 1,024-school field and seeds of public/bracket-lab/2026/index.json. Bracket weeks 1-30 (10 rounds of 3), Season Championship Tournament weeks 31-33, Fantasy World Series week 34.')
ON CONFLICT (season_key) DO NOTHING;
