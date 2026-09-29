-- migrations/20260929_player_team_stints_and_draft_picks.sql
-- Two new tables (approved 2026-09-29). Column names follow our existing
-- ones (playerid, teamid) - no look-alikes.
--
-- player_team_stints: which team a player was on, from when to when, one
--   row per stint. Written by scripts/build-player-team-stints.ts; read by
--   the Game Log tab (every game his team played during each stint), and
--   meant as the one shared answer to "which team was he on that day".
--   teamid is our (TBC) team id; stint_end NULL = still on that team.
--   start_source: 'transaction', 'first_game', 'season_start' (his first team's
--   first game, when no move is on record), 'college_season' or 'roster'.
--
-- player_draft_picks: every time a player was drafted. Written by
--   scripts/import-player-draft-picks.ts from the MLB Stats API (source
--   'mlb_api', preferred) and The Baseball Cube's draft_info (source 'tbc',
--   for players MLB has no draft record for). Read by the Career Path
--   Timeline's draft milestone.

BEGIN;

CREATE TABLE IF NOT EXISTS public.player_team_stints (
  playerid     text        NOT NULL,
  teamid       text        NOT NULL,
  team_name    text,
  level        text,
  season       integer     NOT NULL,
  stint_start  date        NOT NULL,
  stint_end    date,
  start_source text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playerid, season, stint_start, teamid)
);
CREATE INDEX IF NOT EXISTS player_team_stints_teamid_idx ON public.player_team_stints (teamid, season);

CREATE TABLE IF NOT EXISTS public.player_draft_picks (
  playerid           text        NOT NULL,
  draft_year         integer     NOT NULL,
  draft_round        text,
  draft_round_pick   integer,
  draft_overall_pick integer,
  draft_team_name    text,
  drafted_from       text,
  signing_bonus      numeric,
  source             text        NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playerid, draft_year)
);

COMMIT;
