-- Additive, scoped grant to let the authenticated Publisher's Desk
-- maintain the EXISTING splash placement table. Does not change any
-- other application's permissions, RLS, sponsor rows, or automatic sending.
-- Apply only AFTER the isolated Publisher's Desk migrations and the
-- dedicated yatstats_tribune_app role have been approved and installed.
GRANT SELECT, INSERT, UPDATE ON TABLE public.school_splash_sponsorships TO yatstats_tribune_app;

DO $$
DECLARE sequence_name text;
BEGIN
  sequence_name := pg_get_serial_sequence('public.school_splash_sponsorships', 'id');
  IF sequence_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO yatstats_tribune_app', sequence_name);
  END IF;
END;
$$;
