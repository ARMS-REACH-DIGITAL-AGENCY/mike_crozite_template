// src/lib/schoolAssets.ts

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

/**
 * Canonical same-origin fallback path for school crests.
 * Using a local path avoids CORB (Cross-Origin Read Blocking) that browsers
 * apply to cross-origin SVG/image responses lacking proper CORS headers.
 * This is served directly by Next.js from public/img/ on all domains,
 * including custom subdomains (middleware already guards static assets).
 */
export const CREST_FALLBACK_PATH = "/img/school-placeholder.png";

/**
 * Returns the dynamic S3 URL for a school's crest based on its hsid.
 * @param hsid The high school ID
 * @returns The S3 URL for the school's crest
 */
export function getSchoolCrestUrl(hsid?: string | number | null) {
  if (!hsid) return CREST_FALLBACK_PATH;
  
  // School crests are stored in the 'schools/' prefix as {hsid}.png
  return `${S3_BASE}/schools/${hsid}.png`;
}
