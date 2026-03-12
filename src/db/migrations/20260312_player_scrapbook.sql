-- YAT?STATS — Player Scrapbook & Image Ingestion Schema
-- Migration: 20260312_player_scrapbook.sql

-- ============================================================
-- 1. player_external_ids
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_external_ids (
    id           BIGSERIAL PRIMARY KEY,
    playerid     BIGINT    NOT NULL,
    provider     TEXT      NOT NULL CHECK (provider <> ''),
    external_id  TEXT      NOT NULL CHECK (external_id <> ''),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (playerid, provider)
);

-- ============================================================
-- 2. player_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_photos (
    id                   BIGSERIAL PRIMARY KEY,
    playerid             BIGINT    NOT NULL,
    s3_bucket            TEXT      NOT NULL CHECK (s3_bucket <> ''),
    s3_key               TEXT      NOT NULL CHECK (s3_key <> ''),
    file_name            TEXT      NOT NULL CHECK (file_name <> ''),
    original_file_name   TEXT      NOT NULL CHECK (original_file_name <> ''),
    mime_type            TEXT      NOT NULL CHECK (mime_type <> ''),
    source_type          TEXT      NOT NULL CHECK (source_type <> ''),
    uploader_type        TEXT      NOT NULL CHECK (uploader_type <> ''),
    uploaded_by_name     TEXT      NOT NULL CHECK (uploaded_by_name <> ''),
    uploaded_by_email    TEXT,
    photo_date           DATE,
    photo_year           INTEGER,
    date_precision       TEXT      NOT NULL DEFAULT 'unknown'
                            CHECK (date_precision IN ('day', 'month', 'year', 'unknown')),
    caption              TEXT,
    uploader_relationship TEXT
                            CHECK (uploader_relationship IN ('self', 'parent', 'sibling', 'relative', 'friend', 'no_relation')),
    approval_status      TEXT      NOT NULL DEFAULT 'pending'
                            CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    visibility_status    TEXT      NOT NULL DEFAULT 'private'
                            CHECK (visibility_status IN ('private', 'public', 'team')),
    usage_rights_status  TEXT      NOT NULL DEFAULT 'user_submitted_consent'
                            CHECK (usage_rights_status IN ('user_submitted_consent', 'agency', 'unknown')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. player_moments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_moments (
    id           BIGSERIAL PRIMARY KEY,
    playerid     BIGINT    NOT NULL,
    moment_date  DATE      NOT NULL,
    title        TEXT      NOT NULL CHECK (title <> ''),
    description  TEXT,
    category     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. player_moment_photos  (join table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_moment_photos (
    id         BIGSERIAL PRIMARY KEY,
    moment_id  BIGINT NOT NULL REFERENCES public.player_moments(id) ON DELETE CASCADE,
    photo_id   BIGINT NOT NULL REFERENCES public.player_photos(id)  ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (moment_id, photo_id)
);

-- ============================================================
-- 5. player_photo_reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_photo_reviews (
    id              BIGSERIAL PRIMARY KEY,
    photo_id        BIGINT NOT NULL REFERENCES public.player_photos(id) ON DELETE CASCADE,
    reviewer_name   TEXT   NOT NULL CHECK (reviewer_name <> ''),
    reviewer_email  TEXT,
    review_status   TEXT   NOT NULL
                        CHECK (review_status IN ('approved', 'rejected', 'pending')),
    review_notes    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_player_external_ids_playerid
    ON public.player_external_ids (playerid);

CREATE INDEX IF NOT EXISTS idx_player_photos_playerid
    ON public.player_photos (playerid);

CREATE INDEX IF NOT EXISTS idx_player_photos_approval_visibility
    ON public.player_photos (playerid, approval_status, visibility_status);

CREATE INDEX IF NOT EXISTS idx_player_photos_photo_date
    ON public.player_photos (playerid, photo_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_player_moments_playerid
    ON public.player_moments (playerid);

CREATE INDEX IF NOT EXISTS idx_player_moment_photos_moment_id
    ON public.player_moment_photos (moment_id);

CREATE INDEX IF NOT EXISTS idx_player_moment_photos_photo_id
    ON public.player_moment_photos (photo_id);

CREATE INDEX IF NOT EXISTS idx_player_photo_reviews_photo_id
    ON public.player_photo_reviews (photo_id);

-- ============================================================
-- updated_at trigger function (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Attach triggers (idempotent via DO block)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_player_external_ids'
    ) THEN
        CREATE TRIGGER set_updated_at_player_external_ids
        BEFORE UPDATE ON public.player_external_ids
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_player_photos'
    ) THEN
        CREATE TRIGGER set_updated_at_player_photos
        BEFORE UPDATE ON public.player_photos
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_player_moments'
    ) THEN
        CREATE TRIGGER set_updated_at_player_moments
        BEFORE UPDATE ON public.player_moments
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_player_moment_photos'
    ) THEN
        CREATE TRIGGER set_updated_at_player_moment_photos
        BEFORE UPDATE ON public.player_moment_photos
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_player_photo_reviews'
    ) THEN
        CREATE TRIGGER set_updated_at_player_photo_reviews
        BEFORE UPDATE ON public.player_photo_reviews
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    END IF;
END $$;

-- ============================================================
-- Views
-- ============================================================

-- Primary photo: most recent approved+public photo per player
CREATE OR REPLACE VIEW public.v_player_primary_photo AS
SELECT DISTINCT ON (playerid)
    id              AS photo_id,
    playerid,
    s3_bucket,
    s3_key,
    file_name,
    mime_type,
    caption,
    photo_date,
    photo_year,
    approval_status,
    visibility_status,
    created_at
FROM public.player_photos
WHERE approval_status = 'approved'
  AND visibility_status = 'public'
ORDER BY playerid, photo_date DESC NULLS LAST, created_at DESC;

-- Timeline photos: all approved+public photos per player, newest first
CREATE OR REPLACE VIEW public.v_player_timeline_photos AS
SELECT
    id              AS photo_id,
    playerid,
    s3_bucket,
    s3_key,
    file_name,
    mime_type,
    caption,
    photo_date,
    photo_year,
    approval_status,
    visibility_status,
    created_at
FROM public.player_photos
WHERE approval_status = 'approved'
  AND visibility_status = 'public'
ORDER BY playerid, photo_date DESC NULLS LAST, created_at DESC;
