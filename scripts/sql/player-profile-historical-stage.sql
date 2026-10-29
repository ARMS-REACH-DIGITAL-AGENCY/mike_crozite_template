-- Run after a historical TBC archive import; never on a fan request.
CREATE TABLE IF NOT EXISTS public.player_profile_historical_stats_stage (
 playerid text PRIMARY KEY,
 batting_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
 pitching_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
 batting_prepared_at timestamptz,
 pitching_prepared_at timestamptz
);
INSERT INTO public.player_profile_historical_stats_stage(playerid,batting_rows,batting_prepared_at)
SELECT b.playerid::text,jsonb_agg(to_jsonb(b) ORDER BY b.year,b.teamid),now()
FROM public.tbc_batting_raw b
WHERE b.playerid IS NOT NULL AND (b.year::text !~ '^\\d{4}$' OR b.year::text::int < 2026)
GROUP BY b.playerid::text
ON CONFLICT(playerid) DO UPDATE SET batting_rows=excluded.batting_rows,batting_prepared_at=now();
INSERT INTO public.player_profile_historical_stats_stage(playerid,pitching_rows,pitching_prepared_at)
SELECT p.playerid::text,jsonb_agg(to_jsonb(p) ORDER BY p.year,p.teamid),now()
FROM public.tbc_pitching_raw p
WHERE p.playerid IS NOT NULL AND (p.year::text !~ '^\\d{4}$' OR p.year::text::int < 2026)
GROUP BY p.playerid::text
ON CONFLICT(playerid) DO UPDATE SET pitching_rows=excluded.pitching_rows,pitching_prepared_at=now();
