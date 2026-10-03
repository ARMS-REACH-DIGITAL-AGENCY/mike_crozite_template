-- flip_card_front_stage integrity repair
-- Goal:
--   1) no blank status_label values in the live stage
--   2) every live stage row has either current_team_name or previous_team_name
--   3) unresolved records are quarantined instead of receiving fabricated data
--   4) future writes cannot reintroduce blank status/team rows
--
-- This migration intentionally does NOT drop any existing columns. Column
-- consolidation is a separate migration after application references are cleaned.

BEGIN;

CREATE TABLE IF NOT EXISTS public.flip_card_front_stage_quarantine (
  LIKE public.flip_card_front_stage INCLUDING ALL
);

ALTER TABLE public.flip_card_front_stage_quarantine
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz NOT NULL DEFAULT now();

CREATE TEMP TABLE _flip_stage_resolution ON COMMIT DROP AS
WITH latest_batting AS (
  SELECT DISTINCT ON (playerid::text)
    playerid::text AS playerid,
    NULLIF(regexp_replace(COALESCE(year,''), '[^0-9].*$', ''),'')::int AS season_year,
    teamid::text AS teamid,
    highlevel
  FROM public.v_tbc_batting_all_seasons_resolved
  ORDER BY
    playerid::text,
    NULLIF(regexp_replace(COALESCE(year,''), '[^0-9].*$', ''),'')::int DESC NULLS LAST,
    teamid DESC
),
latest_pitching AS (
  SELECT DISTINCT ON (playerid::text)
    playerid::text AS playerid,
    NULLIF(regexp_replace(COALESCE(year,''), '[^0-9].*$', ''),'')::int AS season_year,
    teamid::text AS teamid,
    highlevel
  FROM public.v_tbc_pitching_all_seasons_resolved
  ORDER BY
    playerid::text,
    NULLIF(regexp_replace(COALESCE(year,''), '[^0-9].*$', ''),'')::int DESC NULLS LAST,
    teamid DESC
),
latest_history AS (
  SELECT
    f.playerid::text AS playerid,
    CASE
      WHEN COALESCE(p.season_year,-1) > COALESCE(b.season_year,-1) THEN p.season_year
      ELSE b.season_year
    END AS season_year,
    CASE
      WHEN COALESCE(p.season_year,-1) > COALESCE(b.season_year,-1) THEN p.teamid
      ELSE b.teamid
    END AS teamid,
    CASE
      WHEN COALESCE(p.season_year,-1) > COALESCE(b.season_year,-1) THEN p.highlevel
      ELSE b.highlevel
    END AS highlevel
  FROM public.flip_card_front_stage f
  LEFT JOIN latest_batting b ON b.playerid=f.playerid::text
  LEFT JOIN latest_pitching p ON p.playerid=f.playerid::text
),
tbc_lookup AS (
  SELECT
    teamid,
    MAX(NULLIF(BTRIM(team_name),'')) AS team_name
  FROM public.v_tbc_team_lookup
  GROUP BY teamid
),
latest_stint AS (
  SELECT DISTINCT ON (playerid::text)
    playerid::text AS playerid,
    teamid::text AS teamid,
    NULLIF(BTRIM(team_name),'') AS team_name,
    level,
    season
  FROM public.player_team_stints
  ORDER BY playerid::text, season DESC, stint_start DESC
)
SELECT
  f.playerid::text AS playerid,
  r.teamid::text AS resolved_current_teamid,
  NULLIF(BTRIM(r.team_name),'') AS resolved_current_team,
  r.level AS resolved_current_level,
  r.source AS resolved_current_source,
  r.source_team_id AS resolved_source_team_id,
  r.roster_status AS resolved_roster_status,
  r.last_verified AS resolved_last_verified,
  h.season_year AS latest_season_year,
  h.teamid AS latest_teamid,
  COALESCE(
    NULLIF(BTRIM(u.current_team_name),''),
    tl.team_name
  ) AS latest_team_name,
  COALESCE(
    NULLIF(BTRIM(u.level_label),''),
    NULLIF(BTRIM(h.highlevel),'')
  ) AS latest_level,
  NULLIF(BTRIM(u.current_org_or_conference_name),'') AS latest_org,
  s.teamid AS stint_teamid,
  s.team_name AS stint_team_name,
  s.level AS stint_level
