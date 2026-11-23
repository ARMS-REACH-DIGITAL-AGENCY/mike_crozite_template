-- Preserve the deployed Daily sender's existing table and unique claim key.
-- Gazette claims live separately, so its Monday period cannot collide with
-- that Monday's Daily. No recipient preferences or approval controls change.
BEGIN;
ALTER TABLE public.alumni_daily_email_delivery
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE TABLE IF NOT EXISTS public.alumni_weekly_email_delivery
  (LIKE public.alumni_daily_email_delivery INCLUDING ALL);
DO $$
DECLARE login_role record;
BEGIN
  FOR login_role IN
    SELECT rolname FROM pg_roles
     WHERE rolcanlogin
       AND has_table_privilege(rolname,'public.alumni_daily_email_delivery','INSERT')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.alumni_weekly_email_delivery TO %I',login_role.rolname);
  END LOOP;
END
$$;
COMMIT;
