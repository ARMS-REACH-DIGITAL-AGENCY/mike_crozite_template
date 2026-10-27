-- Newsletter publication tables: the finished rows the Daily Digest, the
-- YAT-A-BOY Weekly Tribune and the bracket pages print. The pipeline writes
-- each row once; the newsletter only reads. The contract is
-- docs/newsletter-handoff-take-two.md, section 4.
--
-- Frozen once published: a period's rows go in with its edition_ready row in
-- one transaction, and publication_guard rejects any later UPDATE or DELETE
-- unless the transaction sets publication.unlock = 'on' and a
-- publication.reason (only on Pete's order). Every such change is kept in
-- publication_corrections, so an old edition can always be rebuilt.
--
-- user_scoreboard_schools is the one live table: the fan's own picks for
-- the Daily scoreboard, saved by the pick page.
--
-- An older public.daily_stat_lines (game_id, week, day, ab, h, ... ops, fip)
-- is left from an earlier design. It has no rows and no code reads it. It is
-- dropped here only while it is still empty; if it has rows, this migration
-- stops and changes nothing.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.daily_stat_lines') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'daily_stat_lines' AND column_name = 'game_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'daily_stat_lines' AND column_name = 'line') THEN
    IF EXISTS (SELECT 1 FROM public.daily_stat_lines) THEN
      RAISE EXCEPTION 'The old public.daily_stat_lines has rows; stopping so nothing is lost';
    END IF;
    DROP TABLE public.daily_stat_lines;
  END IF;
END $$;

-- The go signal: one row per finished edition period.
CREATE TABLE IF NOT EXISTS public.edition_ready (
  cadence      text        NOT NULL CHECK (cadence IN ('daily','weekly')),
  period_start date        NOT NULL,  -- daily: the stats day; weekly: the Monday
  period_end   date        NOT NULL,  -- daily: same day; weekly: the Sunday
  season_key   text        REFERENCES public.fantasy_seasons(season_key),  -- NULL when no fantasy season is live
  week         smallint,                                                   -- season week; NULL outside a season
  cutoff_at    timestamptz NOT NULL,  -- the 4 a.m. Arizona cutoff the rows are frozen at
  ready_at     timestamptz NOT NULL DEFAULT now(),
  row_counts   jsonb       NOT NULL,  -- {"daily_stat_lines": 812, ...}
  PRIMARY KEY (cadence, period_start),
  CHECK ((cadence = 'daily'  AND period_end = period_start)
      OR (cadence = 'weekly' AND period_end = period_start + 6 AND extract(isodow FROM period_start) = 1))
);

-- One finished line per player, game and stat type, every player with a
-- line that day.
CREATE TABLE IF NOT EXISTS public.daily_stat_lines (
  stats_date     date    NOT NULL,  -- the game's official date
  stat_line_id   bigint  NOT NULL,  -- the pipeline's id for the line
  playerid       text    NOT NULL,
  player_name    text    NOT NULL,
  hsid           integer,           -- the player's high school, when known
  team_name      text    NOT NULL,  -- "Tampa Bay Rays"
  team_short     text    NOT NULL,  -- "Rays"
  level          text    NOT NULL,  -- official level
  opponent_name  text    NOT NULL,  -- "Milwaukee Brewers"
  opponent_short text    NOT NULL,  -- "Brewers"
  stat_type      text    NOT NULL CHECK (stat_type IN ('batting','pitching')),
  line           text    NOT NULL,  -- "Jake Smith (Rays, MLB) vs. Brewers: 2-for-4, HR, 2 RBI, BB"
  sort_key       text    NOT NULL,
  PRIMARY KEY (stats_date, stat_line_id)
);
CREATE INDEX IF NOT EXISTS daily_stat_lines_player_idx ON public.daily_stat_lines (stats_date, playerid);

-- One story per school per day, told from that school's side.
CREATE TABLE IF NOT EXISTS public.daily_game_stories (
  stats_date     date     NOT NULL,
  hsid           integer  NOT NULL,
  season_key     text     NOT NULL REFERENCES public.fantasy_seasons(season_key),
  week           smallint NOT NULL,
  region         smallint NOT NULL,
  game_id        integer  NOT NULL,  -- (season_key, region, game_id) = the master_bracket game
  opponent_hsid  integer  NOT NULL,
  school_name    text     NOT NULL,
  opponent_name  text     NOT NULL,
  series_note    text,
  through_inning smallint NOT NULL,  -- 1-7 during the week; 9 or more when final
  is_final       boolean  NOT NULL,
  school_runs    smallint NOT NULL,
  opponent_runs  smallint NOT NULL,
  title          text     NOT NULL,
  story          text     NOT NULL,
  shout_outs     jsonb    NOT NULL DEFAULT '[]',  -- [{"playerid","name","line"}]
  PRIMARY KEY (stats_date, hsid)
);

-- Every game's score, every day, for the scoreboard.
CREATE TABLE IF NOT EXISTS public.daily_game_scores (
  stats_date     date     NOT NULL,
  season_key     text     NOT NULL REFERENCES public.fantasy_seasons(season_key),
  region         smallint NOT NULL,
  game_id        integer  NOT NULL,
  week           smallint NOT NULL,
  home_hsid      integer  NOT NULL,
  away_hsid      integer  NOT NULL,
  home_label     text     NOT NULL,  -- "HAMILTON"
  away_label     text     NOT NULL,
  home_innings   text[]   NOT NULL,  -- one cell per inning so far
  away_innings   text[]   NOT NULL,
  home_runs      smallint NOT NULL,
  away_runs      smallint NOT NULL,
  through_inning smallint NOT NULL,
  is_final       boolean  NOT NULL,
  PRIMARY KEY (stats_date, season_key, region, game_id)
);
CREATE INDEX IF NOT EXISTS daily_game_scores_home_idx ON public.daily_game_scores (stats_date, home_hsid);
CREATE INDEX IF NOT EXISTS daily_game_scores_away_idx ON public.daily_game_scores (stats_date, away_hsid);

