import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { PLAYER_ID } from '@/lib/contribute';

// Public-only fields from the same materialized gallery source that
// PlayerCardFront receives. Never expose raw stage rows to the browser.
const PUBLIC_KEYS = [
  'playerid','hsid','first_name','last_name','firstname','lastname',
  'display_name','class_of','roster_years','status_label',
  'display_status_label','level_label','display_level_label',
  'current_team_name','current_org_or_conference_name',
  'previous_team_name','previous_org_or_conference_name',
  'team_affiliation_status','last_transaction_type',
  'last_transaction_date','position','bats','throws','is_pitcher',
  'is_active_2025','is_on_40man','forty_man_org_name',
  'forty_man_org_abbr','committed_team_name',
  'next_game_status_label','next_game_date','next_game_home_away',
  'next_game_opponent','next_game_time_local','next_game_time_utc',
  'next_game_time_zone','school_time_zone','school_timezone',
];

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get('playerId') || '').trim();
  if (!PLAYER_ID.test(id))
    return NextResponse.json({error:'Invalid player'}, {status:400});
  const hsid = String(req.nextUrl.searchParams.get('hsid') || '').trim();
  try {
    const {rows} = await query<{published:Record<string,unknown>}>(
      `SELECT to_jsonb(f) AS published
       FROM flip_card_front_stage f
       WHERE f.playerid::text = $1
       ORDER BY (f.hsid::text = $2) DESC
       LIMIT 1`,
      [id, hsid]
    );
    if (!rows.length) return NextResponse.json({error:'Player not found'}, {status:404});
    const raw = rows[0].published;
    const player:Record<string,unknown> = {};
    for (const key of PUBLIC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw,key)) player[key] = raw[key];
    }
    // The real gallery expects these canonical name keys.
    player.firstname = player.firstname || player.first_name || '';
    player.lastname = player.lastname || player.last_name || '';
    return NextResponse.json({player}, {headers:{'Cache-Control':'private, max-age=30'}});
  } catch (error) {
    console.error('[contribute/card-preview] could not read public stage', error);
    return NextResponse.json({error:'Preview unavailable'}, {status:500});
  }
}
