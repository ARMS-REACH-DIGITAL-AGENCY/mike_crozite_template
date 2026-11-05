-- TBC full-history read cutover. REHEARSE ON A NEON CLONE ONLY.
-- It leaves original tbc_batting_raw, tbc_pitching_raw, and 2026 daily
-- landing/season tables untouched for rollback. Do not merge until app
-- regression, current status authority and school-gallery tests pass.
-- Must run after 939339 ZIP stats, verified HSID/canonical batch publication,
-- and player/year indexes are created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$
DECLARE v_batting bigint;v_pitching bigint;v_2026 bigint;v_links bigint;
BEGIN
  SELECT count(*) INTO v_batting FROM public.tbc_complete_batting_history;
  SELECT count(*) INTO v_pitching FROM public.tbc_complete_pitching_history;
  SELECT count(*) INTO v_2026 FROM public.tbc_verified_2026_participation;
  SELECT count(*) INTO v_links FROM public.tbc_player_verified_school_links;
  IF v_batting<>501242 OR v_pitching<>438097 OR v_2026<>44428
    OR v_links<206846 THEN
    RAISE EXCEPTION 'Unverified cutover: batting %, pitching %, 2026 %, links %',
      v_batting,v_pitching,v_2026,v_links;
  END IF;
END;
$guard$;
CREATE INDEX IF NOT EXISTS idx_tbc_complete_batting_player_year
  ON public.tbc_complete_batting_history(playerid,year);
CREATE INDEX IF NOT EXISTS idx_tbc_complete_pitching_player_year
  ON public.tbc_complete_pitching_history(playerid,year);
-- Matching 46/40 source and view column lists were verified on 2026-11-05.
-- The complete 2026 archive is included exactly once (no double-counting the
-- overlapping, narrower daily 2026 feeds).
CREATE OR REPLACE VIEW public.v_tbc_batting_all_seasons_resolved AS
  SELECT * FROM public.tbc_complete_batting_history;
CREATE OR REPLACE VIEW public.v_tbc_pitching_all_seasons_resolved AS
  SELECT * FROM public.tbc_complete_pitching_history;
-- Keep 6-column player_hsids contract; use directly indexed verified links
-- and a frozen legacy exception snapshot, not repeated fuzzy school name join.
CREATE OR REPLACE VIEW public.player_hsids AS
  SELECT playerid,firstname,lastname,hsid,hsname,hslocation
  FROM public.v_player_hsids_verified_prepared;
COMMIT;
