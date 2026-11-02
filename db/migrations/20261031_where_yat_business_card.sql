-- Retired alumni owner revisions and optional multi-business information.
-- Additive-only: existing published alumni answers and legacy company columns remain intact.
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS businesses_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_headshot_key text,
  ADD COLUMN IF NOT EXISTS business_headshot_url text,
  ADD COLUMN IF NOT EXISTS replaces_submission_id bigint;
-- businesses_json is an array with up to four { name, website, logoKey, logoUrl } objects.
-- The existing contributor_uid verifies edit ownership; inserts preserve revisions.
