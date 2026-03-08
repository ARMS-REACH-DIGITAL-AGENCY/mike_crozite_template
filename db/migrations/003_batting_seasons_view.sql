-- Migration 003: Create batting seasons view
-- Joins tbc_batting_raw to the teams lookup table so that callers get a
-- human-readable team_display value and a per-season team_level abbreviation
-- (e.g. JUCO, NCAA-D1, Rookie, A, A+, AA, AAA, MLB) instead of a raw numeric
-- teamid or the player-level highlevel field.
--
-- Mirrors the pattern of public.vw_player_pitching_seasons.
-- Falls back to teamid::text when no matching row exists in public.teams.

CREATE OR REPLACE VIEW public.vw_player_batting_seasons AS
SELECT
  b.playerid,
  b.year,
  b.teamid,
  COALESCE(t.team_name, b.teamid::text) AS team_display,
  t.team_level,
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
LEFT JOIN public.teams t ON b.teamid::text = t.team_id;
