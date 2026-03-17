-- db/migrations/009_player_photos_media_upload.sql
-- ---------------------------------------------------------------------------
-- Extends player_photos with rich asset-provenance metadata and adds the
-- media_upload table for tracking raw S3 uploads.
--
-- Design goals
-- • media_upload is the source-of-truth for every file uploaded to S3.
--   player_photos rows may reference a media_upload row via media_upload_id.
-- • All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS so this migration
--   is safe to re-run and can be applied while the app is live (zero downtime).
-- • No existing columns are removed or renamed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. media_upload — raw upload registry
--    One row per file placed in S3 (regardless of whether it has been
--    assigned to a player_photos slot yet).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_upload (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id       TEXT        NULL,                     -- optional: pre-linked player
    s3_key          TEXT        NOT NULL,                 -- full object key within bucket
    s3_bucket       TEXT        NULL,
    image_url       TEXT        NULL,                     -- public CDN / presigned URL
    mime_type       TEXT        NULL,
    file_size_bytes BIGINT      NULL,
    sha256          TEXT        NULL,                     -- hex digest for dedup
    uploaded_by     TEXT        NULL,                     -- firebase uid or admin token
    notes           TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_upload_player_id
    ON media_upload (player_id);

CREATE INDEX IF NOT EXISTS idx_media_upload_s3_key
    ON media_upload (s3_key);

CREATE INDEX IF NOT EXISTS idx_media_upload_sha256
    ON media_upload (sha256);

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_media_upload_updated_at'
      AND tgrelid = 'media_upload'::regclass
  ) THEN
    CREATE TRIGGER trg_media_upload_updated_at
    BEFORE UPDATE ON media_upload
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_player_photos_updated_at'
      AND tgrelid = 'player_photos'::regclass
  ) THEN
    CREATE TRIGGER trg_player_photos_updated_at
    BEFORE UPDATE ON player_photos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. player_photos — add new provenance + asset-management columns
--    All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- ---------------------------------------------------------------------------

-- FK link to the media_upload registry row (nullable — existing rows have none)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS media_upload_id UUID NULL;

-- School linkage (e.g. for admin filtering by hsid)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS hsid TEXT NULL;

-- S3 object key (redundant with image_url but avoids URL parsing at query time)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS s3_key TEXT NULL;

-- Where the image was sourced from (web URL, partner API endpoint, etc.)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS source_system      TEXT NULL;
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS source_page_url    TEXT NULL;
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS source_image_url   TEXT NULL;

-- Year the image depicts (distinct from season_year which tracks the stat season)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS image_year TEXT NULL;

-- Arbitrary context tag for grouping (e.g. 'draft-day', 'college-roster', etc.)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS source_context TEXT NULL;

-- Is this the primary/canonical image for the player in this role?
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Soft-delete: FALSE hides the row from all queries without losing data.
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- File metadata (may be populated after upload or via S3 head-object)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS mime_type       TEXT   NULL;
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NULL;
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS sha256          TEXT   NULL;

-- Free-form admin notes
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- Audit timestamps (new rows get now(); existing rows keep NULL until touched)
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NULL DEFAULT now();
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. FK constraint: player_photos.media_upload_id → media_upload.id
-- ---------------------------------------------------------------------------
ALTER TABLE player_photos
    DROP CONSTRAINT IF EXISTS fk_player_photos_media_upload;
ALTER TABLE player_photos
    ADD CONSTRAINT fk_player_photos_media_upload
        FOREIGN KEY (media_upload_id)
        REFERENCES public.media_upload (id)
        ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Additional indexes
-- ---------------------------------------------------------------------------

-- Lookup by school (admin + batch queries)
CREATE INDEX IF NOT EXISTS idx_player_photos_hsid
    ON player_photos (hsid);

-- Lookup by image_role (runtime slot queries)
CREATE INDEX IF NOT EXISTS idx_player_photos_role
    ON player_photos (image_role);

-- Lookup by approval_status (admin review queues)
CREATE INDEX IF NOT EXISTS idx_player_photos_status
    ON player_photos (approval_status);

-- Soft-delete filter (keep inactive rows out of hot-path queries)
CREATE INDEX IF NOT EXISTS idx_player_photos_active
    ON player_photos (player_id, image_role)
    WHERE is_active = TRUE AND approval_status = 'APPROVED';

-- Enforce at most one is_primary=TRUE row per (player_id, image_role).
-- Uses a unique partial index so the constraint is NOT enforced for
-- is_primary=FALSE rows (multiple non-primary rows per role are allowed).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_player_photos_primary_per_role
    ON player_photos (player_id, image_role)
    WHERE is_primary = TRUE;

