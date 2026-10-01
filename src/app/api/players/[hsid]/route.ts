import { NextResponse, type NextRequest } from 'next/server';
import { getActiveRosterByHsid, getFlipCardFrontStageByHsid } from '@/lib/db';

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function isHighSchoolLevel(row: Row) {
  return [
    row.level_label,
    row.display_level_label,
    row.level,
    row.highlevel,
    row.current_level,
    row.current_level_label,
  ].some((value) => {
    const level = text(value).toUpperCase();
    return level === 'HIGH SCHOOL' || level === 'HS';
  });
}

function isPitcherPosition(value: unknown) {
  const position = text(value).toUpperCase();
  if (!position) return false;
  return /(^|[^A-Z])(P|RHP|LHP|PITCHER)([^A-Z]|$)/.test(position);
}

/**
 * The Fantasy roster is the visible Active Baseball Alumni flip-card roster.
 *
 * Membership MUST come from flip_card_front_stage, not from the 2026 stat
 * feeds. A player can have a live flip card and zero stats for the preview
 * season (new graduate, redshirt, injured player, future 2027 roster, etc.).
 * Stats are only an overlay for players who have them.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  try {
    const [stageRowsRaw, statsRowsRaw] = await Promise.all([
      getFlipCardFrontStageByHsid(hsid),
      getActiveRosterByHsid(hsid),
    ]);

    const stageRows = (Array.isArray(stageRowsRaw) ? stageRowsRaw : []) as Row[];
    const statsRows = (Array.isArray(statsRowsRaw) ? statsRowsRaw : []) as Row[];
    const statsById = new Map(statsRows.map((row) => [text(row.playerid), row]));

    const roster = stageRows
      .filter((stage) => {
        const status = text(stage.status_label ?? stage.status).toUpperCase();
        return status !== 'RETIRED' && !isHighSchoolLevel(stage);
      })
      .map((stage) => {
        const id = text(stage.playerid);
        const stats = statsById.get(id);
        const level = text(
          stage.level_label ??
          stage.display_level_label ??
          stage.current_level_label ??
          stats?.level ??
          stats?.highlevel
        );
        const firstName = text(stage.first_name ?? stage.firstname ?? stats?.firstname);
        const lastName = text(stage.last_name ?? stage.lastname ?? stats?.lastname);
        const displayName =
          text(stage.display_name ?? stats?.display_name) ||
          [firstName, lastName].filter(Boolean).join(' ') ||
          id;
        const position = stage.position ?? stats?.position ?? null;
        const isPitcher =
          typeof stats?.is_pitcher === 'boolean'
            ? stats.is_pitcher
            : isPitcherPosition(position);

        return {
          playerid: id,
          display_name: displayName,
          firstname: firstName || null,
          lastname: lastName || null,
          level,
          position,
          is_pitcher: isPitcher,
          status_label: stage.status_label ?? stage.status ?? null,
          current_team_name: stage.current_team_name ?? null,
          current_org_or_conference_name: stage.current_org_or_conference_name ?? null,
          has_2026_stats: Boolean(stats),
        };
      })
      .sort((a, b) =>
        String(a.lastname || '').localeCompare(String(b.lastname || '')) ||
        String(a.firstname || '').localeCompare(String(b.firstname || '')) ||
        String(a.playerid).localeCompare(String(b.playerid))
      );

    return NextResponse.json(roster);
  } catch (error) {
    console.error('Failed to fetch fantasy roster', { hsid, error });
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
