import { NextResponse, type NextRequest } from 'next/server';
import { getActiveRosterByHsid, getFlipCardFrontStageByHsid } from '@/lib/db';
import { isActiveGalleryStatus } from '@/lib/galleryStatuses';

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
 * The Fantasy roster is exactly the Active Baseball Alumni flip-card
 * gallery: the school's flip_card_front_stage rows whose status is ACTIVE or
 * one of the injured-list statuses (the same list the gallery opens on,
 * src/lib/galleryStatuses.ts), not listed at the high-school level. Nothing
 * else - no commits, uncommitted, coaches, sponsors or blank statuses.
 *
 * A player can be on it with zero stats for the season (new graduate,
 * injured player...); stats are only an overlay for players who have them.
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
      .filter((stage) => isActiveGalleryStatus(stage.status_label ?? stage.status) && !isHighSchoolLevel(stage))
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
