-- 2026-10-24: persisted retired career-high level is a TBC player fact,
-- not a level selected from the teams in a season stat history.
-- Manual migration only: do not run from app page-load or build.
-- Review the dry-run count and run in bounded batches on production.
-- NCAA (unspecified division), JRCOLLEGE (ambiguous conference system),
-- blanks, and PRO intentionally resolve to NULL pending sourced review.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.compute_player_highest_level(p_playerid text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE UPPER(BTRIM(p.highlevel))
    WHEN 'MLB' THEN 'MLB'
    WHEN 'AAA' THEN 'TRIPLE-A' WHEN 'TRIPLE-A' THEN 'TRIPLE-A'
    WHEN 'AA' THEN 'DOUBLE-A' WHEN 'DOUBLE-A' THEN 'DOUBLE-A'
    WHEN 'A+' THEN 'HIGH-A' WHEN 'HIGH-A' THEN 'HIGH-A'
    WHEN 'A' THEN 'SINGLE-A' WHEN 'A-' THEN 'SINGLE-A'
    WHEN 'LOW-A' THEN 'SINGLE-A' WHEN 'SINGLE-A' THEN 'SINGLE-A'
    WHEN 'RK' THEN 'ROOKIE' WHEN 'ROOKIE' THEN 'ROOKIE'
    WHEN 'INDY' THEN 'INDY' WHEN 'INDEPENDENT' THEN 'INDY'
    WHEN 'INTL' THEN 'INTERNATIONAL' WHEN 'INT''L' THEN 'INTERNATIONAL'
    WHEN 'INTERNATIONAL' THEN 'INTERNATIONAL'
    WHEN 'NCAA-D1' THEN 'NCAA-D1' WHEN 'NCAA-D2' THEN 'NCAA-D2'
    WHEN 'NCAA-D3' THEN 'NCAA-D3' WHEN 'NAIA' THEN 'NAIA'
    WHEN 'NJCAA' THEN 'NJCAA' WHEN 'CCCAA' THEN 'CCCAA'
    WHEN 'NWAC' THEN 'NWAC'
    WHEN 'HIGH SCHOOL' THEN 'HIGH SCHOOL' WHEN 'HS' THEN 'HIGH SCHOOL'
    ELSE NULL
  END
  FROM public.tbc_players_raw p
  WHERE p.playerid = p_playerid
  LIMIT 1;
$$;

COMMIT;

-- Backfill data separately with a bounded, audited job, comparing
-- persisted highest_level_label against this function for RETIRED rows.
-- Never recompute on a card or profile page request.
