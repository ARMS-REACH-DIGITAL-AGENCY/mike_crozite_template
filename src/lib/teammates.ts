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

// One row per teammate per season: someone who was a teammate for three
// years is listed three times, each with that season's year and team.
export type TeammateSeason = { playerId: string; name: string; sortName: string; href: string | null; year: number; team: string };

type MateRow = {
  teamid: string;
  team_name: string | null;
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

function season(playerId: string, first: string | null, last: string | null, display: string | null, hsid: string | null, year: number, team: string): TeammateSeason {
  const name = (display || `${first || ''} ${last || ''}`).trim() || 'Unknown';
  const [f, ...rest] = name.split(/\s+/);
  const href = hsid
    ? `/${encodeURIComponent(hsid)}/player/${encodeURIComponent(playerId)}/${toPlayerSlug(first || f, last || rest.join(' '))}`
    : null;
  // Last name first, for the A-Z order.
  const sortName = `${(last || rest.join(' ')).trim()} ${(first || f).trim()}`.toLowerCase();
  return { playerId, name, sortName, href, year, team };
}

export async function getTeammates(playerId: string): Promise<TeammateSeason[]> {
  const seasons = SEASON_TABLES.map((t) => `SELECT teamid, year FROM ${t} WHERE playerid = $1`).join(' UNION ');
  const mates = SEASON_TABLES.map((t) => `SELECT r.playerid, r.teamid, r.year FROM ${t} r JOIN seasons s USING (teamid, year)`).join(' UNION ');

  const [seasonRows, hsRows] = await Promise.all([
    query<MateRow>(
      `WITH seasons AS (${seasons}), mates AS (${mates})
       SELECT m.teamid, u.current_team_name AS team_name, m.year, m.playerid,
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

  const rows: TeammateSeason[] = [];
  const hsName = String(hsRows.rows[0]?.hsname || '').trim();
  const hsTeam = hsName ? (/high school|\bhs\b|academy|prep/i.test(hsName) ? hsName : `${hsName} HS`) : 'High School';
  for (const r of hsRows.rows) {
    for (const y of r.shared || []) {
      const year = Number(y);
      if (year) rows.push(season(r.playerid, r.first_name, r.last_name, r.display_name, r.hsid, year, hsTeam));
    }
  }
  for (const r of seasonRows.rows) {
    const year = Number(r.year);
    if (year) rows.push(season(r.playerid, r.first_name, r.last_name, r.display_name, r.hsid, year, String(r.team_name || '').trim() || 'Team'));
  }
  return rows;
}
