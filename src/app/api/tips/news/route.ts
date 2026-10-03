// src/app/api/tips/news/route.ts
// YAT?STATS — Fan news tip submission
// Writes to public.news_tip_queue with intake_source='fan_drawer'

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const PLATFORM_SESSION_COOKIE = 'yat-platform-session';
const LEGACY_SESSION_COOKIE = 'yat-session';

async function getSessionUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw =
      cookieStore.get(PLATFORM_SESSION_COOKIE)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.uid || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUid();
  if (!uid) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const articleUrl = String(body.article_url || '').trim();
  const rawPlayerName = String(body.raw_player_name || '').trim() || null;
  const notes = String(body.notes || '').trim();
  const senderName = String(body.sender_name || '').trim() || null;

  if (!articleUrl) {
    return NextResponse.json({ error: 'Article URL is required' }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO public.news_tip_queue
        (intake_source, sender_name, sender_contact_id, raw_player_name, article_url, notes, status)
       VALUES ('fan_drawer', $1, $2, $3, $4, $5, 'new')`,
      [senderName, uid, rawPlayerName, articleUrl, notes || null]
    );
    return NextResponse.json({ ok: true, message: 'Thanks! Our team will review your tip.' });
  } catch (err) {
    console.error('[tips/news] insert failed:', err);
    return NextResponse.json({ error: 'Failed to save tip' }, { status: 500 });
  }
}
