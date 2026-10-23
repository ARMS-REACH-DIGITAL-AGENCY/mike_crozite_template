-- Independent schedules retain their source identities and raw payloads.
-- A verified season window excludes scoring-system training/test fixtures.
-- Source: https://atlanticleague.com/atlantic-league-announces-2026-schedule/
-- The August 2026 release of a 2027 Gastonia schedule predates the club's
-- September 30 withdrawal; it is intentionally not an enabled season here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.indy_iscore_schedule_seasons (
  source_system text NOT NULL DEFAULT 'iscore_central',
  league_code text NOT NULL,
  season_id text NOT NULL,
  league_id text NOT NULL,
  season_year integer NOT NULL,
  season_start date NOT NULL,
  season_end date NOT NULL,
  schedule_timezone text NOT NULL,
  game_type text NOT NULL DEFAULT 'R',
  source_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (source_system, league_code, season_id),
  CHECK (season_end >= season_start)
);

CREATE TABLE IF NOT EXISTS public.indy_iscore_team_source_map (
  source_system text NOT NULL DEFAULT 'iscore_central',
  league_code text NOT NULL,
  season_id text NOT NULL,
  source_team_id text NOT NULL,
  source_team_name text NOT NULL,
  teamid text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, league_code, season_id, source_team_id)
);

CREATE INDEX IF NOT EXISTS indy_iscore_team_source_map_teamid_idx
  ON public.indy_iscore_team_source_map (teamid, source_system, league_code, season_id);

ALTER TABLE public.indy_iscore_games_raw
  ADD COLUMN IF NOT EXISTS game_time_utc timestamptz,
  ADD COLUMN IF NOT EXISTS home_source_team_id text,
  ADD COLUMN IF NOT EXISTS away_source_team_id text,
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS game_type text,
  ADD COLUMN IF NOT EXISTS score_payload jsonb;

CREATE INDEX IF NOT EXISTS indy_iscore_games_raw_schedule_idx
  ON public.indy_iscore_games_raw (source_system, league_code, season_id, game_date);

INSERT INTO public.indy_iscore_schedule_seasons (
  source_system, league_code, season_id, league_id, season_year,
  season_start, season_end, schedule_timezone, game_type, source_url
) VALUES (
  'iscore_central', 'ALPB', '9843025b-3dd7-4b1b-8776-a6b53a3bdb7a',
  'df9fb9cc-0fdb-4b79-8a3c-ad5d7b415a56', 2026,
  '2026-04-21', '2026-09-13', 'America/New_York', 'R',
  'https://atlanticleague.com/atlantic-league-announces-2026-schedule/'
) ON CONFLICT (source_system, league_code, season_id) DO NOTHING;

CREATE OR REPLACE VIEW public.v_indy_team_schedule_feed AS
SELECT
  m.teamid AS tbc_teamid,
  m.source_team_name AS team_name,
  g.game_date,
  g.game_time_utc,
  g.status,
  g.venue_name,
  g.home_team_name,
  g.away_team_name,
  sides.home_away,
  CASE WHEN sides.home_away = 'Home' THEN g.away_team_name ELSE g.home_team_name END AS opponent,
  g.home_score,
  g.away_score,
  NULL::bigint AS game_pk,
  NULL::integer AS home_team_id,
  NULL::integer AS away_team_id,
  g.game_type,
  g.source_system AS schedule_source,
  g.source_game_id,
  g.season_id AS source_season_id,
  g.league_code AS source_league_code,
  false AS tracks_player_lines,
  opponent_map.teamid AS opponent_teamid
FROM public.indy_iscore_games_raw g
JOIN public.indy_iscore_schedule_seasons season
  ON season.source_system = g.source_system
 AND season.league_code = g.league_code
 AND season.season_id = g.season_id
 AND season.league_id = g.league_id
CROSS JOIN LATERAL (VALUES
  (g.home_source_team_id, g.away_source_team_id, 'Home'::text),
  (g.away_source_team_id, g.home_source_team_id, 'Away'::text)
) sides(source_team_id, opponent_source_team_id, home_away)
JOIN public.indy_iscore_team_source_map m
  ON m.source_system = g.source_system
 AND m.league_code = g.league_code
 AND m.season_id = g.season_id
 AND m.source_team_id = sides.source_team_id
LEFT JOIN public.indy_iscore_team_source_map opponent_map
  ON opponent_map.source_system = g.source_system
 AND opponent_map.league_code = g.league_code
 AND opponent_map.season_id = g.season_id
 AND opponent_map.source_team_id = sides.opponent_source_team_id
WHERE g.game_date BETWEEN season.season_start AND season.season_end
  -- Keep unused schedule entries in the source archive, but do not present
  -- them as completed games. Doubleheaders retain both source game UUIDs.
  AND (lower(trim(coalesce(g.status, ''))) NOT IN ('scheduled', 'pre-game', 'warmup')
       OR g.game_date >= (CURRENT_TIMESTAMP AT TIME ZONE season.schedule_timezone)::date);

-- Match existing schedule-read access; do not broaden other privileges.
DO $grant$
DECLARE reader text;
BEGIN
  FOR reader IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'indy_iscore_games_raw'
      AND privilege_type = 'SELECT' AND grantee <> current_user
  LOOP
    EXECUTE format('GRANT SELECT ON public.v_indy_team_schedule_feed, public.indy_iscore_schedule_seasons, public.indy_iscore_team_source_map TO %I', reader);
  END LOOP;
END $grant$;

COMMIT;