-- The fan's 11 scoreboard picks, saved by the pick page.
CREATE TABLE IF NOT EXISTS public.user_scoreboard_schools (
  firebase_uid text        NOT NULL,
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 11),
  hsid         integer     NOT NULL,
  label        text        NOT NULL,  -- short name for the board
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firebase_uid, position),
  UNIQUE (firebase_uid, hsid)
);

-- One box score per game (one game = one week).
CREATE TABLE IF NOT EXISTS public.weekly_box_scores (
  season_key      text     NOT NULL REFERENCES public.fantasy_seasons(season_key),
  region          smallint NOT NULL,
  game_id         integer  NOT NULL,
  week            smallint NOT NULL,
  period_start    date     NOT NULL,  -- Monday
  period_end      date     NOT NULL,  -- Sunday
  round_name      text     NOT NULL,
  game_no         smallint NOT NULL,
  home_hsid       integer  NOT NULL,
  away_hsid       integer  NOT NULL,
  home_name       text     NOT NULL,
  away_name       text     NOT NULL,
  home_runs       smallint NOT NULL,
  away_runs       smallint NOT NULL,
  winner_hsid     integer  NOT NULL,
  decision        text     NOT NULL,  -- "Final" or "Final (Commissioner's decision)"
  line_score      jsonb    NOT NULL,  -- {"columns":[...],"away":[...],"home":[...]}, all text
  home_batting    jsonb    NOT NULL,  -- {"columns":[...],"rows":[[...]],"totals":[...]}, all text
  away_batting    jsonb    NOT NULL,
  home_pitching   jsonb    NOT NULL,
  away_pitching   jsonb    NOT NULL,
  extra_base_hits jsonb    NOT NULL,  -- {"home":["2B: ..."],"away":[...]}
  PRIMARY KEY (season_key, region, game_id)
);
CREATE INDEX IF NOT EXISTS weekly_box_scores_week_idx ON public.weekly_box_scores (season_key, week, region);

-- The full roster: every rostered alumnus of every school, one line a week.
CREATE TABLE IF NOT EXISTS public.weekly_player_lines (
  period_start date     NOT NULL,  -- Monday
  hsid         integer  NOT NULL,
  playerid     text     NOT NULL,
  period_end   date     NOT NULL,  -- Sunday
  season_key   text     REFERENCES public.fantasy_seasons(season_key),  -- NULL outside a fantasy season
  week         smallint,
  player_name  text     NOT NULL,
  team_name    text     NOT NULL,
  team_short   text     NOT NULL,
  level        text     NOT NULL,
  games        smallint NOT NULL,  -- 0 = did not play
  line         text     NOT NULL,
  sort_key     text     NOT NULL,
  PRIMARY KEY (period_start, hsid, playerid)
);
CREATE INDEX IF NOT EXISTS weekly_player_lines_week_idx ON public.weekly_player_lines (season_key, week, hsid);

-- Every change to a published row, with the old and new values.
CREATE TABLE IF NOT EXISTS public.publication_corrections (
  id         bigserial   PRIMARY KEY,
  table_name text        NOT NULL,
  op         text        NOT NULL,
  old_row    jsonb       NOT NULL,
  new_row    jsonb,
  reason     text        NOT NULL,
  changed_by text        NOT NULL DEFAULT current_user,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.publication_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('publication.unlock', true), '') <> 'on'
     OR coalesce(current_setting('publication.reason', true), '') = '' THEN
    RAISE EXCEPTION '% rows are frozen once published (a change needs publication.unlock and publication.reason, on Pete''s order)', TG_TABLE_NAME;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION public.publication_log() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.publication_corrections (table_name, op, old_row, new_row, reason)
  VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) END,
          current_setting('publication.reason', true));
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edition_ready', 'daily_stat_lines', 'daily_game_stories', 'daily_game_scores', 'weekly_box_scores', 'weekly_player_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_guard', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.publication_guard()', t || '_guard', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_log', t);
    EXECUTE format('CREATE TRIGGER %I AFTER UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.publication_log()', t || '_log', t);
  END LOOP;
END $$;

-- Access. New tables in public pick up broad default grants (authenticated
-- has full DML on the staging tables that way), so every grant is reset here.
-- The newsletter (yatstats_tribune_app) reads only. The pipeline (run as
-- the app, like the results job) only adds rows. The pick page saves picks.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edition_ready', 'daily_stat_lines', 'daily_game_stories', 'daily_game_scores', 'weekly_box_scores', 'weekly_player_lines', 'user_scoreboard_schools', 'publication_corrections'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticator', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticator', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yatstats_tribune_app') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM yatstats_tribune_app', t);
      IF t <> 'publication_corrections' THEN
        EXECUTE format('GRANT SELECT ON public.%I TO yatstats_tribune_app', t);
      END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SEQUENCE public.publication_corrections_id_seq FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT INSERT ON public.edition_ready, public.daily_stat_lines, public.daily_game_stories,
      public.daily_game_scores, public.weekly_box_scores, public.weekly_player_lines TO authenticator;
    GRANT INSERT, UPDATE, DELETE ON public.user_scoreboard_schools TO authenticator;
  END IF;
END $$;

COMMIT;
