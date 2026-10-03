// src/app/api/upload/image/route.ts
// YAT?STATS — Fan/school image upload intake
// Accepts multipart upload, records to public.media_upload with status='pending'
// TODO: Wire S3 upload — currently records metadata; file storage to S3 pending
// credentials. The media_upload row lets the team review and process manually.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const PLATFORM_SESSION_COOKIE = 'yat-platform-session';
const LEGACY_SESSION_COOKIE = 'yat-session';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function getSession(): Promise<{ uid: string; homeHsid: string | null } | null> {
  try {
    const cookieStore = await cookies();
    const raw =
      cookieStore.get(PLATFORM_SESSION_COOKIE)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.uid) return null;
    return { uid: session.uid, homeHsid: session.homeHsid || null };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const category = String(formData.get('category') || '').trim(); // 'school' | 'player'
  const playerid = formData.get('playerid') ? String(formData.get('playerid')) : null;
  const hsid = String(formData.get('hsid') || session.homeHsid || '').trim() || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!['school', 'player'].includes(category)) {
    return NextResponse.json({ error: 'Category must be school or player' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF allowed' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  // TODO: Upload to S3 and get real s3_key. For now, record as pending with
  // a placeholder key so the review team can process the queue.
  const uploadId = randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const s3Key = `pending/${uploadId}.${ext}`;

  try {
    await query(
      `INSERT INTO public.media_upload
        (id, playerid, hsid, category, s3_key, uploaded_by, status, mime_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
      [
        uploadId,
        playerid ? parseInt(playerid, 10) : null,
        hsid,
        category,
        s3Key,
        session.uid,
        file.type,
        file.size,
      ]
    );
    return NextResponse.json({
      ok: true,
      message: 'Thanks! Our team will review your photo.',
      upload_id: uploadId,
    });
  } catch (err) {
    console.error('[upload/image] insert failed:', err);
    return NextResponse.json({ error: 'Failed to save upload' }, { status: 500 });
  }
}
