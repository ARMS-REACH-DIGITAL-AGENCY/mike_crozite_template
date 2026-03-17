// src/lib/playerImage.ts
// Centralized player image URL generation — single source of truth for all player image consumers.
//
// ─────────────────────────────────────────────────────────────────────────────
// IMAGE BEHAVIOR RULES (enforced here and by all consumers)
// ─────────────────────────────────────────────────────────────────────────────
//  1. The ONLY allowed fallback for a missing player image is a silhouette.
//  2. Never substitute one player's image for another.
//  3. Front card (YATSTATS_FRONT role) must not fall back to any alternate player image.
//  4. Back card  (HEADSHOT role) must not fall back to any alternate player image.
//  5. Career strip anchors (LEFT_ANCHOR / RIGHT_ANCHOR) must not fall back to another image.
//  6. Each display slot must be EXPLICITLY DESIGNATED — never assumed from legacy path location.
//
// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY SLOTS — what drives each one
// ─────────────────────────────────────────────────────────────────────────────
//
//  Slot              | Source                                          | Fallback
//  ──────────────────┼─────────────────────────────────────────────────┼─────────
//  FRONT FLIP CARD   | player_photos WHERE image_role='YATSTATS_FRONT' | legacy players/then/{imageId}.png
//  LEFT_ANCHOR       | player_photos WHERE image_role='LEFT_ANCHOR'    | legacy players/then/{imageId}.png
//  RIGHT_ANCHOR      | player_photos WHERE image_role='RIGHT_ANCHOR'   | silhouette ONLY
//  HEADSHOT          | player_photos WHERE image_role='HEADSHOT'       | silhouette ONLY
//  TIMELINE frames   | player_photos WHERE show_on_pp_timeline=true    | generic silhouette per frame
//                    |   AND approval_status='APPROVED'                |
//
//  IMPORTANT: players/now/{imageId}.jpg is a LEGACY PATH for general/timeline images.
//  It is NOT a designated HEADSHOT. Do NOT use it as the back-card image.
//
// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL NAMING CONVENTION
// ─────────────────────────────────────────────────────────────────────────────
// Canonical DESIGNATED images (role-prefixed, identifies the intended display slot):
//   {role}_{hsid}_{imageId}[_{source}][_{level}][_{year}][_{month}][_{day}][_{seq}]
//
//   Supported designated roles:
//     YATSTATS_FRONT — canonical flip-card front image (HS/THEN era)
//     LEFT_ANCHOR    — career strip left bookend
//     RIGHT_ANCHOR   — career strip right bookend
//     HEADSHOT       — back-card portrait image
//
//   Examples:
//     YATSTATS_FRONT_5006_213884_PLAYER_HS_2017_month_day
//     HEADSHOT_5006_213884_MLB_MLB_2024_month_day
//
// General NON-DESIGNATED images (no role prefix):
//   {hsid}_{imageId}[_{source}][_{level}][_{year}][_{month}][_{day}][_{seq}]
//
//   Examples:
//     5006_213884_PLAYER_HS_2017_month_day
//     5006_213884_MLB_MLB_2024_month_day
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS WIRED NOW vs. DEFERRED
// ─────────────────────────────────────────────────────────────────────────────
// WIRED NOW (current S3 paths, active in production):
//   players/then/{imageId}.png  — HS-era legacy path used as LEFT_ANCHOR / FRONT fallback
//                                  (NOT canonical YATSTATS_FRONT — that lookup hits player_photos)
//
// LEGACY PATH — do NOT treat as designated HEADSHOT or RIGHT_ANCHOR:
//   players/now/{imageId}.jpg   — general/timeline candidate only; carries no slot designation
//
// DEFERRED (canonical naming not yet wired — upstream S3 key structure unchanged):
//   The role-prefixed canonical filenames above (YATSTATS_FRONT_*, HEADSHOT_*, etc.)
//   are the target naming format once the upload pipeline is updated.
//   No path generation in this file uses that format yet. When player_photos rows with
//   the correct image_role are present, getDesignatedPlayerImage() in db.ts will return
//   them and the legacy path fallback below will not be reached.
// ─────────────────────────────────────────────────────────────────────────────

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// ─── LEGACY WIRED PATHS ───────────────────────────────────────────────────────

/**
 * Legacy S3 path for the player's HS-era image — used as LEFT_ANCHOR and FRONT FLIP CARD
 * fallback when no designated player_photos row exists.
 *
 * Extension: PNG (S3 stores these as PNG — using .jpg causes a guaranteed 404).
 *
 * This is NOT the canonical YATSTATS_FRONT path; it is the current S3 reality.
 * When player_photos rows with image_role='LEFT_ANCHOR' or 'YATSTATS_FRONT' are present,
 * getDesignatedPlayerImage() will be preferred over this path.
 *
 * If this image is missing, use getThenSilhouetteUrl() — no alternate player image.
 */
export function getPlayerThenImageUrl(imageId: string): string {
  return `${S3_BASE}/players/then/${imageId}.png`;
}

/**
 * Legacy S3 path for the player's general/current-era image.
 *
 * IMPORTANT: This is NOT a designated HEADSHOT and must NOT be used as the back-card image.
 * Legacy NOW images are general/timeline/right-anchor candidates — NOT canonical HEADSHOTs.
 * A true back-card HEADSHOT must come from player_photos WHERE image_role='HEADSHOT'.
 * If no designated HEADSHOT exists, the back card must show a silhouette.
 *
 * This function is retained for timeline/general use (e.g. legacy middle-frame display).
 * Do NOT pass its result to PlayerCardBack as the headshot.
 */
export function getPlayerNowImageUrl(imageId: string): string {
  return `${S3_BASE}/players/now/${imageId}.jpg`;
}

// ─── DEFERRED — canonical role-prefixed paths (not yet wired) ─────────────────
// Uncomment and wire these once the upstream data source provides canonical image IDs
// with the role-prefixed naming format.
//
// export function getYatstatsFrontImageUrl(hsid: string, imageId: string): string {
//   // e.g. YATSTATS_FRONT_5006_213884_PLAYER_HS_2017_month_day
//   return `${S3_BASE}/players/designated/YATSTATS_FRONT_${hsid}_${imageId}`;
// }
//
// export function getHeadshotImageUrl(hsid: string, imageId: string): string {
//   // e.g. HEADSHOT_5006_213884_MLB_MLB_2024_month_day
//   return `${S3_BASE}/players/designated/HEADSHOT_${hsid}_${imageId}`;
// }

// ─── SILHOUETTES (always the only allowed fallback) ───────────────────────────

/**
 * Silhouette for the LEFT_ANCHOR / YATSTATS_FRONT slot (front card, career strip left bookend).
 * This is the ONLY allowed fallback when no designated image exists.
 * Never substitute a NOW image or alternate player image.
 */
export function getThenSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/then-pitcher-silhouette.png"
    : "/img/then-batter-silhouette.png";
}

/**
 * Silhouette for the HEADSHOT / RIGHT_ANCHOR slot (back card, career strip right bookend).
 * This is the ONLY allowed fallback when no designated HEADSHOT image exists.
 * Never substitute a legacy NOW/general image.
 */
export function getNowSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/now-pitcher-silhouette.png"
    : "/img/now-batter-silhouette.png";
}

/**
 * Generic player silhouette for career strip TIMELINE middle frames.
 * Used when a frame has no image_url or the image fails to load.
 * Must NOT affect FRONT / HEADSHOT / LEFT_ANCHOR / RIGHT_ANCHOR slot logic.
 */
export const PLAYER_SILHOUETTE_URL = "/img/player-silhouette.png";

