-- Expose canonical YAT IDs through the existing newsletter favorites view.
-- Preserve existing columns, rows and grants; do not change recipient preferences.
BEGIN;
CREATE OR REPLACE VIEW public.newsletter_favorites AS
SELECT firebase_uid, playerid, yatid
FROM public.user_favorites;
COMMIT;
