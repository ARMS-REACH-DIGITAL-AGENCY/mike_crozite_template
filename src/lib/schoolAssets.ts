// src/lib/schoolAssets.ts

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// Default placeholder for school crests
export const S3_SCHOOL_PLACEHOLDER = `${S3_BASE}/yatstats/yscrest.png`;

/**
 * Returns the dynamic S3 URL for a school's crest based on its hsid.
 * @param hsid The high school ID
 * @returns The S3 URL for the school's crest
 */
export function getSchoolCrestUrl(hsid?: string | number | null) {
  if (!hsid) return S3_SCHOOL_PLACEHOLDER;
  
  // School crests are stored in the 'schools/' prefix as {hsid}.png
  return `${S3_BASE}/schools/${hsid}.png`;
}
