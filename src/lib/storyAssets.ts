// src/lib/storyAssets.ts
// Where story photos live (S3), without pulling in the upload code.
export const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
export const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

// Team logo paths all use the shared identity resolver, including newly
// published historical artwork. No forever-fallback lists or successor swaps.
import { teamLogoIdFromAssetKey, teamLogoPath } from '@/lib/teamLogo';

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const id = teamLogoIdFromAssetKey(key);
  if (id) return `https://hamilton.az.yatstats.com${teamLogoPath(id)}`;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
}
