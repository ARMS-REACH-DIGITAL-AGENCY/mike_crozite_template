-- Add optional school-season metadata without additional page-load queries.
-- The existing indexed, cached school-season read remains the single source.
ALTER TABLE public.school_team_season_results
  ADD COLUMN IF NOT EXISTS ties smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coach_name text,
  ADD COLUMN IF NOT EXISTS division_label text,
  ADD COLUMN IF NOT EXISTS division_rank smallint,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Existing curated Hamilton rows retain their 0-tie default.
-- Imports may supply ties and two display lines for any school.
