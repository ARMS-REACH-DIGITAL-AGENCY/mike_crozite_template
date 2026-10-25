-- Let the app write the nightly Alumni Daily send log.
--
-- /api/cron/fan-daily-pilot claims each recipient's row in
-- public.alumni_daily_email_delivery before it sends, so a cron retry never
-- emails anyone twice. The app's login role was never granted that table, so
-- every claim failed with "permission denied" (42501) and no email went out
-- (Oct 20 and Oct 21, 2026 runs).
--
-- Grant it to the same login roles that already write public.user_favorites,
-- the way 20260712_restore_user_favorites_sequence_permissions.sql does.

DO $$
DECLARE
  login_role record;
BEGIN
  IF to_regclass('public.alumni_daily_email_delivery') IS NULL THEN
    RAISE NOTICE 'public.alumni_daily_email_delivery does not exist; no grant applied';
    RETURN;
  END IF;

  FOR login_role IN
    SELECT rolname
      FROM pg_roles
     WHERE rolcanlogin
       AND has_table_privilege(rolname, 'public.user_favorites', 'INSERT')
       AND NOT has_table_privilege(rolname, 'public.alumni_daily_email_delivery', 'INSERT')
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE ON public.alumni_daily_email_delivery TO %I',
      login_role.rolname
    );
    RAISE NOTICE 'granted public.alumni_daily_email_delivery to %', login_role.rolname;
  END LOOP;
END
$$;
