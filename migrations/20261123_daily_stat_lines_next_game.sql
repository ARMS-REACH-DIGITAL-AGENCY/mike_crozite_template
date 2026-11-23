-- Daily Digest "Next Game" line (Pete, Nov 23 2026): the same next game the
-- player's flip card shows (flip_card_front_stage.next_game_*, kept current by
-- the live schedule refresh), copied onto each saved Digest stat line when the
-- edition is published, so a published edition never changes.
-- next_game_home_away holds the card's own marker ('vs.' or '@').
-- TEST COPY FIRST, then live only with Pete's approval.
ALTER TABLE public.daily_stat_lines
  ADD COLUMN IF NOT EXISTS next_game_date      date,
  ADD COLUMN IF NOT EXISTS next_game_home_away text,
  ADD COLUMN IF NOT EXISTS next_game_opponent  text;
