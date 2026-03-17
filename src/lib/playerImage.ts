// src/lib/playerImage.ts
// Centralized player image URL generation — single source of truth for all player image consumers.
//
// ─────────────────────────────────────────────────────────────────────────────
// IMAGE BEHAVIOR RULES (enforced here and by all consumers)
// ─────────────────────────────────────────────────────────────────────────────
//  1. The ONLY allowed fallback for a missing player image is a silhouette.
//  2. Never substitute one player's image for another.
//  3. Front card (YATSTATS role) must not fall back to any alternate player image.
//  4. Back card  (HEADSHOT role) must not fall back to any alternate player image.
//  5. Career strip anchors must not fall back to any alternate player image.
//
// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL NAMING CONVENTION
// ─────────────────────────────────────────────────────────────────────────────
// Canonical DESIGNATED images (role-prefixed, identifies the intended display slot):
//   {role}_{hsid}_{imageId}[_{source}][_{level}][_{year}][_{month}][_{day}][_{seq}]
//
//   Supported roles:
//     YATSTATS  — canonical front flip-card image (HS/THEN era)
//     HEADSHOT  — canonical back-card image (NOW/current era)
//
//   Examples:
//     YATSTATS_5006_213884_PLAYER_HS_2017_month_day
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
//   players/then/{imageId}.png  — HS-era (YATSTATS role), PNG
//   players/now/{imageId}.jpg   — current-era (HEADSHOT role), JPG
//
// DEFERRED (canonical naming not yet wired — upstream S3 key structure unchanged):
//   The role-prefixed canonical filenames above (YATSTATS_*, HEADSHOT_*, etc.)
//   are the target naming format once the data source/S3 upload pipeline is updated.
//   No path generation in this file uses that format yet. When the data source
//   provides canonical image identifiers, update getYatStatsImageUrl and
//   getHeadshotImageUrl below and remove the legacy functions.
// ─────────────────────────────────────────────────────────────────────────────

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// ─── WIRED NOW ────────────────────────────────────────────────────────────────

/**
 * URL for the player's HS-era (THEN) image — maps to the YATSTATS canonical role.
 * Current S3 path: players/then/{imageId}.png (PNG, no exceptions).
 * If this image is missing, use getThenSilhouetteUrl() only — no alternate player image.
 */
export function getPlayerThenImageUrl(imageId: string): string {
  return `${S3_BASE}/players/then/${imageId}.png`;
}

/**
 * URL for the player's current-era (NOW) image — maps to the HEADSHOT canonical role.
 * Current S3 path: players/now/{imageId}.jpg (JPG, no exceptions).
 * If this image is missing, use getNowSilhouetteUrl() only — no alternate player image.
 */
export function getPlayerNowImageUrl(imageId: string): string {
  return `${S3_BASE}/players/now/${imageId}.jpg`;
}

// ─── DEFERRED — canonical role-prefixed paths (not yet wired) ─────────────────
// Uncomment and wire these once the upstream data source provides canonical image IDs.
//
// export function getYatStatsImageUrl(hsid: string, imageId: string, ...): string {
//   // e.g. YATSTATS_5006_213884_PLAYER_HS_2017_month_day
//   return `${S3_BASE}/players/designated/YATSTATS_${hsid}_${imageId}_...`;
// }
//
// export function getHeadshotImageUrl(hsid: string, imageId: string, ...): string {
//   // e.g. HEADSHOT_5006_213884_MLB_MLB_2024_month_day
//   return `${S3_BASE}/players/designated/HEADSHOT_${hsid}_${imageId}_...`;
// }

// ─── SILHOUETTES (always the only allowed fallback) ───────────────────────────

/**
 * Silhouette for the YATSTATS/THEN slot (front card, career strip left bookend).
 * This is the ONLY allowed fallback when the THEN image is missing.
 */
export function getThenSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/then-pitcher-silhouette.png"
    : "/img/then-batter-silhouette.png";
}

/**
 * Silhouette for the HEADSHOT/NOW slot (back card, career strip right bookend).
 * This is the ONLY allowed fallback when the NOW image is missing.
 */
export function getNowSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/now-pitcher-silhouette.png"
    : "/img/now-batter-silhouette.png";
}

/**
 * Generic player silhouette for career strip middle frames (player_photos source).
 * Used when a frame has no image_url or the image fails to load.
 */
export const PLAYER_SILHOUETTE_URL = "/img/player-silhouette.png";

