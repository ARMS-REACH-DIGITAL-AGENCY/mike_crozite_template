// src/lib/storyAssets.ts
// Where story photos live (S3), without pulling in the upload code.
export const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
export const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

// Historical Oakland Athletics Draft Day stories retain their actual TBC
// team ID (21) in the database, including after importer refreshes. The
// corresponding public images are missing, but the same Athletics franchise
// artwork exists under ID 37. Resolve only these two story-photo keys at
// read time so import refreshes cannot bring back broken images.
// Do not modify historical team IDs, draft details, or other team assets.
const STORY_LOGO_ASSET_ALIASES: Readonly<Record<string, string>> = {
  'teams/21.png': 'teams/37.png',
  'teams-web/21.webp': 'teams-web/37.webp',
};

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const assetKey = STORY_LOGO_ASSET_ALIASES[key] || key;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${assetKey.split('/').map(encodeURIComponent).join('/')}`;
}
