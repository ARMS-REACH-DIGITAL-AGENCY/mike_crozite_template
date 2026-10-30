-- Additive universal Where YAT Now? / Claim Your Profile extension.
-- Player verification and contributor proof are separate review gates.
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS retirement_year integer,
  ADD COLUMN IF NOT EXISTS favorite_hs_memory text,
  ADD COLUMN IF NOT EXISTS favorite_post_hs_memory text,
  ADD COLUMN IF NOT EXISTS family_life text,
  ADD COLUMN IF NOT EXISTS business_message text,
  ADD COLUMN IF NOT EXISTS business_offer text,
  ADD COLUMN IF NOT EXISTS business_contact_email text,
  ADD COLUMN IF NOT EXISTS business_contact_phone text,
  ADD COLUMN IF NOT EXISTS business_public_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS private_teammate_tips text,
  ADD COLUMN IF NOT EXISTS life_photos_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alumni_claim_attested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS questionnaire_version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.alumni_where_yat_likes (
  submission_id bigint NOT NULL REFERENCES public.alumni_where_yat_now(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(submission_id, firebase_uid)
);
CREATE TABLE IF NOT EXISTS public.alumni_where_yat_comments (
  id bigserial PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES public.alumni_where_yat_now(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alumni_where_yat_comments_by_post
 ON public.alumni_where_yat_comments(submission_id,created_at,id)
 WHERE status='visible';
CREATE INDEX IF NOT EXISTS alumni_where_yat_by_profile
 ON public.alumni_where_yat_now(playerid,hsid,status,reviewed_at DESC);
