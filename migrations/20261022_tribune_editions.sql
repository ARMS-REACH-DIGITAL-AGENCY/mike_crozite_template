-- Immutable browser/plain-text editions. Public copies omit personal follows
-- and recipient settings tokens. This migration does not enable delivery.
BEGIN;
CREATE TABLE IF NOT EXISTS public.alumni_newsletter_editions (
  id uuid PRIMARY KEY,
  firebase_uid text NOT NULL REFERENCES public.user_profiles(firebase_uid),
  school_id text NOT NULL,
  report_start date NOT NULL,
  report_end date NOT NULL,
  edition jsonb NOT NULL,
  public_edition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alumni_newsletter_editions_school_period
  ON public.alumni_newsletter_editions (school_id, report_end DESC);
DO $$
DECLARE login_role record;
BEGIN
  FOR login_role IN SELECT rolname FROM pg_roles
    WHERE rolcanlogin AND has_table_privilege(rolname, 'public.user_favorites', 'INSERT')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON public.alumni_newsletter_editions TO %I', login_role.rolname);
  END LOOP;
END;
$$;
COMMIT;
