-- Daily Digest "Next Game" line (Pete, Nov 22 2026; his Oct 7 approved copy:
-- "Next Game | Wednesday, 10/14 vs PEO").
-- Saved with each finished stat line when the edition is published, from MLB's
-- schedule (team_schedules, matched on the MLB team id of the line), so the
-- edition never changes after it is published. NULL = no scheduled game known.
-- TEST COPY FIRST, then live only with Pete's approval.
ALTER TABLE public.daily_stat_lines
  ADD COLUMN IF NOT EXISTS next_game_date      date,
  ADD COLUMN IF NOT EXISTS next_game_home_away text CHECK (next_game_home_away IN ('home', 'away')),
  ADD COLUMN IF NOT EXISTS next_game_opponent  text;
