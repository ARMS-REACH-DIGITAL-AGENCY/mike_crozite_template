// src/lib/teammates.ts
// Everyone a player shared a roster with, as far as our data knows:
//   High school: players from the same school whose varsity years
//                (flip_card_front_stage.roster_years) overlap his.
//   College/pro: players with a stat line for the same team in the same
//                season (the TBC batting/pitching tables, 2026 included).
// Only players on the platform are in those tables, so every name has a
// profile; a name without a school (no hsid) is listed without a link.
import 'server-only';
import { query } from './db';
import { toPlayerSlug } from './slug';

export type Teammate = { playerId: string; name: string; href: string | null };
export type TeammateGroup = { key: string; team: string; level: string; years: string; teammates: Teammate[] };

type MateRow = {
  teamid: string;
  team_name: string | null;
  level_label: string | null;
  year: string;
  playerid: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  hsid: string | null;
};

type HsRow = {
  playerid: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  hsid: string;
  hsname: string | null;
  shared: string[] | null;
};

const SEASON_TABLES = ['tbc_batting_raw', 'tbc_pitching_raw', 'tbc_batting_2026_season_raw', 'tbc_pitching_2026_season_raw'];

// "2016-17" for a run of consecutive years, else "2021, 2023".
function yearsLabel(years: Iterable<string>): string {
  const sorted = Array.from(new Set(Array.from(years).map(Number).filter(Boolean))).sort((a, b) => a - b);
  if (!sorted.length) return '';
  const consecutive = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1);
  if (sorted.length > 1 && consecutive) return `${sorted[0]}–${String(sorted[sorted.length - 1]).slice(-2)}`;
  return sorted.join(', ');
}

function teammate(playerId: string, first: string | null, last: string | null, display: string | null, hsid: string | null): Teammate {
  const name = (display || `${first || ''} ${last || ''}`).trim() || 'Unknown';
  const [f, ...rest] = name.split(/\s+/);
  const href = hsid
    ? `/${encodeURIComponent(hsid)}/player/${encodeURIComponent(playerId)}/${toPlayerSlug(first || f, last || rest.join(' '))}`
    : null;
  return { playerId, name, href };
}

function lastNameKey(t: Teammate) {
  const parts = t.name.split(/\s+/);
  return `${parts.slice(1).join(' ')} ${parts[0]}`.toLowerCase();
}

export async function getTeammates(playerId: string): Promise<TeammateGroup[]> {
  const seasons = SEASON_TABLES.map((t) => `SELECT teamid, year FROM ${t} WHERE playerid = $1`).join(' UNION ');
  const mates = SEASON_TABLES.map((t) => `SELECT r.playerid, r.teamid, r.year FROM ${t} r JOIN seasons s USING (teamid, year)`).join(' UNION ');

  const [seasonRows, hsRows] = await Promise.all([
    query<MateRow>(
      `WITH seasons AS (${seasons}), mates AS (${mates})
       SELECT m.teamid, u.current_team_name AS team_name, u.level_label, m.year, m.playerid,
              coalesce(f.first_name, p.firstname) AS first_name,
              coalesce(f.last_name, p.lastname) AS last_name,
              f.display_name, f.hsid
         FROM mates m
         LEFT JOIN teamid_universe_mapping u ON u.teamid = m.teamid
         LEFT JOIN tbc_players_raw p ON p.playerid = m.playerid
         LEFT JOIN flip_card_front_stage f ON f.playerid = m.playerid
        WHERE m.playerid <> $1`,
      [playerId]
    ),
    query<HsRow>(
      `SELECT f.playerid, f.display_name, f.first_name, f.last_name, f.hsid, ss.hsname,
              ARRAY(SELECT unnest(f.roster_years) INTERSECT SELECT unnest(me.roster_years)) AS shared
         FROM flip_card_front_stage me
         JOIN flip_card_front_stage f
           ON f.hsid = me.hsid AND f.roster_years && me.roster_years AND f.playerid <> me.playerid
         LEFT JOIN school_success ss ON ss.hsid::text = f.hsid
        WHERE me.playerid = $1`,
      [playerId]
    ),
  ]);

  const groups: (TeammateGroup & { firstYear: number })[] = [];

  if (hsRows.rows.length) {
    const school = String(hsRows.rows[0].hsname || '').trim();
    const years = new Set<string>();
    const list = hsRows.rows.map((r) => {
      (r.shared || []).forEach((y) => years.add(y));
      return teammate(r.playerid, r.first_name, r.last_name, r.display_name, r.hsid);
    });
    groups.push({
      key: `hs-${hsRows.rows[0].hsid}`,
      team: school ? (/high school|\bhs\b|academy|prep/i.test(school) ? school : `${school} HS`) : 'High School',
      level: 'HIGH SCHOOL',
      years: yearsLabel(years),
      teammates: list.sort((a, b) => lastNameKey(a).localeCompare(lastNameKey(b))),
      firstYear: Math.min(...Array.from(years).map(Number).filter(Boolean), 9999),
    });
  }

  const byTeam = new Map<string, { team: string; level: string; years: Set<string>; mates: Map<string, Teammate> }>();
  for (const r of seasonRows.rows) {
    let g = byTeam.get(r.teamid);
    if (!g) {
      g = { team: String(r.team_name || '').trim() || 'Team', level: String(r.level_label || '').trim(), years: new Set(), mates: new Map() };
      byTeam.set(r.teamid, g);
    }
    g.years.add(String(r.year));
    if (!g.mates.has(r.playerid)) g.mates.set(r.playerid, teammate(r.playerid, r.first_name, r.last_name, r.display_name, r.hsid));
  }
  for (const [teamid, g] of byTeam) {
    groups.push({
      key: `team-${teamid}`,
      team: g.team,
      level: g.level,
      years: yearsLabel(g.years),
      teammates: Array.from(g.mates.values()).sort((a, b) => lastNameKey(a).localeCompare(lastNameKey(b))),
      firstYear: Math.min(...Array.from(g.years).map(Number).filter(Boolean), 9999),
    });
  }

  // High school first, then college and pro in the order he played there.
  return groups
    .sort((a, b) => (a.level === 'HIGH SCHOOL' ? -1 : b.level === 'HIGH SCHOOL' ? 1 : a.firstYear - b.firstYear))
    .map((g) => ({ key: g.key, team: g.team, level: g.level, years: g.years, teammates: g.teammates }));
}
