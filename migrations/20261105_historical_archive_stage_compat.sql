-- Compatibility-only migration for the existing archive staging tables on the
-- isolated Neon test-tbc-candidate-crosswalk-posix-20261104 branch.
-- Never run on production. Does not alter canonical player or stat tables.
CREATE TABLE IF NOT EXISTS public.tbc_historical_archive_quarantine (
 run_id uuid NOT NULL REFERENCES public.tbc_historical_archive_runs(run_id),
 source_kind text NOT NULL CHECK(source_kind IN ('batting','pitching')),
 source_row integer NOT NULL,
 reason text NOT NULL,
 raw_excerpt text NOT NULL,
 PRIMARY KEY(run_id,source_kind,source_row)
);
CREATE INDEX IF NOT EXISTS tbc_hist_batting_pid ON public.tbc_historical_batting_stage (run_id,playerid);
CREATE INDEX IF NOT EXISTS tbc_hist_pitching_pid ON public.tbc_historical_pitching_stage (run_id,playerid);
CREATE INDEX IF NOT EXISTS tbc_hist_batting_year ON public.tbc_historical_batting_stage (run_id,season_year);
CREATE INDEX IF NOT EXISTS tbc_hist_pitching_year ON public.tbc_historical_pitching_stage (run_id,season_year);
