-- migrations/20260929_team_schedules_game_type.sql
-- team_schedules.game_type: MLB's gameType for each game (approved
-- 2026-09-29; applied in production after a rehearsal on a Neon branch).
--   R regular season; F wild card, D division, L league championship,
--   W World Series / MiLB finals, C Triple-A championship, P playoffs;
--   S spring training, E exhibition, I intrasquad (not real games - the Game
--   Log and team stints leave them out); A All-Star.
-- Filled by scripts/sync_mlb_schedules.py. NULL until the sync has seen the
-- game; readers treat NULL as a real game. Additive only: season stats come
-- from the TBC tables, not from team_schedules, and the views on this table
-- (v_team_schedule_feed, player_next_game, v_player_upcoming_games) name
-- their columns, so none of them change.

ALTER TABLE public.team_schedules ADD COLUMN IF NOT EXISTS game_type text;
