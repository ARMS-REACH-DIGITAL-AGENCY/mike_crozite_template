ALTER TABLE public.alumni_where_yat_likes ADD COLUMN IF NOT EXISTS story_key text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.alumni_where_yat_comments ADD COLUMN IF NOT EXISTS story_key text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.alumni_where_yat_likes DROP CONSTRAINT IF EXISTS alumni_where_yat_likes_pkey;
ALTER TABLE public.alumni_where_yat_likes ADD CONSTRAINT alumni_where_yat_likes_pkey PRIMARY KEY(submission_id,firebase_uid,story_key);
CREATE INDEX IF NOT EXISTS alumni_where_yat_likes_story_idx ON public.alumni_where_yat_likes(submission_id,story_key);
CREATE INDEX IF NOT EXISTS alumni_where_yat_comments_story_idx ON public.alumni_where_yat_comments(submission_id,story_key,created_at DESC);
