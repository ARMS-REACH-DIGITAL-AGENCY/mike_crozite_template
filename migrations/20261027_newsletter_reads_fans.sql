-- Lets the newsletter's database role read who gets which edition: the fans'
-- profiles (email, plan, home school) and their favorite players. Kept apart
-- from the publication tables because these hold fans' emails. Apply only
-- with Pete's OK.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yatstats_tribune_app') THEN
    GRANT SELECT ON public.user_profiles, public.user_favorites TO yatstats_tribune_app;
  END IF;
END $$;
