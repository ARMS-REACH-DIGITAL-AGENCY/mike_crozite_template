// src/lib/storyAssets.ts
// Where story photos live (S3), without pulling in the upload code.
export const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
export const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

// The imported Oakland Athletics Draft Day stories reference TBC team 21.
// Those two S3 objects are unavailable (HTTP 403 on Nov 5, 2026); the
// Athletics franchise logo for team 37 is present (HTTP 200).
// Keep the historic story/DB team ID unchanged and use the available image.
// Restrict the alias to the two known photo keys, never all team ID 21 data.
const STORY_LOGO_ASSET_ALIASES: Readonly<Record<string, string>> = {
  'teams/21.png': 'teams/37.png',
  'teams-web/21.webp': 'teams-web/37.webp',
};

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const assetKey = STORY_LOGO_ASSET_ALIASES[key] || key;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${assetKey.split('/').map(encodeURIComponent).join('/')}`;
}
