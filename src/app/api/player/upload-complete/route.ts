// src/app/api/player/upload-complete/route.ts
// Called after the client has finished uploading to S3.
// Inserts a row into public.player_photos with approval_status='pending',
// visibility_status='private', and usage_rights_status='user_submitted_consent'.
// POST /api/player/upload-complete

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';

const schema = z.object({
  playerid: z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform((v) => String(v)),
  s3_bucket: z.string().min(1),
  s3_key: z.string().min(1),
  file_name: z.string().min(1),
  original_file_name: z.string().min(1),
  mime_type: z.string().min(1),
  source_type: z.enum(['user', 'agency', 'scrapbook']),
  uploader_type: z.enum(['user', 'admin', 'coach']),
  uploaded_by_name: z.string().min(1),
  uploaded_by_email: z.string().email().optional(),
  photo_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  photo_year: z.number().int().min(1800).max(2100).optional(),
  date_precision: z.enum(['day', 'month', 'year', 'unknown']).default('unknown'),
  caption: z.string().max(1000).optional(),
  uploader_relationship: z
    .enum(['self', 'parent', 'sibling', 'relative', 'friend', 'no_relation'])
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);

    const result = await query<{ id: string }>(
      `INSERT INTO public.player_photos
        (playerid, s3_bucket, s3_key, file_name, original_file_name,
         mime_type, source_type, uploader_type, uploaded_by_name,
         uploaded_by_email, photo_date, photo_year, date_precision,
         caption, uploader_relationship,
         approval_status, visibility_status, usage_rights_status)
       VALUES
        ($1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15,
         'pending', 'private', 'user_submitted_consent')
       RETURNING id`,
      [
        params.playerid,
        params.s3_bucket,
        params.s3_key,
        params.file_name,
        params.original_file_name,
        params.mime_type,
        params.source_type,
        params.uploader_type,
        params.uploaded_by_name,
        params.uploaded_by_email ?? null,
        params.photo_date ?? null,
        params.photo_year ?? null,
        params.date_precision,
        params.caption ?? null,
        params.uploader_relationship ?? null,
      ]
    );

    return NextResponse.json({ success: true, photo_id: result.rows[0].id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('[upload-complete] error:', error);
    return NextResponse.json({ error: 'Upload completion failed' }, { status: 500 });
  }
}
