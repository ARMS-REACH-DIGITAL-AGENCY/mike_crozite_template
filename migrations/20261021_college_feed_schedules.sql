-- College baseball schedules from the governing bodies' league-wide calendar
-- feeds (NAIA, CCCAA, NWAC on PrestoSports), loaded nightly by
-- /api/cron/college-feed-schedules.
--
-- college_feed_games: every game a league feed lists, keyed by the feed's own
-- stable UID. Teams are the feed's names, as published.
--
-- college_feed_teams: each feed name seen, and which of our teamids it is.
-- teamid stays NULL until Pete approves the match (CLAUDE.md: never guess a
-- team, no fuzzy name matching). The nightly job only adds names; it never
-- sets teamid. Separate from teamid_universe_mapping, which stays Pete's own.

CREATE TABLE IF NOT EXISTS public.college_feed_games (
  source           text        NOT NULL,          -- 'naia' | 'cccaa' | 'nwac'
  season           text        NOT NULL,          -- e.g. '2026-27'
  uid              text        NOT NULL,          -- the feed's game id
  starts_at        timestamptz,                   -- NULL when the feed lists a date only
  game_date        date        NOT NULL,          -- local to the league
  time_tba         boolean     NOT NULL DEFAULT false,
  away_name        text        NOT NULL,
  home_name        text        NOT NULL,
  neutral          boolean     NOT NULL DEFAULT false,
  location         text,
  result           text,                          -- e.g. 'Final, 3-5'
  notes            text,                          -- e.g. 'Fall Non-Traditional Season'
  cancelled        boolean     NOT NULL DEFAULT false,
  feed_modified_at timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, uid)
);
CREATE INDEX IF NOT EXISTS college_feed_games_date_idx ON public.college_feed_games (game_date);
CREATE INDEX IF NOT EXISTS college_feed_games_away_idx ON public.college_feed_games (source, away_name);
CREATE INDEX IF NOT EXISTS college_feed_games_home_idx ON public.college_feed_games (source, home_name);

CREATE TABLE IF NOT EXISTS public.college_feed_teams (
  source        text        NOT NULL,
  feed_name     text        NOT NULL,
  teamid        text,                             -- set only once Pete approves
  approved_at   timestamptz,
  note          text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, feed_name)
);

GRANT SELECT, INSERT, UPDATE ON public.college_feed_games TO authenticated, authenticator;
GRANT SELECT, INSERT, UPDATE ON public.college_feed_teams TO authenticated, authenticator;