FROM public.flip_card_front_stage f
LEFT JOIN public.v_player_current_team_resolved r
  ON r.playerid::text=f.playerid::text
LEFT JOIN latest_history h
  ON h.playerid=f.playerid::text
LEFT JOIN public.teamid_universe_mapping u
  ON u.teamid::text=h.teamid
LEFT JOIN tbc_lookup tl
  ON tl.teamid=h.teamid
LEFT JOIN latest_stint s
  ON s.playerid=f.playerid::text;

-- Repair blank-status rows where there is defensible team evidence.
UPDATE public.flip_card_front_stage f
SET
  status_label = CASE
    WHEN r.resolved_current_team IS NOT NULL THEN 'ACTIVE'
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL THEN 'ACTIVE'
    ELSE 'RETIRED'
  END,
  display_status_label = CASE
    WHEN r.resolved_current_team IS NOT NULL THEN 'ACTIVE'
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL THEN 'ACTIVE'
    ELSE 'RETIRED'
  END,
  team_affiliation_status = CASE
    WHEN r.resolved_current_team IS NOT NULL
      OR (r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL)
      THEN 'ACTIVE'
    ELSE 'RETIRED'
  END,
  current_team_name = CASE
    WHEN r.resolved_current_team IS NOT NULL THEN r.resolved_current_team
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL THEN r.latest_team_name
    ELSE NULL
  END,
  current_teamid = CASE
    WHEN r.resolved_current_team IS NOT NULL THEN r.resolved_current_teamid
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL THEN r.latest_teamid
    ELSE NULL
  END,
  current_team_source = CASE
    WHEN r.resolved_current_team IS NOT NULL
      THEN COALESCE(r.resolved_current_source,'current_team_resolver')
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL
      THEN '2026_stat_team'
    ELSE current_team_source
  END,
  current_team_source_team_id = CASE
    WHEN r.resolved_current_team IS NOT NULL
      THEN COALESCE(r.resolved_source_team_id,r.resolved_current_teamid)
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL
      THEN r.latest_teamid
    ELSE current_team_source_team_id
  END,
  current_team_roster_status = CASE
    WHEN r.resolved_current_team IS NOT NULL
      THEN COALESCE(r.resolved_roster_status,'ACTIVE')
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL
      THEN 'ACTIVE'
    ELSE current_team_roster_status
  END,
  current_team_last_verified = CASE
    WHEN r.resolved_current_team IS NOT NULL
      THEN COALESCE(r.resolved_last_verified,now())
    WHEN r.latest_season_year = 2026 AND r.latest_team_name IS NOT NULL
      THEN now()
    ELSE current_team_last_verified
  END,
  previous_team_name = CASE
    WHEN r.resolved_current_team IS NULL
      AND NOT COALESCE(r.latest_season_year=2026 AND r.latest_team_name IS NOT NULL,false)
      THEN COALESCE(r.latest_team_name,r.stint_team_name)
    ELSE previous_team_name
  END,
  previous_teamid = CASE
    WHEN r.resolved_current_team IS NULL
      AND NOT COALESCE(r.latest_season_year=2026 AND r.latest_team_name IS NOT NULL,false)
      THEN COALESCE(r.latest_teamid,r.stint_teamid)
    ELSE previous_teamid
  END,
  previous_level_label = CASE
    WHEN r.resolved_current_team IS NULL
      AND NOT COALESCE(r.latest_season_year=2026 AND r.latest_team_name IS NOT NULL,false)
      THEN COALESCE(r.latest_level,r.stint_level)
    ELSE previous_level_label
  END,
  previous_org_or_conference_name = CASE
    WHEN r.resolved_current_team IS NULL
      AND NOT COALESCE(r.latest_season_year=2026 AND r.latest_team_name IS NOT NULL,false)
      THEN COALESCE(r.latest_org,previous_org_or_conference_name)
    ELSE previous_org_or_conference_name
  END,
  level_label = COALESCE(NULLIF(BTRIM(f.level_label),''),r.resolved_current_level,r.latest_level,r.stint_level),
  display_level_label = COALESCE(NULLIF(BTRIM(f.display_level_label),''),r.resolved_current_level,r.latest_level,r.stint_level),
  updated_at = now()
