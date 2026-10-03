// src/app/api/upload/image/route.ts
// YAT?STATS — Fan/school image upload intake
// Accepts multipart upload, records to public.media_upload with status='pending'
// TODO: Wire S3 upload — currently records metadata; file storage to S3 pending
// credentials. The media_upload row lets the team review and process manually.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { randomUUID } from 'crypto';
import { storeStoryPhoto, NotAnImageError } from '@/lib/stories';

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
  const playerName = String(formData.get('player_name') || '').trim() || null;
  const schoolName = String(formData.get('school_name') || '').trim() || null;
  const description = String(formData.get('description') || '').trim() || null;
  const purpose = String(formData.get('purpose') || 'other').trim();
  const teamAtTime = String(formData.get('team_at_time') || '').trim() || null;
  const dateTaken = String(formData.get('date_taken') || '').trim() || null;
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

  // Store the photo in S3 (stripped of metadata, resized to 3 sizes)
  // using the platform's existing photo pipeline
  const uploadId = randomUUID();
  let stored;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    stored = await storeStoryPhoto(`fan-uploads/${uploadId}`, 0, buffer);
  } catch (err: any) {
    if (err instanceof NotAnImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[upload/image] S3 store failed:', err);
    return NextResponse.json(
      { error: `Photo storage failed: ${err?.message || 'Unknown'}` },
      { status: 500 }
    );
  }

  try {
    // playerid is TEXT format (e.g. "YAT000072" or "195486") — pass through as-is
    const safePlayerid = playerid ? String(playerid).trim() || null : null;

    await query(
      `INSERT INTO public.media_upload
        (id, playerid, hsid, category, s3_key, date_taken, status, mime_type, file_size_bytes,
         purpose, description, team_at_time)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11)`,
      [
        uploadId,
        safePlayerid,
        hsid,
        category,
        stored.s3_key,
        dateTaken || null,
        stored.mime_type,
        stored.file_size_bytes,
        purpose || null,
        description || null,
        teamAtTime || null,
      ]
    );
    // Log context for review team until columns are added
    // Note: uploaded_by is UUID type but we have Firebase UID string, so we
    // log the submitter UID here instead of the uploaded_by column
    console.log(`[upload/image] ${uploadId}: uploaded_by_uid=${session.uid} player=${playerName} school=${schoolName} purpose=${purpose} team_at_time=${teamAtTime} desc=${description}`);
    return NextResponse.json({
      ok: true,
      message: 'Thanks! Our team will review your photo.',
      upload_id: uploadId,
    });
  } catch (err: any) {
    console.error('[upload/image] insert failed:', err);
    return NextResponse.json(
      { error: `DB error: ${err?.message || 'Unknown'} (code: ${err?.code || 'none'})` },
      { status: 500 }
    );
  }
}
