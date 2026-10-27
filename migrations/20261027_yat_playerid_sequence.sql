-- The next YAT player id (Pete, Oct 2026): every player YAT?STATS adds itself
-- gets the next number in the series, YAT + 6 digits (YAT210001, YAT210002
-- ...), and keeps it for life - high school, college, pro. It replaces the
-- 18-character ids the contribution publisher used to make from a hash of
-- the submission (YAT816250826200263).
--
-- Starts after the highest YAT number in use (YAT210000 today); never goes
-- backwards when re-run.
CREATE SEQUENCE IF NOT EXISTS public.yat_playerid_seq;

SELECT setval('public.yat_playerid_seq', greatest(
  210000,
  (SELECT last_value FROM public.yat_playerid_seq),
  (SELECT coalesce(max(substr(playerid::text, 4)::bigint), 0) FROM public.flip_card_front_stage WHERE playerid::text ~ '^YAT\d{6,7}$'),
  (SELECT coalesce(max(substr(playerid::text, 4)::bigint), 0) FROM public.player_hsids WHERE playerid::text ~ '^YAT\d{6,7}$'),
  (SELECT coalesce(max(substr(published_playerid::text, 4)::bigint), 0) FROM public.missing_player_submission WHERE published_playerid::text ~ '^YAT\d{6,7}$')
), true);

-- The app (the contribution publisher) draws the numbers.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT USAGE, SELECT ON SEQUENCE public.yat_playerid_seq TO authenticator;
  END IF;
END $$;
