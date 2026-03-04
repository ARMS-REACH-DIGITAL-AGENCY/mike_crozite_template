// src/lib/schoolAssets.ts

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com"

export function getSchoolCrestUrl(schoolId?: number | string) {
  if (!schoolId) return "/school-placeholder.png.png"

  return `${S3_BASE}/schools/${schoolId}.png`
}
