-- db/migrations/007_backfill_legacy_player_photos.sql
-- ---------------------------------------------------------------------------
-- BACKFILL SCRIPT: Seed timeline visibility for legacy player_photos rows.
--
-- BACKGROUND
-- ----------
-- Migration 006 added four columns to player_photos:
--   image_role        TEXT NULL   — defaults to NULL for existing rows
--   image_source      TEXT NULL   — defaults to NULL for existing rows
--   approval_status   TEXT        — defaults to 'PENDING' for existing rows
--   show_on_pp_timeline BOOLEAN   — defaults to FALSE for existing rows
--
-- After 006 runs, all pre-existing rows have:
--   image_role        = NULL
--   approval_status   = 'PENDING'
--   show_on_pp_timeline = FALSE
--
-- Because getPlayerPhotos() requires:
--   show_on_pp_timeline = TRUE AND approval_status = 'APPROVED'
-- those legacy rows will NOT appear in the career timeline strip without a
-- backfill step.
--
-- STRATEGY
-- --------
-- This script promotes legacy general photos (image_role IS NULL) to TIMELINE
-- status. These are the photos that were previously shown in the filmstrip
-- before the metadata model was introduced.
--
-- What this does NOT touch:
--   - Rows already assigned a specific image_role (YATSTATS_FRONT, LEFT_ANCHOR,
--     RIGHT_ANCHOR, HEADSHOT) — those are designated slot images, not timeline.
--   - Any row explicitly set to 'REJECTED'.
--
-- REVIEW BEFORE RUNNING
-- ---------------------
-- Run the DRY-RUN query below first to see exactly which rows will be affected.
-- Only run the UPDATE after you confirm the affected rows are appropriate for
-- public timeline display.
--
-- To undo: run the ROLLBACK at the bottom of this file.
-- ---------------------------------------------------------------------------

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 1: DRY-RUN — inspect affected rows before committing
-- ──────────────────────────────────────────────────────────────────────────────
-- Run this SELECT first. Review the results. Only proceed with the UPDATE if
-- the rows look correct.
--
-- SELECT
--   id,
--   player_id,
--   image_url,
--   image_role,
--   approval_status,
--   show_on_pp_timeline,
--   team_name,
--   season_year,
--   date_taken
-- FROM player_photos
-- WHERE image_role IS NULL
--   AND approval_status = 'PENDING'
-- ORDER BY player_id, date_taken ASC NULLS LAST, season_year ASC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 2: BACKFILL — promote legacy rows to TIMELINE / APPROVED
-- ──────────────────────────────────────────────────────────────────────────────
-- Promotes all pre-migration rows (image_role IS NULL, approval_status = 'PENDING')
-- to be visible in the career timeline strip.
--
-- Rules encoded here:
--   image_role = 'TIMELINE'  — these are general photos, not designated slot images
--   approval_status = 'APPROVED' — mark as approved for public display
--   show_on_pp_timeline = TRUE — opt-in to filmstrip inclusion
--
-- SOURCE is NOT set here — update image_source manually if known.
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE player_photos
SET
  image_role          = 'TIMELINE',
  approval_status     = 'APPROVED',
  show_on_pp_timeline = TRUE
WHERE
  image_role IS NULL
  AND approval_status = 'PENDING';

-- Verify the update:
SELECT
  COUNT(*) AS rows_updated,
  'TIMELINE/APPROVED/show_on_pp_timeline=TRUE' AS new_state
FROM player_photos
WHERE image_role = 'TIMELINE'
  AND approval_status = 'APPROVED'
  AND show_on_pp_timeline = TRUE;

-- COMMIT after reviewing the output above:
-- COMMIT;

-- To roll back instead:
-- ROLLBACK;

-- ──────────────────────────────────────────────────────────────────────────────
-- STEP 3: HOW MANY ROWS WERE INVISIBLE AFTER MIGRATION 006 (before backfill)
-- ──────────────────────────────────────────────────────────────────────────────
-- Run this BEFORE step 2 to know the impact:
--
-- SELECT COUNT(*) AS rows_invisible_after_006
-- FROM player_photos
-- WHERE image_role IS NULL
--   AND approval_status = 'PENDING';

-- ──────────────────────────────────────────────────────────────────────────────
-- ADMIN WORKFLOW — Managing image slot assignment after backfill
-- ──────────────────────────────────────────────────────────────────────────────
--
-- To designate a specific image as the YATSTATS_FRONT for a player:
--   UPDATE player_photos
--   SET image_role = 'YATSTATS_FRONT', approval_status = 'APPROVED', show_on_pp_timeline = FALSE
--   WHERE id = <row_id>;
--
-- To designate a HEADSHOT:
--   UPDATE player_photos
--   SET image_role = 'HEADSHOT', approval_status = 'APPROVED', show_on_pp_timeline = FALSE
--   WHERE id = <row_id>;
--
-- To remove a row from the timeline:
--   UPDATE player_photos
--   SET show_on_pp_timeline = FALSE
--   WHERE id = <row_id>;
--
-- To reject an image entirely:
--   UPDATE player_photos
--   SET approval_status = 'REJECTED'
--   WHERE id = <row_id>;
--
-- IMPORTANT: Changing which image fills a designated slot is ALWAYS a metadata
-- update (image_role change), never a file rename or S3 overwrite.
-- ──────────────────────────────────────────────────────────────────────────────
