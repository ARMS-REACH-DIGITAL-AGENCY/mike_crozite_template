import 'server-only';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { query } from '@/lib/tribune/db';
import { putPublicAsset } from '@/lib/stories';
import { storyAssetUrl } from '@/lib/storyAssets';
import { assertPublisherAccess, assertSponsorAccess, PartnerAccessError, type PartnerAccess } from './access';

export const PARTNER_ASSET_MAX_BYTES = 3 * 1024 * 1024;
export const PARTNER_ASSET_MAX_PIXELS = 24_000_000;
export type PartnerAssetKind = 'logo' | 'ad' | 'masthead' | 'notice' | 'card_front' | 'card_banner' | 'card_full';
export type PartnerAsset = {
  id: string;
  url: string;
  width: number;
  height: number;
  kind: PartnerAssetKind;
  sponsorId: string | null;
};

export function parsePartnerAssetKind(value: unknown): PartnerAssetKind {
  if (value === 'logo' || value === 'ad' || value === 'masthead' || value === 'notice' ||
      value === 'card_front' || value === 'card_banner' || value === 'card_full') return value;
  throw new PartnerAccessError(400, 'Choose a logo, ad, sponsor card, masthead, or publisher message image.');
}

/** Mastheads and publisher message art are publication-wide, never sponsor-owned. */
export function assertPartnerAssetAccess(
  access: PartnerAccess,
  kind: PartnerAssetKind,
  sponsorId: unknown,
): string | null {
  if (kind === 'masthead' || kind === 'notice') {
    assertPublisherAccess(access);
    if (sponsorId != null && sponsorId !== '') {
      throw new PartnerAccessError(400, 'Publication images cannot be assigned to a sponsor.');
    }
    return null;
  }
  return assertSponsorAccess(access, sponsorId);
}

export type NormalizedPartnerAsset = {
  body: Buffer;
  width: number;
  height: number;
  contentType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
};

/** Decode and re-encode raster pixels; originals, metadata, and animation are not published. */
export async function normalizePartnerAsset(
  input: Buffer,
  declaredType: string,
  kind: PartnerAssetKind,
): Promise<NormalizedPartnerAsset> {
  if (!input.length || input.length > PARTNER_ASSET_MAX_BYTES) {
    throw new PartnerAccessError(413, 'Choose an image no larger than 3 MB.');
  }
  const allowedTypes: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/webp': 'webp',
  };
  const expectedFormat = allowedTypes[declaredType.toLowerCase()];
  if (!expectedFormat) throw new PartnerAccessError(415, 'Upload a PNG, JPEG, or WebP image.');

  try {
    const image = sharp(input, { failOn: 'warning', limitInputPixels: PARTNER_ASSET_MAX_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat) {
      throw new PartnerAccessError(415, 'The file contents do not match its image type.');
    }
    if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000 ||
        metadata.width * metadata.height > PARTNER_ASSET_MAX_PIXELS) {
      throw new PartnerAccessError(400, 'Choose an image with no more than 24 million pixels or 12,000 pixels on either side.');
    }
    if ((metadata.pages || 1) > 1 || (metadata.delay?.length || 0) > 1) {
      throw new PartnerAccessError(400, 'Choose a still image instead of an animated image.');
    }
    // Keep the original aspect ratio and alpha. PNG remains broadly compatible
    // with email clients; opaque ad/message photographs can use smaller JPEGs.
    const png = metadata.hasAlpha || kind === 'logo' || kind === 'masthead';
    const resized = image.rotate().resize({
      width: kind === 'masthead' ? 2400 : 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    }).toColourspace('srgb');
    const encoded = await (png ? resized.png({ compressionLevel: 9 }) : resized.jpeg({ quality: 88, mozjpeg: true }))
      .toBuffer({ resolveWithObject: true });
    if (encoded.data.length > 8 * 1024 * 1024) {
      throw new PartnerAccessError(413, 'The normalized image is too large. Please choose a smaller image.');
    }
    return {
      body: encoded.data,
      width: encoded.info.width,
      height: encoded.info.height,
      contentType: png ? 'image/png' : 'image/jpeg',
      extension: png ? 'png' : 'jpg',
    };
  } catch (error) {
    if (error instanceof PartnerAccessError) throw error;
    throw new PartnerAccessError(400, 'That image could not be decoded safely. Please choose another PNG, JPEG, or WebP.');
  }
}

export async function storePartnerAsset(access: PartnerAccess, input: {
  kind: PartnerAssetKind;
  sponsorId?: unknown;
  body: Buffer;
  contentType: string;
}): Promise<PartnerAsset> {
  const sponsorId = assertPartnerAssetAccess(access, input.kind, input.sponsorId);
  if (sponsorId) {
    let exists: boolean;
    try {
      exists = (await query('SELECT id FROM public.sponsor_brands WHERE id = $1', [sponsorId])).rows.length > 0;
    } catch {
      throw new PartnerAccessError(503, 'Sponsor records are temporarily unavailable.');
    }
    if (!exists) throw new PartnerAccessError(404, 'That sponsor is no longer available.');
  }
  const normalized = await normalizePartnerAsset(input.body, input.contentType, input.kind);
  const id = randomUUID();
  const key = `partners/${sponsorId ? `sponsors/${sponsorId}` : 'publication'}/${input.kind}/${id}.${normalized.extension}`;
  const url = storyAssetUrl(key);
  if (!url) throw new PartnerAccessError(503, 'Image storage is not configured yet.');
  try {
    await putPublicAsset(key, normalized.body, normalized.contentType);
    await query(
      `INSERT INTO tribune_private.partner_portal_assets
         (id, sponsor_id, kind, url, width, height, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, sponsorId, input.kind, url, normalized.width, normalized.height, access.uid],
    );
  } catch {
    // A failed record write leaves an unassigned immutable object, never an
    // active creative. Publishing always requires its authorized asset record.
    throw new PartnerAccessError(503, 'The image could not be saved. Please try again.');
  }
  return { id, url, width: normalized.width, height: normalized.height, kind: input.kind, sponsorId };
}
