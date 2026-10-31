-- Archive obsolete TBC pro team lookup without breaking historical read paths.
-- Canonical identity (name/level/org) ALWAYS comes from teamid_universe_mapping.
-- The legacy record is retained only for TBC successor IDs and historical location.
-- Existing SQL/view/script references continue to work read-only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $archive$
BEGIN
  IF to_regclass('public.tbc_pro_teams_map_raw_legacy_archived_20261031') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy TBC archive already exists; review before proceeding';
  END IF;
  IF to_regclass('public.tbc_pro_teams_map_raw') IS NULL THEN
    RAISE EXCEPTION 'Original legacy TBC raw table is missing';
  END IF;
END;
$archive$;
ALTER TABLE public.tbc_pro_teams_map_raw
  RENAME TO tbc_pro_teams_map_raw_legacy_archived_20261031;
CREATE VIEW public.tbc_pro_teams_map_raw AS
  SELECT a.teamid,
         COALESCE(NULLIF(BTRIM(u.current_team_name),''),a.teamname)::text AS teamname,
         a.currentteamid,
         COALESCE(NULLIF(BTRIM(u.locationlong),''),a.teamlocation)::text AS teamlocation
  FROM public.tbc_pro_teams_map_raw_legacy_archived_20261031 a
  LEFT JOIN public.teamid_universe_mapping u ON u.teamid=a.teamid;
-- ALTER TABLE rename rewires existing dependent views to the archived source.
-- Reattach the historical lookup to the canonical-backed read-only compatibility
-- view so no active view keeps taking the old raw teamname.
CREATE OR REPLACE VIEW public.v_tbc_team_lookup AS
 SELECT 'pro'::text AS team_type,
        p.teamid,p.currentteamid,p.teamname AS team_name,
        NULL::text AS team_short,NULL::text AS nickname,
        p.teamlocation AS location
   FROM public.tbc_pro_teams_map_raw p
 UNION ALL
 SELECT 'college'::text AS team_type,
        c.teamid,NULL::text AS currentteamid,c.collegename AS team_name,
        c.collegeshort AS team_short,c.nickname,c.locationlong AS location
   FROM public.tbc_college_teams_map_raw c;

-- Archived source is no longer writable by application/data-api roles.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE
  ON public.tbc_pro_teams_map_raw_legacy_archived_20261031
  FROM authenticated,authenticator,PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON public.tbc_pro_teams_map_raw FROM authenticated,authenticator,PUBLIC;
GRANT SELECT ON public.tbc_pro_teams_map_raw TO authenticated,authenticator;
REVOKE INSERT,UPDATE,DELETE ON public.v_tbc_team_lookup FROM authenticated,authenticator,PUBLIC;
COMMIT;
