-- Optional company logo, separate from the alumnus's personal photograph.
-- Applied to the shared alumni update table for every school/player.
ALTER TABLE public.alumni_where_yat_now
 ADD COLUMN IF NOT EXISTS company_logo_key text,
 ADD COLUMN IF NOT EXISTS company_logo_url text;
