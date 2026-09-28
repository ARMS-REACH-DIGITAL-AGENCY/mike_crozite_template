// src/lib/storyAssets.ts
// Where story photos live (S3), without pulling in the upload code.
export const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
export const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
}
