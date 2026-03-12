// src/app/api/player/upload-presigned/route.ts
// Returns a presigned S3 PUT URL so the client can upload directly to S3.
// POST /api/player/upload-presigned
// Body: { playerid, fileName, mimeType, uploadType }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const schema = z.object({
  playerid: z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform((v) => String(v)),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().refine((v) => ALLOWED_MIME_TYPES.has(v), {
    message: 'Unsupported MIME type. Allowed: jpeg, png, gif, webp, heic, heif',
  }),
  uploadType: z.enum(['photo', 'moment', 'scrapbook']),
});

const BUCKET = process.env.S3_BUCKET!;
const REGION = process.env.S3_REGION ?? 'us-east-1';
// Presigned URL validity window (seconds)
const EXPIRES_IN = 600;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);

    // Extract, validate, and sanitise extension
    const extMatch = params.fileName.match(/\.([a-zA-Z0-9]+)$/);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      return NextResponse.json(
        { error: `Unsupported file extension. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
        { status: 400 }
      );
    }
    const ext = rawExt;

    const dateStr = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
    const random = randomUUID().replace(/-/g, '').slice(0, 8);
    const s3Key = `players/${params.playerid}/submitted/${dateStr}_${random}.${ext}`;

    if (!BUCKET) {
      return NextResponse.json(
        { error: 'S3 bucket is not configured' },
        { status: 500 }
      );
    }

    const s3 = new S3Client({ region: REGION });
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: params.mimeType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });

    return NextResponse.json({ uploadUrl, s3Key, bucket: BUCKET });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('[upload-presigned] error:', error);
    return NextResponse.json({ error: 'Upload setup failed' }, { status: 500 });
  }
}
