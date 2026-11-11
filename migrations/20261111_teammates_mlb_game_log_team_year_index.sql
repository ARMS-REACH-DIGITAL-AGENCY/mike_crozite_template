-- Teammate matching now reads MLB game logs by the shared MLB team and season.
-- This index prevents scanning the full game archive per player drawer.
-- Build concurrently, separately from a transaction, before deploying code.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_player_game_logs_team_date_player
  ON public.player_game_logs (source_team_id, game_date, playerid);
