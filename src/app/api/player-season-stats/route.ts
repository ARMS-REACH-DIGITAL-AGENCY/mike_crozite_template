// src/app/api/player-season-stats/route.ts
// Season-by-season player stats feed for the player profile Stats FunZone.
// Reads directly from the canonical raw TBC stat tables.
// Important: these raw stat tables use teamid, highlevel, and mlbyears.
// Do not assume team_name, league, or teams.team_id exists.

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

function battingRow(row: any) {
  return clean({
    source: value(row, '_source'),
    year: value(row, 'year'),
    team: value(row, 'teamid'),
    league: '',
    level: value(row, 'highlevel'),
    mlb: value(row, 'mlbyears'),
    age: value(row, 'age'),
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
    obp: value(row, 'obp'),
    slg: value(row, 'slg'),
    ops: value(row, 'ops'),
    seca: value(row, 'seca'),
    iso: value(row, 'iso'),
    babip: value(row, 'babip'),
    bb_pct: value(row, 'bb_pct'),
    so_pct: value(row, 'so_pct'),
    so_bb: value(row, 'so_bb'),
    ab_hr: value(row, 'ab_hr'),
  });
}

function pitchingRow(row: any) {
  return clean({
    source: value(row, '_source'),
    year: value(row, 'year'),
    team: value(row, 'teamid'),
    league: '',
    level: value(row, 'highlevel'),
    mlb: value(row, 'mlbyears'),
    age: value(row, 'age'),
    w: value(row, 'w'),
    l: value(row, 'l'),
    era: value(row, 'era'),
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

  // The table name is from the constants above, not user input.
  // Keep this deliberately simple: no team lookup joins until the teams schema is confirmed.
  const { rows } = await query(
    `select *, $2::text as _source
     from public.${tableName}
     where playerid::text = $1
     order by nullif(regexp_replace(coalesce(year::text, ''), '[^0-9]', '', 'g'), '')::int nulls last,
              teamid::text`,
    [playerId, tableName]
  );

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const playerId = req.nextUrl.searchParams.get('playerId');
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const [battingRaw, batting2026, pitchingRaw, pitching2026] = await Promise.all([
      readPlayerRows(BATTING_TABLES[0], playerId),
      readPlayerRows(BATTING_TABLES[1], playerId),
      readPlayerRows(PITCHING_TABLES[0], playerId),
      readPlayerRows(PITCHING_TABLES[1], playerId),
    ]);

    const batting = dedupe([...battingRaw, ...batting2026].map(battingRow)).sort(byYearThenTeam);
    const pitching = dedupe([...pitchingRaw, ...pitching2026].map(pitchingRow)).sort(byYearThenTeam);
    const primaryType = pitching.length > 0 && (batting.length === 0 || pitching.length >= batting.length)
      ? 'pitching'
      : 'batting';

    return NextResponse.json({
      success: true,
      playerId,
      primaryType,
      counts: {
        battingHistorical: battingRaw.length,
        batting2026: batting2026.length,
        pitchingHistorical: pitchingRaw.length,
        pitching2026: pitching2026.length,
      },
      batting,
      pitching,
    });
  } catch (error: any) {
    console.error('player-season-stats failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
