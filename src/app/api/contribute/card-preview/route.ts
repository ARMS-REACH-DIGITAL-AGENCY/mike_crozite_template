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
  'level','height','weight','is_pitcher','g','pg','avg','ab','h','obp',
  'r','bb','slg','hr','rbi','ops','sb','ip','er','era','ko','whip',
  'so9','bb9','so_bb','w','l','saves','has_2026_stats',
  'stat_year','pitch_year','season_batting_buckets','season_pitching_buckets',
  'career_batting_buckets','career_pitching_buckets',
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
    // Match the gallery's real merged stage + roster data. Pull only
    // the chosen player's cached roster row; never return full rosters.
    let gallery: Record<string,unknown> | null = null;
    const galleryHsid = String(raw.hsid || hsid || '');
    if (/^\\d+$/.test(galleryHsid)) {
      try {
        const {getAllTimeRosterByHsid} = await import('@/lib/db');
        const roster = await getAllTimeRosterByHsid(galleryHsid);
        gallery = (Array.isArray(roster) ? roster : []).find((p) =>
          String((p as Record<string,unknown>).playerid || '') === id
        ) as Record<string,unknown> || null;
      } catch { /* Gallery data may be unavailable; stage is still valid. */ }
    }
    const merged = {...raw,...(gallery || {})};
    const player:Record<string,unknown> = {};
    for (const key of PUBLIC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(merged,key)) player[key] = merged[key];
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