FROM _flip_stage_resolution r
WHERE r.playerid=f.playerid::text
  AND NULLIF(BTRIM(COALESCE(f.status_label,'')),'') IS NULL
  AND COALESCE(r.resolved_current_team,r.latest_team_name,r.stint_team_name) IS NOT NULL;

-- Repair already-statused rows that still have no team.
UPDATE public.flip_card_front_stage f
SET
  current_team_name = CASE
    WHEN UPPER(BTRIM(f.status_label)) IN (
      'ACTIVE','INJURED 60-DAY','INJURED 15-DAY','INJURED - FULL SEASON',
      'DEVELOPMENT LIST','RESTRICTED LIST','MILITARY LEAVE'
    )
      THEN COALESCE(r.resolved_current_team,r.latest_team_name,r.stint_team_name)
    ELSE f.current_team_name
  END,
  current_teamid = CASE
    WHEN UPPER(BTRIM(f.status_label)) IN (
      'ACTIVE','INJURED 60-DAY','INJURED 15-DAY','INJURED - FULL SEASON',
      'DEVELOPMENT LIST','RESTRICTED LIST','MILITARY LEAVE'
    )
      THEN COALESCE(r.resolved_current_teamid,r.latest_teamid,r.stint_teamid)
    ELSE f.current_teamid
  END,
  previous_team_name = CASE
    WHEN UPPER(BTRIM(f.status_label)) IN ('RETIRED','FREE AGENT')
      THEN COALESCE(r.latest_team_name,r.stint_team_name,r.resolved_current_team)
    ELSE f.previous_team_name
  END,
  previous_teamid = CASE
    WHEN UPPER(BTRIM(f.status_label)) IN ('RETIRED','FREE AGENT')
      THEN COALESCE(r.latest_teamid,r.stint_teamid,r.resolved_current_teamid)
    ELSE f.previous_teamid
  END,
  updated_at=now()
FROM _flip_stage_resolution r
WHERE r.playerid=f.playerid::text
  AND NULLIF(BTRIM(COALESCE(f.status_label,'')),'') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(f.current_team_name,'')),'') IS NULL
  AND NULLIF(BTRIM(COALESCE(f.previous_team_name,'')),'') IS NULL
  AND COALESCE(r.resolved_current_team,r.latest_team_name,r.stint_team_name) IS NOT NULL;

-- Preserve every unresolved record before removing it from the live card stage.
INSERT INTO public.flip_card_front_stage_quarantine
SELECT f.*,
       CASE
         WHEN NULLIF(BTRIM(COALESCE(f.status_label,'')),'') IS NULL
           THEN 'no defensible status/team evidence'
         ELSE 'status present but no current/previous team evidence'
       END,
       now()
FROM public.flip_card_front_stage f
WHERE (
  NULLIF(BTRIM(COALESCE(f.status_label,'')),'') IS NULL
  OR (
    NULLIF(BTRIM(COALESCE(f.current_team_name,'')),'') IS NULL
    AND NULLIF(BTRIM(COALESCE(f.previous_team_name,'')),'') IS NULL
  )
)
AND NOT EXISTS (
  SELECT 1
  FROM public.flip_card_front_stage_quarantine q
  WHERE q.playerid=f.playerid
);

DELETE FROM public.flip_card_front_stage f
WHERE NULLIF(BTRIM(COALESCE(f.status_label,'')),'') IS NULL
   OR (
     NULLIF(BTRIM(COALESCE(f.current_team_name,'')),'') IS NULL
     AND NULLIF(BTRIM(COALESCE(f.previous_team_name,'')),'') IS NULL
   );

ALTER TABLE public.flip_card_front_stage
  DROP CONSTRAINT IF EXISTS flip_card_front_stage_status_required,
  DROP CONSTRAINT IF EXISTS flip_card_front_stage_team_required;

ALTER TABLE public.flip_card_front_stage
  ADD CONSTRAINT flip_card_front_stage_status_required
  CHECK (NULLIF(BTRIM(COALESCE(status_label,'')),'') IS NOT NULL),
  ADD CONSTRAINT flip_card_front_stage_team_required
  CHECK (
    NULLIF(BTRIM(COALESCE(current_team_name,'')),'') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(previous_team_name,'')),'') IS NOT NULL
  );

COMMIT;
