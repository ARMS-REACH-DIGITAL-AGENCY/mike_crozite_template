import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Read-only prefill from the actual flip_card_front_stage record. Do not use
// user-supplied names or class years as authoritative player identifiers.
export async function GET(req: NextRequest) {
  const playerId = String(req.nextUrl.searchParams.get('playerId') || '').trim();
  if (!/^(?:YAT)?[0-9]{1,18}$/i.test(playerId)) {
    return NextResponse.json({ error: 'Select a player.' }, { status: 400 });
  }
  try {
    const { rows } = await query<{
      first_name:string|null; last_name:string|null; class_of:string|null;
      roster_years:string[]|null; status_label:string|null; level_label:string|null;
      position:string|null; current_team_name:string|null;
      hsid:string|null;
    }>(`SELECT first_name, last_name, class_of, roster_years,
      coalesce(display_status_label,status_label) AS status_label,
      coalesce(display_level_label,level_label) AS level_label,
      position, current_team_name, hsid
      FROM flip_card_front_stage WHERE playerid = $1 LIMIT 1`, [playerId]);
    if (!rows[0]) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    return NextResponse.json({ player: rows[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[player-fields] prefill failed', error);
    return NextResponse.json({ error: 'Player details are unavailable.' }, { status: 500 });
  }
}
