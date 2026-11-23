-- The Digest's next-game date is saved in the card's own wording
-- ("Friday | April 2, 2027"), so the column holds text, not a date. The card
-- stores next_game_date as text in two formats; it is formatted once by
-- src/lib/nextGameLine.ts (the card's function). The column has no data yet.
ALTER TABLE public.daily_stat_lines ALTER COLUMN next_game_date TYPE text USING next_game_date::text;
