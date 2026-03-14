// src/lib/headshot.ts
// Utilities for resolving the official player headshot URL.
//
// Image usage map (per product spec):
//   flip_back_image / flip_link_strip_image
//     → resolveHeadshotUrl()  →  1:1 square crop
//     Source priority:
//       1. player_headshots.headshot_url  (college SideArm / Presto / manual)
//       2. MLB CDN constructed from player_source_map (source='mlb_api')
//       3. S3 fallback  players/mugs/{playerid}.jpg
//
//   flip_front_image (left career-strip anchor, flip card front)
//     → S3  players/then/{playerid}.png   (player's HS photo)
//
//   right_anchor_image (right career-strip anchor)
//     → S3  players/now/{playerid}.jpg    (most-recent "now" photo)
//
//   career_path_timeline photos
//     → player_photos DB table            (fan-uploaded, chronological)

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const MLB_CDN_BASE =
  "https://img.mlbstatic.com/mlb-photos/image/upload" +
  "/d_people:generic:headshot:67:current.png/w_213,q_auto:best" +
  "/v1/people";

/**
 * Build the MLB static CDN headshot URL for a given MLB Stats API person ID.
 * The ID can be found in player_source_map where source = 'mlb_api'.
 *
 * Example:
 *   mlbHeadshotUrl('687589')
 *   // → https://img.mlbstatic.com/.../v1/people/687589/headshot/67/current
 */
export function mlbHeadshotUrl(mlbPersonId: string | number): string {
  return `${MLB_CDN_BASE}/${mlbPersonId}/headshot/67/current`;
}

/**
 * Resolve the best available headshot URL for a player object.
 *
 * The player object is expected to have these optional fields (populated by
 * the DB roster queries via LEFT JOINs to player_source_map and
 * player_headshots):
 *   - headshot_url      TEXT   — explicit URL from player_headshots table
 *   - mlb_person_id     TEXT   — MLB Stats API person.id from player_source_map
 *   - playerid          TEXT   — canonical YAT?STATS ID (used for S3 fallback)
 *
 * Returns null when no playerid is available (caller should render silhouette).
 */
export function resolveHeadshotUrl(
  player: Record<string, unknown>
): string | null {
  // 1) Explicit URL stored in player_headshots (college / manual)
  const explicit = player.headshot_url;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }

  // 2) MLB CDN — derive from mlb_person_id (player_source_map, source='mlb_api')
  const mlbId = player.mlb_person_id;
  if (mlbId !== null && mlbId !== undefined && String(mlbId).trim()) {
    return mlbHeadshotUrl(String(mlbId).trim());
  }

  // 3) S3 fallback — the legacy "mugs" bucket path
  const pid = player.playerid;
  if (typeof pid === "string" && pid.trim()) {
    return `${S3_BASE}/players/mugs/${pid.trim()}.jpg`;
  }

  return null;
}
