-- Migration 006: Player headshot URL storage
--
-- Stores the official player headshot URL for display on flip card backs and
-- the gallery thumbnail strip (flip_link_photo_strip).
--
-- Resolution priority in src/lib/headshot.ts:
--   1) headshot_url here (college/SideArm/Presto/manual explicit URL)
--   2) MLB CDN constructed from player_source_map where source='mlb_api'
--   3) S3 fallback at players/mugs/{playerid}.jpg
--
-- For MLB / MiLB players the explicit URL is usually left NULL and the CDN
-- URL is built on the fly from the mlb_api row in player_source_map:
--   https://img.mlbstatic.com/mlb-photos/image/upload/
--     d_people:generic:headshot:67:current.png/w_213,q_auto:best/
--     v1/people/{source_player_id}/headshot/67/current
--
-- For college players (SideArm Sports, Presto Sports, etc.) the full URL
-- must be stored here because it cannot be derived algorithmically.
--
-- headshot_source values:
--   'mlb_api'   — MLB/MiLB player; CDN URL derived from player_source_map
--   'sidearm'   — SideArm Sports college CDN
--   'presto'    — Presto Sports college CDN
--   'manual'    — manually supplied URL

CREATE TABLE IF NOT EXISTS player_headshots (
    playerid         TEXT        PRIMARY KEY,
    headshot_url     TEXT        NULL,   -- full explicit URL (null = derive from mlb_api)
    headshot_source  TEXT        NULL,   -- 'sidearm' | 'presto' | 'manual' | 'mlb_api'
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE player_headshots IS
  'Official player headshot URLs used on flip-card backs and the gallery thumbnail strip.';
