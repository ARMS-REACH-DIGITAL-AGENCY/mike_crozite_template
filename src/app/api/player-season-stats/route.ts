// src/app/api/player-season-stats/route.ts
// Season-by-season player stats feed for the player profile Stats FunZone.
// Reads directly from the canonical raw TBC stat tables and enriches teamid via
// public.teamid_universe_mapping, which is the canonical YAT?STATS team mapping table.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const BATTING_TABLES = ['tbc_batting_raw', 'tbc_batting_2026_season_raw'] as const;
const PITCHING_TABLES = ['tbc_pitching_raw', 'tbc_pitching_2026_season_raw'] as const;

function value(row: any, ...keys: string[]) {
  for (const key of keys) {
    const v = row?.[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function clean(row: any) {
  return Object.fromEntries(
    Object.entries(row || {}).map(([k, v]) => [k, v === null || v === undefined ? '' : v])
  );
}

function normalizeName(name: unknown) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactName(name: unknown) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '');
}

function reversedCompactName(name: unknown) {
  const normalized = normalizeName(name);
  if (normalized.includes(',')) {
    const [last, first] = normalized.split(',').map((part) => part.trim());
    return compactName(`${first} ${last}`);
  }
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) return compactName(normalized);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return compactName(`${last} ${first}`);
}

function rowMatchesExpectedPlayer(row: any, expectedPlayerName: string) {
  const expected = compactName(expectedPlayerName);
  if (!expected) return true;

  const rawPlayerName = value(row, 'playername', 'player_name', 'name');
  if (!rawPlayerName) return true;

  const rowName = compactName(rawPlayerName);
  const rowReversed = reversedCompactName(rawPlayerName);
  return rowName === expected || rowReversed === expected;
}

function filterRowsToExpectedPlayer(rows: any[], expectedPlayerName: string) {
  if (!expectedPlayerName) return rows;
  return rows.filter((row) => rowMatchesExpectedPlayer(row, expectedPlayerName));
}

function battingRow(row: any) {
  const orgOrConference = value(row, 'current_org_or_conference_name');
  return clean({
    source: value(row, '_source'),
    year: value(row, 'year'),
    team: value(row, 'current_team_name', 'teamid'),
    league: orgOrConference,
    level: value(row, 'level_label', 'highlevel'),
    org_conf: orgOrConference,
    age: value(row, 'age'),
    ba: value(row, 'ba'),
    th: value(row, 'th'),
    class: value(row, 'class'),
    posit: value(row, 'posit'),
    g: value(row, 'g'),
    ab: value(row, 'ab'),
    r: value(row, 'r'),
    h: value(row, 'h'),
    dbl: value(row, 'dbl'),
    tpl: value(row, 'tpl'),
    hr: value(row, 'hr'),
    rbi: value(row, 'rbi'),
    sb: value(row, 'sb'),
    cs: value(row, 'cs'),
    bb: value(row, 'bb'),
    so: value(row, 'so'),
    hbp: value(row, 'hbp'),
    sh: value(row, 'sh'),
    sf: value(row, 'sf'),
    ibb: value(row, 'ibb'),
    gdp: value(row, 'gdp'),
    tb: value(row, 'tb'),
    pa: value(row, 'pa'),
    xbh: value(row, 'xbh'),
    sgl: value(row, 'sgl'),
    avg: value(row, 'bavg'),
    bavg: value(row, 'bavg'),
    obp: value(row, 'obp'),
    slg: value(row, 'slg'),
    ops: value(row, 'ops'),
    seca: value(row, 'seca'),
    iso: value(row, 'iso'),
    babip: value(row, 'babip'),
  });
}

