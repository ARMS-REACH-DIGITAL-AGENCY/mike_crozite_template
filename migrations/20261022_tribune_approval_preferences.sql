-- HISTORICAL LEGACY HOLD: already applied before the isolated portal revision.
-- Do not reapply this file as part of the new private-schema rollout. See
-- docs/tribune-publisher-portal.md for the five current install migrations.
-- Tribune release gate and recipient choices. Applying this migration PAUSES
-- the legacy pilot immediately: its send claim has no template_version.
-- No cron, delivery-domain setting, billing, or other messaging path is changed.
-- Approval is a separate explicit operator action after layout review.
BEGIN;

CREATE TABLE IF NOT EXISTS public.alumni_newsletter_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  approved_layout_version text,
  approved_at timestamptz,
  approved_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR approved_layout_version IS NOT NULL)
);

INSERT INTO public.alumni_newsletter_control (singleton, enabled)
VALUES (true, false) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.alumni_newsletter_preferences (
  firebase_uid text PRIMARY KEY REFERENCES public.user_profiles(firebase_uid),
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly')),
  format text NOT NULL DEFAULT 'html' CHECK (format IN ('html', 'text')),
  subscribed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing preference rows are preserved. An operator may seed only the
-- confirmed, previously authorized pilot from private TRIBUNE_PILOT_EMAILS
-- configuration, using ON CONFLICT (firebase_uid) DO NOTHING. Recipient
-- addresses never belong in this migration. New rows default to unsubscribed.

ALTER TABLE public.alumni_daily_email_delivery
  ADD COLUMN IF NOT EXISTS template_version text;

CREATE OR REPLACE FUNCTION public.enforce_alumni_newsletter_approval()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'sending' AND NOT EXISTS (
    SELECT 1 FROM public.alumni_newsletter_control
    WHERE singleton = true AND enabled = true
      AND approved_layout_version = NEW.template_version
  ) THEN
    -- Legacy code sends only after INSERT ... RETURNING yields a claim.
    -- Returning NULL suppresses that claim without inventing delivery records.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'alumni_newsletter_approval_gate'
      AND tgrelid = 'public.alumni_daily_email_delivery'::regclass
  ) THEN
    CREATE TRIGGER alumni_newsletter_approval_gate
    BEFORE INSERT OR UPDATE OF status, template_version
    ON public.alumni_daily_email_delivery
    FOR EACH ROW EXECUTE FUNCTION public.enforce_alumni_newsletter_approval();
  END IF;
END;
$$;

-- Match the existing app-role permissions convention. App code can read
-- approval, never grant it; it can store only recipient preference choices.
DO $$
DECLARE login_role record;
BEGIN
  FOR login_role IN
    SELECT rolname FROM pg_roles
    WHERE rolcanlogin
      AND has_table_privilege(rolname, 'public.user_favorites', 'INSERT')
  LOOP
    EXECUTE format('GRANT SELECT ON public.alumni_newsletter_control TO %I', login_role.rolname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.alumni_newsletter_preferences TO %I', login_role.rolname);
  END LOOP;
END;
$$;

COMMIT;
