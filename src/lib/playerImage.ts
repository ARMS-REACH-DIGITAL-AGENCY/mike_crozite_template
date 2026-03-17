// src/lib/playerImage.ts
// Centralized player image URL generation.
//
// Rules:
//  - THEN (HS-era) images live at players/then/{id}.png  (PNG extension per S3 convention)
//  - NOW  (current)  images live at players/now/{id}.jpg  (JPG extension per S3 convention)
//  - The ONLY allowed fallback for a missing player image is the silhouette.
//  - Never substitute one player's image for another.
//
// Future canonical naming: {schoolId}_{playerId}_{year}_{type}
// where type is "HS" or a sequence number "01","02","03"...
// No behavior change yet — paths remain as-is until the data source changes.

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

/** URL for the player's HS-era (THEN) image. Extension is PNG per S3 convention. */
export function getPlayerThenImageUrl(playerId: string): string {
  return `${S3_BASE}/players/then/${playerId}.png`;
}

/** URL for the player's current-era (NOW) image. Extension is JPG per S3 convention. */
export function getPlayerNowImageUrl(playerId: string): string {
  return `${S3_BASE}/players/now/${playerId}.jpg`;
}

/**
 * Silhouette URL for use as the THEN-image fallback (front card / career strip left bookend).
 * This is the *only* allowed fallback — never substitute a NOW or alternate player image.
 */
export function getThenSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/then-pitcher-silhouette.png"
    : "/img/then-batter-silhouette.png";
}

/**
 * Silhouette URL for use as the NOW-image fallback (back card / career strip right bookend).
 * This is the *only* allowed fallback — never substitute a THEN or alternate player image.
 */
export function getNowSilhouetteUrl(isPitcher: boolean): string {
  return isPitcher
    ? "/img/now-pitcher-silhouette.png"
    : "/img/now-batter-silhouette.png";
}

/**
 * Generic player silhouette for contexts where THEN/NOW distinction is not required
 * (e.g. middle career-strip frames sourced from player_photos).
 */
export const PLAYER_SILHOUETTE_URL = "/img/player-silhouette.png";
