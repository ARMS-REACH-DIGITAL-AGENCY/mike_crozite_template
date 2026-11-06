-- Shadow read model only. Keep all source ZIP rows, including split seasons and multiple lines per team/year.
-- Does NOT modify canonical raw stats or existing live views. Apply on isolated branch first.

CREATE TABLE IF NOT EXISTS public.tbc_archive_2026_batting_projected (
 LIKE public.tbc_batting_raw INCLUDING DEFAULTS,
 run_id uuid NOT NULL,
 source_row integer NOT NULL,
 PRIMARY KEY(run_id,source_row)
);
CREATE INDEX IF NOT EXISTS idx_tbc_archive_2026_batting_player_team
 ON public.tbc_archive_2026_batting_projected(playerid,teamid,year,run_id);

CREATE TABLE IF NOT EXISTS public.tbc_archive_2026_pitching_projected (
 LIKE public.tbc_pitching_raw INCLUDING DEFAULTS,
 run_id uuid NOT NULL,
 source_row integer NOT NULL,
 PRIMARY KEY(run_id,source_row)
);
CREATE INDEX IF NOT EXISTS idx_tbc_archive_2026_pitching_player_team
 ON public.tbc_archive_2026_pitching_projected(playerid,teamid,year,run_id);

CREATE OR REPLACE FUNCTION public.tbc_prepare_2026_archive_projection(p_archive_run uuid)
RETURNS TABLE (batting_rows bigint,pitching_rows bigint)
LANGUAGE plpgsql AS $fn$
DECLARE v_batting bigint; v_pitching bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tbc_historical_archive_runs
 WHERE run_id=p_archive_run AND status='verified' AND batting_rows>=1 AND pitching_rows>=1)
 THEN RAISE EXCEPTION 'Verified historical source archive required'; END IF;
 INSERT INTO public.tbc_archive_2026_batting_projected
 ("teamid","playerid","year","uniform","playername","age","ba","th","class","posit","g","ab","r","h","dbl","tpl","hr","rbi","sb","cs","bb","so","hbp","sh","sf","ibb","gdp","tb","pa","xbh","sgl","bavg","obp","slg","ops","seca","iso","babip","bb_pct","so_pct","so_bb","ab_hr","highlevel","mlbyears","playyears","draft_info",run_id,source_row)
 SELECT (jsonb_populate_record(NULL::public.tbc_batting_raw,s.payload)).*,s.run_id,s.source_row
 FROM public.tbc_historical_batting_stage s
 WHERE s.run_id=p_archive_run AND s.season_year=2026
 ON CONFLICT(run_id,source_row) DO NOTHING;
 INSERT INTO public.tbc_archive_2026_pitching_projected
 ("teamid","playerid","year","uniform","playername","age","ba","th","class","w","l","g","gs","cg","sho","gr","gf","sv","ip","h","r","er","hr","bb","so","wp","bk","hb","era","whip","h9","hr9","bb9","so9","ra9","so_bb","highlevel","mlbyears","playyears","draft_info",run_id,source_row)
 SELECT (jsonb_populate_record(NULL::public.tbc_pitching_raw,s.payload)).*,s.run_id,s.source_row
 FROM public.tbc_historical_pitching_stage s
 WHERE s.run_id=p_archive_run AND s.season_year=2026
 ON CONFLICT(run_id,source_row) DO NOTHING;
 SELECT COUNT(*) INTO v_batting FROM public.tbc_archive_2026_batting_projected WHERE run_id=p_archive_run;
 SELECT COUNT(*) INTO v_pitching FROM public.tbc_archive_2026_pitching_projected WHERE run_id=p_archive_run;
 RETURN QUERY SELECT v_batting,v_pitching;
END;
$fn$;

-- Prefer current daily values on the *same player, team and season*, but preserve
-- archive-only rows and distinct team stints; do not discard same-team split rows.
CREATE OR REPLACE VIEW public.v_tbc_batting_all_seasons_complete_preview AS
 SELECT * FROM public.v_tbc_batting_all_seasons_resolved
 UNION ALL
 SELECT a."teamid",a."playerid",a."year",a."uniform",a."playername",a."age",a."ba",a."th",a."class",a."posit",a."g",a."ab",a."r",a."h",a."dbl",a."tpl",a."hr",a."rbi",a."sb",a."cs",a."bb",a."so",a."hbp",a."sh",a."sf",a."ibb",a."gdp",a."tb",a."pa",a."xbh",a."sgl",a."bavg",a."obp",a."slg",a."ops",a."seca",a."iso",a."babip",a."bb_pct",a."so_pct",a."so_bb",a."ab_hr",a."highlevel",a."mlbyears",a."playyears",a."draft_info"
 FROM public.tbc_archive_2026_batting_projected a
 WHERE a.run_id=(SELECT run_id FROM public.tbc_historical_archive_runs
                 WHERE status='verified' ORDER BY imported_at DESC NULLS LAST LIMIT 1)
   AND a.year ~ '^2026([.][0-9]+)?$'
   AND NOT EXISTS(
     SELECT 1 FROM public.tbc_batting_2026_season_raw d
     WHERE d.playerid=a.playerid AND d.teamid=a.teamid AND d.year=a.year
   );

-- Prefer current daily values on the *same player, team and season*, but preserve
-- archive-only rows and distinct team stints; do not discard same-team split rows.
CREATE OR REPLACE VIEW public.v_tbc_pitching_all_seasons_complete_preview AS
 SELECT * FROM public.v_tbc_pitching_all_seasons_resolved
 UNION ALL
 SELECT a."teamid",a."playerid",a."year",a."uniform",a."playername",a."age",a."ba",a."th",a."class",a."w",a."l",a."g",a."gs",a."cg",a."sho",a."gr",a."gf",a."sv",a."ip",a."h",a."r",a."er",a."hr",a."bb",a."so",a."wp",a."bk",a."hb",a."era",a."whip",a."h9",a."hr9",a."bb9",a."so9",a."ra9",a."so_bb",a."highlevel",a."mlbyears",a."playyears",a."draft_info"
 FROM public.tbc_archive_2026_pitching_projected a
 WHERE a.run_id=(SELECT run_id FROM public.tbc_historical_archive_runs
                 WHERE status='verified' ORDER BY imported_at DESC NULLS LAST LIMIT 1)
   AND a.year ~ '^2026([.][0-9]+)?$'
   AND NOT EXISTS(
     SELECT 1 FROM public.tbc_pitching_2026_season_raw d
     WHERE d.playerid=a.playerid AND d.teamid=a.teamid AND d.year=a.year
   );
