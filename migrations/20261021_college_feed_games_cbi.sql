-- NCAA-D1 schedules from College Baseball Insider's team posts (source 'cbi'),
-- added to /api/cron/college-feed-schedules beside the league feeds.
--
-- local_time: the posts print a time ("6:30 pm", local to the park) but no
-- time zone, so those games keep the time as printed and starts_at stays NULL.
--
-- listed: false once a game no longer appears in its source (moved or
-- dropped). Each nightly load sets it true on every game it sees, then false
-- on that source's games it didn't see. A game that comes back is listed again.

ALTER TABLE public.college_feed_games ADD COLUMN IF NOT EXISTS local_time text;
ALTER TABLE public.college_feed_games ADD COLUMN IF NOT EXISTS listed boolean NOT NULL DEFAULT true;

-- full_schedule (college_feed_teams): false for a CBI team that has no post of
-- its own yet, whose games there are only the ones against teams that do.
-- The Game Log shows a team's feed games only when it's true, so nobody sees
-- a schedule with holes in it. League feeds list every member's games: true.
ALTER TABLE public.college_feed_teams ADD COLUMN IF NOT EXISTS full_schedule boolean NOT NULL DEFAULT true;
