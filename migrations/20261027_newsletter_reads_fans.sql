-- What the newsletter may know about fans: two narrow views, the only fan
-- data its role (yatstats_tribune_app) can read. user_profiles also holds
-- Stripe and HighLevel ids, promo codes and roles; the newsletter gets none
-- of those, only who the fan is, their home school and whether they are a
-- superfan (the same rule the Daily pilot uses today,
-- src/app/api/admin/fan-newsletter-pilot/route.ts isSuperfan).
--
-- The views run with their owner's rights, so the role needs no grant on
-- user_profiles or user_favorites themselves. Apply only with Pete's OK.

BEGIN;

CREATE OR REPLACE VIEW public.newsletter_recipients AS
SELECT p.firebase_uid,
       lower(btrim(p.email)) AS email,
       p.first_name,
       p.home_hsid,
       p.home_school_name,
       p.plan,
       (   (nullif(p.stripe_subscription_id, '') IS NOT NULL
            AND lower(coalesce(p.subscription_status, '')) IN ('active', 'trialing'))
        OR (nullif(p.promo_code, '') IS NOT NULL
            AND (p.promo_expires_at IS NULL OR p.promo_expires_at > now()))
        OR lower(coalesce(p.subscription_status, '')) IN ('demo_comped', 'demo-comped')
        OR (p.plan = 'superfan'
            AND nullif(p.stripe_subscription_id, '') IS NULL
            AND nullif(p.promo_code, '') IS NULL
            AND lower(coalesce(p.subscription_status, '')) NOT IN ('cancelled', 'canceled', 'unpaid', 'past_due'))
       ) AS is_superfan
  FROM public.user_profiles p;

CREATE OR REPLACE VIEW public.newsletter_favorites AS
SELECT f.firebase_uid, f.playerid
  FROM public.user_favorites f;

-- New views pick up the schema's default grants (authenticated gets full
-- DML, authenticator SELECT); reset them so only the newsletter reads these.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['newsletter_recipients', 'newsletter_favorites'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticator', v);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yatstats_tribune_app') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM yatstats_tribune_app', v);
      EXECUTE format('GRANT SELECT ON public.%I TO yatstats_tribune_app', v);
    END IF;
  END LOOP;
END $$;

COMMIT;
