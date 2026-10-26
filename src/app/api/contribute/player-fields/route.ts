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
      position:string|null; current_team_name:string|null; current_teamid:string|null;
       current_org_or_conference_name:string|null;
      committed_teamid:string|null; committed_team_name:string|null;
      hsid:string|null;
    }>(`SELECT f.first_name, f.last_name, f.class_of, f.roster_years,
      COALESCE(NULLIF(TRIM(f.display_status_label),''),f.status_label) AS status_label,
      COALESCE(NULLIF(TRIM(f.display_level_label),''),f.level_label) AS level_label,
      f.position, f.current_team_name, f.current_teamid::text AS current_teamid,
       f.current_org_or_conference_name, f.hsid, f.committed_teamid,
      (SELECT u.current_team_name FROM teamid_universe_mapping u WHERE u.teamid=f.committed_teamid LIMIT 1) AS committed_team_name
      FROM flip_card_front_stage f WHERE f.playerid = $1 LIMIT 1`, [playerId]);
    if (!rows[0]) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    return NextResponse.json({ player: rows[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[player-fields] prefill failed', error);
    return NextResponse.json({ error: 'Player details are unavailable.' }, { status: 500 });
  }
}
