-- WHERE YAT NOW? Free alumni update submissions.
-- The submission, including optional photo, is private until review.
CREATE TABLE IF NOT EXISTS public.alumni_where_yat_now (
  id bigserial PRIMARY KEY,
  playerid text NOT NULL,
  hsid text NOT NULL,
  contributor_uid text NOT NULL,
  contact_email text NOT NULL,
  display_name text NOT NULL,
  location_city text,
  location_state text,
  occupation text,
  company_name text,
  business_website text,
  linkedin_url text,
  instagram_url text,
  facebook_url text,
  x_url text,
  story text,
  photo_key text,
  photo_url text,
  sponsorship_interest boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS alumni_where_yat_now_player_approved
  ON public.alumni_where_yat_now (playerid, created_at DESC)
  WHERE status='approved';
CREATE INDEX IF NOT EXISTS alumni_where_yat_now_review_queue
  ON public.alumni_where_yat_now (created_at DESC)
  WHERE status='pending';

-- Application database role (the pool connects as authenticator).
GRANT SELECT, INSERT, UPDATE ON TABLE public.alumni_where_yat_now TO authenticator;
GRANT USAGE ON SEQUENCE public.alumni_where_yat_now_id_seq TO authenticator;
