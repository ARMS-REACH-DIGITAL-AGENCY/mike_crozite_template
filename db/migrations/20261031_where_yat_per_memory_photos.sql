-- One set of photos per published retired-alumni memory.
-- Old life_photos_json and photo_url remain untouched; readers fall back to
-- those fields for existing profiles until a particular memory is edited.
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS memory_photos_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_updated_at timestamptz;
-- The Vercel runtime uses this restricted role. No permission to change
-- contributor_uid, publication status, player identity or private contact data.
GRANT SELECT ON public.alumni_where_yat_now TO yatstats_tribune_app;
GRANT UPDATE (favorite_hs_memory, favorite_post_hs_memory, family_life, story,
              business_message, memory_photos_json, memory_updated_at)
  ON public.alumni_where_yat_now TO yatstats_tribune_app;
