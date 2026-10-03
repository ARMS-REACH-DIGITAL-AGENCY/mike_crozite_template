// src/app/api/tips/missing-player/route.ts
// YAT?STATS — Fan missing player submission
// Writes to public.missing_player_submission

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const PLATFORM_SESSION_COOKIE = 'yat-platform-session';
const LEGACY_SESSION_COOKIE = 'yat-session';

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const playerName = String(body.player_name || '').trim();
  const schoolName = String(body.school_name || '').trim() || null;
  const rawGradYear = body.grad_year ? parseInt(String(body.grad_year), 10) : NaN;
  const gradYear = Number.isNaN(rawGradYear) ? null : rawGradYear;
  const position = String(body.position || '').trim() || null;
  const level = String(body.level || '').trim() || null;
  const currentTeam = String(body.current_team || '').trim() || null;
  let notes = String(body.notes || '').trim() || null;
  const hsid = String(body.hsid || session.homeHsid || '').trim() || null;

  if (!playerName) {
    return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
  }

  // Pack extra context into notes since the table has no dedicated columns
  const extras: string[] = [];
  if (schoolName) extras.push(`School: ${schoolName}`);
  if (position) extras.push(`Position: ${position}`);
  if (level) extras.push(`Level: ${level}`);
  if (currentTeam) extras.push(`Current team: ${currentTeam}`);
  if (extras.length) {
    notes = notes ? `${extras.join(' | ')} | ${notes}` : extras.join(' | ');
  }

  try {
    await query(
      `INSERT INTO public.missing_player_submission
        (hsid, player_name, grad_year, contact_id, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [hsid, playerName, gradYear, session.uid, notes]
    );
    return NextResponse.json({ ok: true, message: 'Thanks! We\'ll look into adding this player.' });
  } catch (err: any) {
    console.error('[tips/missing-player] insert failed:', err);
    return NextResponse.json(
      { error: `DB error: ${err?.message || 'Unknown'} (code: ${err?.code || 'none'})` },
      { status: 500 }
    );
  }
}
