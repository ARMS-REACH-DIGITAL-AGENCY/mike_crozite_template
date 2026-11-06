-- Build each index in its own statement, outside a transaction.
-- Required before the complete-history teammates endpoint is promoted.
-- The player/year indexes already exist; these support lookup of every
-- player sharing a specific team and season without scanning ~939K rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbc_complete_batting_team_year_player
  ON public.tbc_complete_batting_history (teamid, year, playerid);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbc_complete_pitching_team_year_player
  ON public.tbc_complete_pitching_history (teamid, year, playerid);
