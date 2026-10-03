// src/app/api/tips/correction/route.ts
// YAT?STATS — Fan correction report
// Writes to public.news_tip_queue with intake_source='correction'

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

  const correctionType = String(body.correction_type || 'other').trim();
  const rawPlayerName = String(body.raw_player_name || '').trim() || null;
  const rawPidC = body.playerid ? parseInt(String(body.playerid), 10) : NaN;
  const playerid = Number.isNaN(rawPidC) ? null : rawPidC;
  const matchedHsid = String(body.matched_hsid || '').trim() || null;
  const correction = String(body.correction || '').trim();
  const pageUrl = String(body.page_url || '').trim() || null;
  const senderName = String(body.sender_name || '').trim() || null;

  if (!correction) {
    return NextResponse.json({ error: 'Please describe the correction' }, { status: 400 });
  }

  const notes = `[${correctionType}] ${correction}`;

  try {
    await query(
      `INSERT INTO public.news_tip_queue
        (intake_source, sender_name, sender_contact_id, raw_player_name,
         matched_playerid, matched_hsid, article_url, notes, status)
       VALUES ('correction', $1, $2, $3, $4, $5, $6, $7, 'new')`,
      [senderName, uid, rawPlayerName, playerid, matchedHsid, pageUrl, notes]
    );
    return NextResponse.json({ ok: true, message: 'Thanks! We\'ll review your correction.' });
  } catch (err) {
    console.error('[tips/correction] insert failed:', err);
    return NextResponse.json({ error: 'Failed to save correction' }, { status: 500 });
  }
}
