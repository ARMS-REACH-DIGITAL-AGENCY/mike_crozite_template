-- PIPELINE: expose the already-populated canonical favorite identity to the
-- existing read-only newsletter view. Preserve its columns, rows and grants.
-- Verified first on qa-2026-day-by-day-20261121. No production application
-- or merge is authorized by this file.
BEGIN;
CREATE OR REPLACE VIEW public.newsletter_favorites AS
SELECT firebase_uid, playerid, yatid
FROM public.user_favorites;
COMMIT;
