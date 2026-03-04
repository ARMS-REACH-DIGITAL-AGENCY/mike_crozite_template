// src/lib/schoolAssets.ts

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// use the S3 placeholder you showed
const S3_SCHOOL_PLACEHOLDER = `${S3_BASE}/yatstats/ys_crest.svg`;

export function getSchoolCrestUrl(schoolId?: number | string) {
  if (!schoolId) return S3_SCHOOL_PLACEHOLDER;

  // if your school crests are PNGs by id, keep this:
  return `${S3_BASE}/schools/${schoolId}.png`;
}