function pitchingRow(row: any) {
  const orgOrConference = value(row, 'current_org_or_conference_name');
  return clean({
    source: value(row, '_source'),
    year: value(row, 'year'),
    team: value(row, 'current_team_name', 'teamid'),
    league: orgOrConference,
    level: value(row, 'level_label', 'highlevel'),
    org_conf: orgOrConference,
    age: value(row, 'age'),
    ba: value(row, 'ba'),
    th: value(row, 'th'),
    class: value(row, 'class'),
    w: value(row, 'w'),
    l: value(row, 'l'),
    g: value(row, 'g'),
    gs: value(row, 'gs'),
    cg: value(row, 'cg'),
    sho: value(row, 'sho'),
    gr: value(row, 'gr'),
    gf: value(row, 'gf'),
    sv: value(row, 'sv'),
    ip: value(row, 'ip'),
    h: value(row, 'h'),
    r: value(row, 'r'),
    er: value(row, 'er'),
    hr: value(row, 'hr'),
    bb: value(row, 'bb'),
    so: value(row, 'so'),
    wp: value(row, 'wp'),
    bk: value(row, 'bk'),
    hb: value(row, 'hb'),
    era: value(row, 'era'),
    whip: value(row, 'whip'),
    h9: value(row, 'h9'),
    hr9: value(row, 'hr9'),
    bb9: value(row, 'bb9'),
    so9: value(row, 'so9'),
    ra9: value(row, 'ra9'),
    so_bb: value(row, 'so_bb'),
  });
}

function byYearThenTeam(a: any, b: any) {
  const ay = Number(a.year) || 0;
  const by = Number(b.year) || 0;
  if (ay !== by) return ay - by;
  return String(a.team || '').localeCompare(String(b.team || ''));
}

function dedupe(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of rows) {
    const key = [row.year, row.team, row.level, row.source].map((v) => String(v ?? '')).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function tableExists(tableName: string) {
  const { rows } = await query(
    `select to_regclass($1) as table_name`,
    [`public.${tableName}`]
  );
  return Boolean(rows[0]?.table_name);
}

async function readPlayerRows(tableName: string, playerId: string) {
  if (!(await tableExists(tableName))) return [];

  // Table name is from constants above, not user input.
  const { rows } = await query(
    `select
       r.*,
       m.current_team_name,
       m.current_org_or_conference_name,
       m.level_label,
       $2::text as _source
     from public.${tableName} r
     left join public.teamid_universe_mapping m on m.teamid::text = r.teamid::text
     where r.playerid::text = $1
     order by nullif(regexp_replace(coalesce(r.year::text, ''), '[^0-9]', '', 'g'), '')::int nulls last,
              coalesce(m.current_team_name, r.teamid::text)`,
    [playerId, tableName]
  );

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const playerId = req.nextUrl.searchParams.get('playerId');
    const expectedPlayerName = req.nextUrl.searchParams.get('playerName') || '';

    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const [battingRawAll, batting2026All, pitchingRawAll, pitching2026All] = await Promise.all([
      readPlayerRows(BATTING_TABLES[0], playerId),
      readPlayerRows(BATTING_TABLES[1], playerId),
      readPlayerRows(PITCHING_TABLES[0], playerId),
      readPlayerRows(PITCHING_TABLES[1], playerId),
    ]);

    const battingRaw = filterRowsToExpectedPlayer(battingRawAll, expectedPlayerName);
    const batting2026 = filterRowsToExpectedPlayer(batting2026All, expectedPlayerName);
    const pitchingRaw = filterRowsToExpectedPlayer(pitchingRawAll, expectedPlayerName);
    const pitching2026 = filterRowsToExpectedPlayer(pitching2026All, expectedPlayerName);

    const batting = dedupe([...battingRaw, ...batting2026].map(battingRow)).sort(byYearThenTeam);
    const pitching = dedupe([...pitchingRaw, ...pitching2026].map(pitchingRow)).sort(byYearThenTeam);
    const primaryType = pitching.length > 0 && (batting.length === 0 || pitching.length >= batting.length)
      ? 'pitching'
      : 'batting';

    return NextResponse.json({
      success: true,
      playerId,
      expectedPlayerName,
      primaryType,
      counts: {
        battingHistorical: battingRaw.length,
        batting2026: batting2026.length,
        pitchingHistorical: pitchingRaw.length,
        pitching2026: pitching2026.length,
        filteredOutNameMismatches:
          (battingRawAll.length - battingRaw.length) +
          (batting2026All.length - batting2026.length) +
          (pitchingRawAll.length - pitchingRaw.length) +
          (pitching2026All.length - pitching2026.length),
      },
      batting,
      pitching,
    });
  } catch (error: any) {
    console.error('player-season-stats failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
