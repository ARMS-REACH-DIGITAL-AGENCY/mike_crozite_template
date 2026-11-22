-- Newsletters: TEST MODE until Pete switches to LIVE MODE (Pete, Nov 19 2026).
--
-- "Do not let a send get blocked. I'm the boss and this is test mode. Once
-- the system is approved to my liking, my approval will change the settings
-- to LIVE MODE" (scoring starts Feb 1, 2027).
--
-- TEST: every send goes out (no layout approval needed).
-- LIVE: a send goes out only when enabled and its layout is the approved one
--       (the gate as it was).
-- Switch to live (Pete only):
--   UPDATE public.alumni_newsletter_control SET mode = 'live', approved_by = 'Pete', updated_at = now() WHERE singleton;

ALTER TABLE public.alumni_newsletter_control
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live'));

UPDATE public.alumni_newsletter_control
   SET mode = 'test', enabled = true, approved_by = 'Pete (test mode)', approved_at = now(), updated_at = now()
 WHERE singleton = true;

CREATE OR REPLACE FUNCTION public.enforce_alumni_newsletter_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- TEST MODE: nothing is blocked.
  IF EXISTS (SELECT 1 FROM public.alumni_newsletter_control WHERE singleton = true AND mode = 'test') THEN
    RETURN NEW;
  END IF;
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
$function$;
