-- Migration 006: player_photos — image role, source, approval, and timeline flag
--
-- Adds explicit metadata columns so that image slot assignment is driven by
-- data, not by filename or S3 folder inference.
--
-- KEY DESIGN RULES (must match runtime selection logic in src/lib/db.ts):
--   • image_role controls which display slot an image fills.
--     Designated roles (slot-specific):
--       YATSTATS_FRONT — canonical flip-card front image (HS/THEN era)
--       LEFT_ANCHOR    — career strip left bookend
--       RIGHT_ANCHOR   — career strip right bookend
--       HEADSHOT       — back-card portrait image
--     General role:
--       TIMELINE       — appears in career strip middle frames only
--   • SOURCE is not a ROLE. image_source records who supplied the image.
--   • approval_status gates whether an image may be shown on the profile page.
--     Only APPROVED images are displayed; PENDING/REJECTED are suppressed.
--   • Changing which image fills a slot is a metadata update (image_role assignment),
--     NOT a file rename or silent S3 overwrite.
--   • show_on_pp_timeline drives which TIMELINE images appear in the career strip.
--     Designated slot images (LEFT_ANCHOR, RIGHT_ANCHOR, etc.) are NOT gated by
--     this flag — their role assignment controls their inclusion.
--
-- ALLOWED VALUES
--   image_role:   YATSTATS_FRONT | LEFT_ANCHOR | RIGHT_ANCHOR | HEADSHOT | TIMELINE
--   image_source: FAN | PLAYER | MLB | LICENSED | STAFF | SCHOOL | BOOSTER | IMPORT
--   approval_status: PENDING | APPROVED | REJECTED

-- ---------------------------------------------------------------------------
-- 1. Create player_photos if it does not already exist
--    (bootstrap; table is gracefully absent in production until now)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_photos (
    id           BIGSERIAL PRIMARY KEY,
    player_id    TEXT        NOT NULL,
    image_url    TEXT        NOT NULL,
    team_name    TEXT        NULL,
    season_year  TEXT        NULL,
    date_taken   DATE        NULL,
    level        TEXT        NULL,
    caption      TEXT        NULL
);

CREATE INDEX IF NOT EXISTS idx_player_photos_player_id
    ON player_photos (player_id);

-- ---------------------------------------------------------------------------
-- 2. Add new metadata columns
--    All ALTER TABLE ... ADD COLUMN IF NOT EXISTS are idempotent on re-run.
-- ---------------------------------------------------------------------------

-- Controls which display slot this image fills.
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS image_role TEXT NULL;

-- Records who/where the image came from.
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS image_source TEXT NULL;

-- Gates display: only APPROVED images appear in the profile UI.
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING';

-- Opt-in flag for career strip timeline frames (image_role = 'TIMELINE').
-- Designated slot images (LEFT_ANCHOR, RIGHT_ANCHOR, etc.) ignore this flag.
ALTER TABLE player_photos
    ADD COLUMN IF NOT EXISTS show_on_pp_timeline BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3. Indexes for the three runtime query patterns
-- ---------------------------------------------------------------------------

-- Pattern A: designated slot lookup
--   SELECT ... WHERE player_id = $1 AND image_role = $2 AND approval_status = 'APPROVED'
CREATE INDEX IF NOT EXISTS idx_player_photos_designated
    ON player_photos (player_id, image_role)
    WHERE approval_status = 'APPROVED';

-- Pattern B: timeline frames
--   SELECT ... WHERE player_id = $1 AND show_on_pp_timeline = true AND approval_status = 'APPROVED'
CREATE INDEX IF NOT EXISTS idx_player_photos_timeline
    ON player_photos (player_id)
    WHERE show_on_pp_timeline = TRUE AND approval_status = 'APPROVED';

-- ---------------------------------------------------------------------------
-- 4. Constraints (informational — checked at application layer too)
-- ---------------------------------------------------------------------------

ALTER TABLE player_photos
    DROP CONSTRAINT IF EXISTS chk_player_photos_image_role;
ALTER TABLE player_photos
    ADD CONSTRAINT chk_player_photos_image_role CHECK (
        image_role IS NULL OR image_role IN (
            'YATSTATS_FRONT', 'LEFT_ANCHOR', 'RIGHT_ANCHOR', 'HEADSHOT', 'TIMELINE'
        )
    );

ALTER TABLE player_photos
    DROP CONSTRAINT IF EXISTS chk_player_photos_image_source;
ALTER TABLE player_photos
    ADD CONSTRAINT chk_player_photos_image_source CHECK (
        image_source IS NULL OR image_source IN (
            'FAN', 'PLAYER', 'MLB', 'LICENSED', 'STAFF', 'SCHOOL', 'BOOSTER', 'IMPORT'
        )
    );

ALTER TABLE player_photos
    DROP CONSTRAINT IF EXISTS chk_player_photos_approval_status;
ALTER TABLE player_photos
    ADD CONSTRAINT chk_player_photos_approval_status CHECK (
        approval_status IN ('PENDING', 'APPROVED', 'REJECTED')
    );
