-- Store school-season results in a reviewed, school-scoped dataset.
-- Public pages read only approved rows. Future fan submissions can enter as
-- pending rows and be reviewed without changing the published result.
CREATE TABLE IF NOT EXISTS public.school_team_season_results (
  id bigserial PRIMARY KEY,
  hsid text NOT NULL,
  season_year smallint NOT NULL CHECK (season_year BETWEEN 1900 AND 2100),
  achievement text NOT NULL,
  wins smallint NOT NULL CHECK (wins >= 0),
  losses smallint NOT NULL CHECK (losses >= 0),
  season_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  source_type text NOT NULL DEFAULT 'fan' CHECK (source_type IN ('fan', 'curated')),
  contributor_firebase_uid text,
  contributor_name text,
  reviewed_by_firebase_uid text,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep one official result per school and season while allowing multiple
-- pending fan submissions for the same school/year.
CREATE UNIQUE INDEX IF NOT EXISTS school_team_season_results_one_approved_idx
  ON public.school_team_season_results (hsid, season_year)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS school_team_season_results_school_year_status_idx
  ON public.school_team_season_results (hsid, season_year DESC, status);

CREATE INDEX IF NOT EXISTS school_team_season_results_contributor_idx
  ON public.school_team_season_results (contributor_firebase_uid, created_at DESC)
  WHERE contributor_firebase_uid IS NOT NULL;

-- Initial curated records provided for Hamilton High School (hsid 5004).
-- 2027 has no supplied season result yet and is intentionally not seeded.
INSERT INTO public.school_team_season_results
  (hsid, season_year, achievement, wins, losses, season_note, status, source_type, reviewed_at)
VALUES
  ('5004', 1999, 'Hamilton Baseball Established', 5, 24, NULL, 'approved', 'curated', now()),
  ('5004', 2000, 'Lost Regional Playoff', 17, 14, NULL, 'approved', 'curated', now()),
  ('5004', 2001, 'Lost First Round', 21, 10, NULL, 'approved', 'curated', now()),
  ('5004', 2002, 'Semi-Finalist, Fiesta Region Champions', 28, 9, NULL, 'approved', 'curated', now()),
  ('5004', 2003, '5A State Champions', 27, 10, NULL, 'approved', 'curated', now()),
  ('5004', 2004, '5A State Champions', 30, 8, NULL, 'approved', 'curated', now()),
  ('5004', 2005, '5A I Runner-Up, Fiesta Region Champions', 27, 7, NULL, 'approved', 'curated', now()),
  ('5004', 2006, 'Semi-Finalist, Fiesta Region Champions', 21, 12, NULL, 'approved', 'curated', now()),
  ('5004', 2007, 'Lost Third Round', 20, 12, NULL, 'approved', 'curated', now()),
  ('5004', 2008, '5A I State Champions', 25, 8, NULL, 'approved', 'curated', now()),
  ('5004', 2009, '5A I Runner-Up', 23, 12, NULL, 'approved', 'curated', now()),
  ('5004', 2010, 'Lost Fourth Round, Fiesta Region Champions', 28, 5, NULL, 'approved', 'curated', now()),
  ('5004', 2011, '5A I Runner-Up, Fiesta Region Champions', 26, 7, NULL, 'approved', 'curated', now()),
  ('5004', 2012, 'Final Six, Lost Fifth Round', 23, 9, NULL, 'approved', 'curated', now()),
  ('5004', 2013, 'Lost First Round', 21, 7, NULL, 'approved', 'curated', now()),
  ('5004', 2014, 'Division I State Champions', 30, 3, NULL, 'approved', 'curated', now()),
  ('5004', 2015, 'Semi-Finalist, Section II Champions', 29, 4, NULL, 'approved', 'curated', now()),
  ('5004', 2016, 'Division I State Champions', 27, 7, NULL, 'approved', 'curated', now()),
  ('5004', 2017, '6A State Champions', 23, 10, NULL, 'approved', 'curated', now()),
  ('5004', 2018, 'Final Six', 19, 12, NULL, 'approved', 'curated', now()),
  ('5004', 2019, '6A State Champions', 26, 7, NULL, 'approved', 'curated', now()),
  ('5004', 2020, 'Ranked #1 Arizona, #1 Nationally by MaxPreps', 8, 0, 'COVID shortened season', 'approved', 'curated', now()),
  ('5004', 2021, 'State Semi-Finalist', 20, 3, NULL, 'approved', 'curated', now()),
  ('5004', 2022, '6A State Champions', 29, 4, NULL, 'approved', 'curated', now()),
  ('5004', 2023, '6A State Champions', 26, 5, NULL, 'approved', 'curated', now()),
  ('5004', 2024, 'Lost Third Round', 22, 9, NULL, 'approved', 'curated', now()),
  ('5004', 2025, 'Region Runner-Up', 25, 9, NULL, 'approved', 'curated', now()),
  ('5004', 2026, '6A State Champions', 22, 10, NULL, 'approved', 'curated', now())
ON CONFLICT (hsid, season_year) WHERE status = 'approved'
DO UPDATE SET
  achievement = EXCLUDED.achievement,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  season_note = EXCLUDED.season_note,
  source_type = EXCLUDED.source_type,
  reviewed_at = EXCLUDED.reviewed_at,
  updated_at = now();
