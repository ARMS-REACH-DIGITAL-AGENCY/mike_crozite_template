-- Additive, safe for existing unreviewed alumni submissions.
-- A proof confirmation is separate from reviewer identity verification.
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS proof_confirmed_at timestamptz;
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS identity_review_method text;
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS identity_review_note text;
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS reviewed_by_uid text;
-- The legacy pending records remain pending and require contributor confirmation
-- and a documented independent identity review prior to approval.
