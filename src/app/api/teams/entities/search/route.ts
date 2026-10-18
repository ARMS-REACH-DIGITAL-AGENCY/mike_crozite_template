import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 40), 1), 75);
    if (!q) return NextResponse.json({ teams: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const pattern = `%${q}%`;
    const { rows } = await query<{
      teamid: string;
      current_team_name: string | null;
      current_team_short_name: string | null;
      nickname: string | null;
      current_org_or_conference_name: string | null;
      current_org_or_conference_abbrev: string | null;
      level_label: string | null;
      locationlong: string | null;
    }>(
      `SELECT teamid::text, current_team_name, current_team_short_name, nickname,
              current_org_or_conference_name, current_org_or_conference_abbrev,
              level_label, locationlong
         FROM teamid_universe_mapping
        WHERE COALESCE(current_team_name, '') <> ''
          AND UPPER(COALESCE(level_label, '')) <> 'HIGH SCHOOL'
          AND (
            current_team_name ILIKE $1
            OR current_team_short_name ILIKE $1
            OR nickname ILIKE $1
            OR current_org_or_conference_name ILIKE $1
            OR current_org_or_conference_abbrev ILIKE $1
            OR locationlong ILIKE $1
            OR teamid::text = $2
          )
        ORDER BY
          CASE WHEN LOWER(current_team_name) = LOWER($3) THEN 0
               WHEN LOWER(COALESCE(current_team_short_name, '')) = LOWER($3) THEN 1
               WHEN current_team_name ILIKE $4 THEN 2
               ELSE 3 END,
          CASE
            WHEN level_label = 'MLB' THEN 0
            WHEN level_label = 'NCAA-D1' THEN 1
            WHEN level_label = 'NCAA-D2' THEN 2
            WHEN level_label = 'NCAA-D3' THEN 3
            WHEN level_label IN ('NJCAA','CCCAA','NWAC') THEN 4
            WHEN level_label = 'NAIA' THEN 5
            ELSE 6
          END,
          current_team_name,
          teamid
        LIMIT $5`,
      [pattern, q, q, `${q}%`, limit]
    );

    const teams = rows.map((r) => ({
      teamId: String(r.teamid || ''),
      name: String(r.current_team_name || ''),
      shortName: String(r.current_team_short_name || ''),
      nickname: String(r.nickname || ''),
      orgName: String(r.current_org_or_conference_name || ''),
      orgAbbrev: String(r.current_org_or_conference_abbrev || ''),
      level: String(r.level_label || ''),
      location: String(r.locationlong || ''),
      logoUrl: r.teamid ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/${encodeURIComponent(String(r.teamid))}.png` : '',
    }));

    return NextResponse.json({ teams }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[teams/entities/search] failed', error);
    return NextResponse.json({ error: 'Team search failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
