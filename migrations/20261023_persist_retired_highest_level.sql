-- 2026-10-23: persist retired-player highest level once.
-- Rendering reads flip_card_front_stage.highest_level_label only.
-- Career history is scanned only during this one-time backfill or when a
-- player's status transitions to RETIRED.

BEGIN;

ALTER TABLE public.flip_card_front_stage
  ADD COLUMN IF NOT EXISTS highest_level_label text,
  ADD COLUMN IF NOT EXISTS highest_level_checked_at timestamptz;

CREATE OR REPLACE FUNCTION public.compute_player_highest_level(p_playerid text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  WITH career_rows AS (
    SELECT COALESCE(u.level_label, b.highlevel) AS raw_level
    FROM public.v_tbc_batting_all_seasons_resolved b
    LEFT JOIN public.teamid_universe_mapping u ON u.teamid=b.teamid::text
    WHERE b.playerid::text=p_playerid
    UNION ALL
    SELECT COALESCE(u.level_label, p.highlevel)
    FROM public.v_tbc_pitching_all_seasons_resolved p
    LEFT JOIN public.teamid_universe_mapping u ON u.teamid=p.teamid::text
    WHERE p.playerid::text=p_playerid
  ),
  ranked AS (
    SELECT
      CASE UPPER(TRIM(raw_level))
        WHEN 'MLB' THEN 'MLB'
        WHEN 'TRIPLE-A' THEN 'TRIPLE-A' WHEN 'AAA' THEN 'TRIPLE-A'
        WHEN 'DOUBLE-A' THEN 'DOUBLE-A' WHEN 'AA' THEN 'DOUBLE-A'
        WHEN 'HIGH-A' THEN 'HIGH-A' WHEN 'A+' THEN 'HIGH-A'
        WHEN 'LOW-A' THEN 'SINGLE-A' WHEN 'SINGLE-A' THEN 'SINGLE-A' WHEN 'A' THEN 'SINGLE-A' WHEN 'A-' THEN 'SINGLE-A'
        WHEN 'ROOKIE' THEN 'ROOKIE' WHEN 'RK' THEN 'ROOKIE'
        WHEN 'INDY' THEN 'INDY' WHEN 'INDEPENDENT' THEN 'INDY'
        WHEN 'INTL' THEN 'INTERNATIONAL' WHEN 'INT''L' THEN 'INTERNATIONAL' WHEN 'INTERNATIONAL' THEN 'INTERNATIONAL'
        WHEN 'NCAA-D1' THEN 'NCAA-D1' WHEN 'D1' THEN 'NCAA-D1'
        WHEN 'NCAA-D2' THEN 'NCAA-D2' WHEN 'D2' THEN 'NCAA-D2'
        WHEN 'NCAA-D3' THEN 'NCAA-D3' WHEN 'D3' THEN 'NCAA-D3'
        WHEN 'NAIA' THEN 'NAIA'
        WHEN 'NJCAA' THEN 'NJCAA' WHEN 'JUCO' THEN 'NJCAA' WHEN 'JRCOLLEGE' THEN 'NJCAA'
        WHEN 'CCCAA' THEN 'CCCAA'
        WHEN 'NWAC' THEN 'NWAC'
        WHEN 'HIGH SCHOOL' THEN 'HIGH SCHOOL' WHEN 'HS' THEN 'HIGH SCHOOL'
        ELSE NULL
      END AS normalized_level,
      CASE UPPER(TRIM(raw_level))
        WHEN 'MLB' THEN 1
        WHEN 'TRIPLE-A' THEN 2 WHEN 'AAA' THEN 2
        WHEN 'DOUBLE-A' THEN 3 WHEN 'AA' THEN 3
        WHEN 'HIGH-A' THEN 4 WHEN 'A+' THEN 4
        WHEN 'LOW-A' THEN 5 WHEN 'SINGLE-A' THEN 5 WHEN 'A' THEN 5 WHEN 'A-' THEN 5
        WHEN 'ROOKIE' THEN 6 WHEN 'RK' THEN 6
        WHEN 'INDY' THEN 7 WHEN 'INDEPENDENT' THEN 7
        WHEN 'INTL' THEN 8 WHEN 'INT''L' THEN 8 WHEN 'INTERNATIONAL' THEN 8
        WHEN 'NCAA-D1' THEN 9 WHEN 'D1' THEN 9
        WHEN 'NCAA-D2' THEN 10 WHEN 'D2' THEN 10
        WHEN 'NCAA-D3' THEN 11 WHEN 'D3' THEN 11
        WHEN 'NAIA' THEN 12
        WHEN 'NJCAA' THEN 13 WHEN 'JUCO' THEN 13 WHEN 'JRCOLLEGE' THEN 13
        WHEN 'CCCAA' THEN 14
        WHEN 'NWAC' THEN 15
        WHEN 'HIGH SCHOOL' THEN 16 WHEN 'HS' THEN 16
        ELSE 99
      END AS level_rank
    FROM career_rows
  )
  SELECT normalized_level
  FROM ranked
  WHERE normalized_level IS NOT NULL
  ORDER BY level_rank
  LIMIT 1
$$;

WITH retired AS (
  SELECT playerid::text AS playerid
  FROM public.flip_card_front_stage
  WHERE UPPER(COALESCE(status_label,'')) LIKE 'RETIRED%'
    AND highest_level_checked_at IS NULL
)
UPDATE public.flip_card_front_stage f
SET highest_level_label=public.compute_player_highest_level(f.playerid::text),
    highest_level_checked_at=now()
FROM retired r
WHERE f.playerid::text=r.playerid;

COMMIT;
