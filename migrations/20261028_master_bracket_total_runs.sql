-- The season is two tournaments in one (Pete, Oct 28): 15,368 games.
--
--   - Every one of the 1,024 schools plays every week, Weeks 1-30: 512 games
--     a week, 15,360 in all. A school knocked out of the bracket keeps
--     playing.
--   - The National Bracket (stage 'bracket'): Rounds 1-7 inside the eight
--     regions (3,048 games), then Rounds 8-10, where the 8 regional bracket
--     winners play each other all nine weeks, four 3-game series a round:
--     Round 8 series 1-4, Round 9 series 5-8, Round 10 series 9-12 (series 9
--     is the Bracket Championship). Games 1-3,084.
--   - The knocked-out schools' games (stage 'total_runs', new here): from
--     Round 2 on, the schools out of the bracket are paired for each round,
--     across regions, one opponent for the round's three weeks; in Rounds
--     8-10, all 1,016 schools out of the regional brackets. Games
--     3,085-15,360 (12,276). Publicly the pairings are "randomly selected";
--     the results job matches real-life teammates' high schools first and
--     draws the rest (never published, like the commissioner's rules).
--   - Total Runs: each school's runs over its 30 games, ranked against the
--     other 127 schools in its region (total_runs_standings, below). Each
--     region's leader plays Weeks 31-33 (stage 'season_championship', games
--     15,361-15,367); the winner plays the National Bracket winner in Week 34
--     (stage 'world_series', game 15,368).
--
-- The results job (scripts/master-bracket-results.ts) fills every slot from
-- the stored results; nothing is entered by hand. The slots themselves come
-- from scripts/master-bracket-seed.cjs.

-- Pete's series numbers for Rounds 9 and 10 (Oct 28). The 2027 rows seeded
-- on Oct 27 numbered them 1-2 and 1; the new seed adds series 7, 8 and
-- 10-12. Only empty slots; the game ids stay.
UPDATE public.master_bracket
   SET series_no = CASE round WHEN 9 THEN series_no + 4 ELSE 9 END
 WHERE season_key = '2027' AND stage = 'bracket' AND round IN (9, 10) AND series_no <= 2 AND status = 'tbd';

ALTER TABLE public.master_bracket DROP CONSTRAINT IF EXISTS master_bracket_stage_check;
ALTER TABLE public.master_bracket ADD CONSTRAINT master_bracket_stage_check
  CHECK (stage IN ('bracket', 'total_runs', 'season_championship', 'world_series'));
COMMENT ON COLUMN public.master_bracket.region IS
  'test: the bracket (1-6); 2027: region 1-8 for bracket Rounds 1-7, 0 for the national rounds, the knocked-out schools'' games (any two regions) and Weeks 31-34';

-- Each series: who leads, who won (2 wins decide it). A knocked-out pair's
-- three games count the same way; the Weeks 31-34 games are single games.
CREATE OR REPLACE VIEW public.master_bracket_series AS
SELECT season_key, stage, region, round, round_name, series_no,
       min(home_hsid) AS home_hsid, min(away_hsid) AS away_hsid,
       min(home_seed) AS home_seed, min(away_seed) AS away_seed,
       min(home_school_name) AS home_school_name, min(away_school_name) AS away_school_name,
       count(*) FILTER (WHERE status = 'final' AND winner_hsid = home_hsid) AS home_wins,
       count(*) FILTER (WHERE status = 'final' AND winner_hsid = away_hsid) AS away_wins,
       sum(home_runs) FILTER (WHERE status = 'final') AS home_runs,
       sum(away_runs) FILTER (WHERE status = 'final') AS away_runs,
       CASE WHEN stage NOT IN ('bracket', 'total_runs') THEN min(winner_hsid) FILTER (WHERE status = 'final')
            WHEN count(*) FILTER (WHERE status = 'final' AND winner_hsid = home_hsid) >= 2 THEN min(home_hsid)
            WHEN count(*) FILTER (WHERE status = 'final' AND winner_hsid = away_hsid) >= 2 THEN min(away_hsid) END AS winner_hsid,
       min(week) AS first_week, max(week) AS last_week,
       min(game_start_date) AS starts, max(game_end_date) AS ends
  FROM public.master_bracket
 GROUP BY season_key, stage, region, round, round_name, series_no;

-- Total Runs: every school's final games of the 30 weeks (bracket and
-- knocked-out games alike), ranked inside its region (its Round 1 region; a
-- test bracket is its own region). Most runs first; then run differential,
-- wins and seed. Weeks 31-34 don't count.
CREATE OR REPLACE VIEW public.total_runs_standings AS
WITH field AS (
  SELECT season_key, region, home_hsid AS hsid, home_seed AS seed, home_school_name AS school_name
    FROM public.master_bracket WHERE stage = 'bracket' AND round = 1 AND game_no = 1
  UNION ALL
  SELECT season_key, region, away_hsid, away_seed, away_school_name
    FROM public.master_bracket WHERE stage = 'bracket' AND round = 1 AND game_no = 1
), sides AS (
  SELECT season_key, home_hsid AS hsid, home_runs AS rf, away_runs AS ra, winner_hsid = home_hsid AS won
    FROM public.master_bracket WHERE stage IN ('bracket', 'total_runs') AND status = 'final'
  UNION ALL
  SELECT season_key, away_hsid, away_runs, home_runs, winner_hsid = away_hsid
    FROM public.master_bracket WHERE stage IN ('bracket', 'total_runs') AND status = 'final'
), totals AS (
  SELECT f.season_key, f.region, f.hsid, f.seed, f.school_name,
         count(s.hsid)::int AS games,
         count(*) FILTER (WHERE s.won)::int AS wins,
         count(*) FILTER (WHERE s.hsid IS NOT NULL AND NOT s.won)::int AS losses,
         coalesce(sum(s.rf), 0)::int AS runs_for,
         coalesce(sum(s.ra), 0)::int AS runs_against
    FROM field f
    LEFT JOIN sides s ON s.season_key = f.season_key AND s.hsid = f.hsid
   WHERE f.hsid IS NOT NULL
   GROUP BY f.season_key, f.region, f.hsid, f.seed, f.school_name
)
SELECT season_key, region, hsid, seed, school_name, games, wins, losses, runs_for, runs_against,
       runs_for - runs_against AS run_diff,
       rank() OVER (PARTITION BY season_key, region
                    ORDER BY runs_for DESC, runs_for - runs_against DESC, wins DESC, seed) AS region_rank
  FROM totals;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator', 'yatstats_tribune_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON public.master_bracket_series, public.total_runs_standings TO %I', r);
    END IF;
  END LOOP;
END $$;

UPDATE public.fantasy_seasons
   SET notes = 'The 1,024-school field and seeds of public/bracket-lab/2026/index.json. Weeks 1-30: every school plays every week (15,360 games) - the National Bracket (10 rounds of 3: Rounds 1-7 in the regions, Rounds 8-10 the 8 regional winners, four series a round; games 1-3,084) and the knocked-out schools'' games (games 3,085-15,360). Weeks 31-33: the 8 regional Total Runs leaders (games 15,361-15,367). Week 34: the Fantasy World Series (game 15,368).',
       updated_at = now()
 WHERE season_key = '2027';
