import { NextResponse, type NextRequest } from 'next/server';
import { getFlipCardFrontStageByHsid, query } from '@/lib/db';
import { isRosterStatus } from '@/lib/galleryStatuses';

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

type SeasonLogUsage = { yatid: string; has_batting: boolean; has_pitching: boolean };

/** One indexed lookup for the whole roster; statistics do not determine membership. */
async function getRosterGameLogUsage(yatIds: string[]) {
  const usage = new Map<string, SeasonLogUsage>();
  if (!yatIds.length) return usage;
  try {
    const { rows } = await query<SeasonLogUsage>(
      `SELECT yatid, BOOL_OR(stat_type='batting') AS has_batting,
                      BOOL_OR(stat_type='pitching') AS has_pitching
         FROM public.player_game_logs
        WHERE yatid=ANY($1::text[])
          AND game_date >= DATE '2026-01-01'
          AND game_date < DATE '2027-01-01'
          AND stat_type IN ('batting','pitching')
        GROUP BY yatid`,
      [yatIds],
    );
    for (const row of rows) usage.set(text(row.yatid), row);
  } catch (error) {
    // Stats are optional. Never make an authoritative, published player
    // disappear from the Stat Ledger because a game-log lookup timed out.
    console.warn('[fantasy-roster] game-log role lookup unavailable', { error });
  }
  return usage;
}

function roleFromPosition(position: unknown) {
  const value = text(position).toUpperCase();
  return {
    isPitcher: isPitcherPosition(value),
    isTwoWay: /(?:^|[^A-Z])(?:H[-/]P|P[-/]H|TWO[- ]?WAY)(?:$|[^A-Z])/.test(value),
  };
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
    // The bracket asks for roster MEMBERSHIP, not the expensive season
    // aggregation used by the flip cards. A page can render dozens of
    // opponents: running getActiveRosterByHsid here exhausted the DB pool.
    // Read the same school-scoped published gallery used by Active Alumni.
    const stageRowsRaw = await getFlipCardFrontStageByHsid(hsid);
    const stageRows = (Array.isArray(stageRowsRaw) ? stageRowsRaw : []) as Row[];
    const eligible = stageRows.filter(
      (stage) => isRosterStatus(stage.status_label ?? stage.status) && !isHighSchoolLevel(stage)
    );
    const yatIds = [...new Set(eligible.map((r) => text(r.yatid)).filter(Boolean))];
    const gameLogUsage = await getRosterGameLogUsage(yatIds);

    // Team logos are keyed by our (Baseball Cube) team id. A pro whose current
    // team came from the MLB feed has MLB's team id in
    // current_team_source_team_id, which the roster refresh keeps current
    // (current_teamid is not refreshed and goes stale after a trade or a
    // promotion: Brent Suter, a Brave, still had the Angels' 108). Translate it
    // through team_id_map; college and other ids pass through as they are.
    const mlbTeamId = (r: Row) => text(r.current_team_source_team_id) || text(r.current_teamid);
    const mlbIds = [...new Set(stageRows
      .filter((r) => text(r.current_team_source) === 'mlb_api' && /^\d+$/.test(mlbTeamId(r)))
      .map(mlbTeamId))];
    const tbcOfMlb = new Map<string, string>();
    if (mlbIds.length) {
      try {
        const { rows } = await query<{ mlb: string; tbc: string }>(
          'SELECT mlb_stats_api_id::text AS mlb, tbc_teamid::text AS tbc FROM team_id_map WHERE mlb_stats_api_id::text = ANY($1)',
          [mlbIds],
        );
        for (const r of rows) tbcOfMlb.set(r.mlb, r.tbc);
      } catch { /* no logos is fine */ }
    }
    const logoTeamId = (r: Row) => {
      if (text(r.current_team_source) === 'mlb_api') return tbcOfMlb.get(mlbTeamId(r)) ?? null;
      return text(r.current_teamid) || null;
    };

    const roster = eligible
      .map((stage) => {
        const id = text(stage.playerid);
        const season = gameLogUsage.get(text(stage.yatid));
        const inferredRole = roleFromPosition(stage.position);
        const level = text(
          stage.level_label ??
          stage.display_level_label ??
          stage.current_level_label ??
          stage.current_team_level
        );
        const firstName = text(stage.first_name ?? stage.firstname);
        const lastName = text(stage.last_name ?? stage.lastname);
        const displayName =
          text(stage.display_name) ||
          [firstName, lastName].filter(Boolean).join(' ') ||
          id;
        const position = stage.position ?? null;
        const hasBatting = season?.has_batting === true;
        const hasPitching = season?.has_pitching === true;
        const isTwoWay = (hasBatting && hasPitching) || inferredRole.isTwoWay;
        const isPitcher = hasPitching && !hasBatting ? true
          : hasBatting && !hasPitching ? false : inferredRole.isPitcher;

        return {
          playerid: id, // Historical gameplay/source key; never silently renumber.
          yatid: text(stage.yatid) || null, // Permanent YAT identity for integrations.
          display_name: displayName,
          firstname: firstName || null,
          lastname: lastName || null,
          level,
          position,
          is_pitcher: isPitcher,
          has_batting_2026: hasBatting,
          has_pitching_2026: hasPitching,
          is_two_way_2026: isTwoWay,
          status_label: stage.status_label ?? stage.status ?? null,
          current_team_name: stage.current_team_name ?? null,
          // Our (Baseball Cube) team id: the team logo in the stat drawer.
          current_teamid: logoTeamId(stage),
          current_org_or_conference_name: stage.current_org_or_conference_name ?? null,
          has_2026_stats: Boolean(season),
        };
      })
      .sort((a, b) =>
        String(a.lastname || '').localeCompare(String(b.lastname || '')) ||
        String(a.firstname || '').localeCompare(String(b.firstname || '')) ||
        String(a.playerid).localeCompare(String(b.playerid))
      );

    return NextResponse.json(roster, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Failed to fetch fantasy roster', { hsid, error });
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
