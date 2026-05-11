// src/app/api/player-season-stats/route.ts
// Season-by-season player stats feed for the player profile Stats FunZone.
// Uses the existing DB helpers so the API inherits historical TBC rows and live 2026 rows.

import { NextRequest, NextResponse } from 'next/server';
import {
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
} from '@/lib/db';

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
    year: value(row, 'year'),
    team: value(row, 'team_name', 'teamname', 'team'),
    league: value(row, 'league', 'lg'),
    level: value(row, 'level', 'highlevel'),
    mlb: value(row, 'mlb', 'mlborg', 'org'),
    age: value(row, 'age'),
    g: value(row, 'g'),
    ab: value(row, 'ab'),
    r: value(row, 'r'),
    h: value(row, 'h'),
    dbl: value(row, '2b', 'dbl'),
    tpl: value(row, '3b', 'tpl'),
    hr: value(row, 'hr'),
    rbi: value(row, 'rbi'),
    sb: value(row, 'sb'),
    bb: value(row, 'bb'),
    so: value(row, 'so', 'ko'),
    avg: value(row, 'avg'),
    obp: value(row, 'obp'),
    slg: value(row, 'slg'),
    ops: value(row, 'ops'),
  });
}

function pitchingRow(row: any) {
  return clean({
    year: value(row, 'year'),
    team: value(row, 'team_name', 'teamname', 'team'),
    league: value(row, 'league', 'lg'),
    level: value(row, 'level', 'highlevel'),
    mlb: value(row, 'mlb', 'mlborg', 'org'),
    age: value(row, 'age'),
    w: value(row, 'w'),
    l: value(row, 'l'),
    era: value(row, 'era'),
    g: value(row, 'g', 'pg'),
    gs: value(row, 'gs'),
    cg: value(row, 'cg'),
    sho: value(row, 'sho'),
    gr: value(row, 'gr'),
    gf: value(row, 'gf'),
    sv: value(row, 'sv', 'saves'),
    ip: value(row, 'ip'),
    h: value(row, 'h', 'hits_allowed'),
    r: value(row, 'r'),
    er: value(row, 'er'),
    hr: value(row, 'hr'),
    bb: value(row, 'bb'),
    so: value(row, 'so', 'ko'),
    wp: value(row, 'wp'),
    bk: value(row, 'bk'),
    hb: value(row, 'hb', 'hbp'),
    whip: value(row, 'whip'),
    h9: value(row, 'h9'),
    hr9: value(row, 'hr9'),
    bb9: value(row, 'bb9'),
    so9: value(row, 'so9', 'k9'),
    ra9: value(row, 'ra9'),
    so_bb: value(row, 'so_bb', 'kbb'),
  });
}

function byYearThenTeam(a: any, b: any) {
  const ay = Number(a.year) || 0;
  const by = Number(b.year) || 0;
  if (ay !== by) return ay - by;
  return String(a.team || '').localeCompare(String(b.team || ''));
}

export async function GET(req: NextRequest) {
  try {
    const playerId = req.nextUrl.searchParams.get('playerId');
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const [battingRaw, pitchingRaw, careerBatting, careerPitching] = await Promise.all([
      getPlayerBattingStats(playerId),
      getPlayerPitchingStats(playerId),
      getPlayerCareerBatting(playerId),
      getPlayerCareerPitching(playerId),
    ]);

    const batting = (battingRaw || []).map(battingRow).sort(byYearThenTeam);
    const pitching = (pitchingRaw || []).map(pitchingRow).sort(byYearThenTeam);
    const primaryType = pitching.length > 0 && (batting.length === 0 || pitching.length >= batting.length)
      ? 'pitching'
      : 'batting';

    return NextResponse.json({
      success: true,
      playerId,
      primaryType,
      batting,
      pitching,
      careerBatting: careerBatting ? battingRow(careerBatting) : null,
      careerPitching: careerPitching ? pitchingRow(careerPitching) : null,
    });
  } catch (error: any) {
    console.error('player-season-stats failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
