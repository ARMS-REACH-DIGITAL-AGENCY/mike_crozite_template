'use strict';
// PIPELINE: exercise the actual shared ingestion workers with provider fixtures.
// No remote API, database connection, or invented production result is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function compile(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', 'console', code)(exports, id => {
    assert.ok(Object.hasOwn(dependencies, id), 'Unexpected dependency ' + id);
    return dependencies[id];
  }, { log() {}, error() {} });
  return exports;
}
const context = compile('src/lib/mlb/ingestionContext.ts');
const { isBracketGameType } = compile('src/lib/bracket/scheduleAuthority.ts');
const dependencies = { './ingestionContext': context, '../statLine': compile('src/lib/statLine.ts') };
const { runMlbLiveGameLogs } = compile('src/lib/mlb/liveGameLogs.ts', dependencies);
const { runLiveScheduleRefresh } = compile('src/lib/mlb/liveScheduleRefresh.ts', dependencies);
const EFFECTIVE = '2026-03-27T06:59:59.000Z'; // March 26, 23:59:59 in Arizona.
const twoWay = {
  person: { id: 101, fullName: 'Fixture Two Way' },
  stats: {
    batting: { plateAppearances: 4, atBats: 3, hits: 2, homeRuns: 1, rbi: 2, baseOnBalls: 1 },
    pitching: { inningsPitched: '2.1', earnedRuns: 1, strikeOuts: 3, baseOnBalls: 0 },
  },
};
const game = {
  gamePk: 90001, officialDate: '2026-03-26', gameDate: '2026-03-27T00:00:00Z',
  status: { detailedState: 'Final' }, gameType: 'R', sport: { id: 1 },
  teams: {
    home: { team: { id: 201, name: 'Fixture Home' }, score: 3, isWinner: true },
    away: { team: { id: 202, name: 'Fixture Away' }, score: 2, isWinner: false },
  },
};
const box = { teams: {
  home: { players: {
    ID101: twoWay,
    ID102: { person: { id: 102 }, stats: { batting: { plateAppearances: 3, hits: 2 } } },
    ID103: { person: { id: 103 }, stats: { batting: { plateAppearances: 0, atBats: 0 }, pitching: { inningsPitched: '0.0' } } },
  } },
  away: { players: {} },
} };

function database(window = { start: '08:30:00', stop: '00:10:00', active: true }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('from public.yat_mlb_links')) {
        return { rows: [{ source_player_id: '101', playerid: 'YAT900001' }, { source_player_id: '103', playerid: 'YAT900003' }] };
      }
      if (sql.includes('schedule_polling_windows_2026')) return { rows: window ? [window] : [] };
      if (sql.includes('insert into public.team_schedules')) return { rows: [], rowCount: JSON.parse(params[0]).length };
      return { rows: [], rowCount: 1 };
    },
  };
}

(async () => {
  const db = database(), requested = [];
  const request = async url => {
    requested.push(String(url));
    if (String(url).includes('/schedule?')) return Response.json({ dates: [{ date: '2026-03-26', games: [game] }] });
    assert.match(String(url), /\/game\/90001\/boxscore$/);
    return Response.json(box);
  };
  const result = await runMlbLiveGameLogs(db, { request, effectiveAt: EFFECTIVE });
  assert.equal(result.date, '2026-03-26', 'The provider day follows Arizona, not UTC or the real current day');
  assert.equal(result.gamesChecked, 1);
  assert.equal(result.rowsUpserted, 2, 'A mapped two-way player gets both rows; inactive and unmapped players do not');
  assert.deepEqual(result.warnings, []);
  assert.match(requested[0], /sportId=1&date=2026-03-26$/);
  const writes = db.calls.filter(c => c.sql.includes('insert into public.player_game_logs'));
  assert.deepEqual(writes.map(c => c.params[3]), ['batting', 'pitching']);
  for (const { sql, params } of writes) {
    assert.equal(params[0], 'YAT900001', 'Only the registry-resolved application identity is used');
    assert.equal(params[1], '90001');
    assert.equal(params[4], '2026-03-26', 'officialDate wins over next-day UTC first pitch');
    assert.equal(params[5], 'Final');
    const raw = JSON.parse(params[11]);
    assert.deepEqual(raw, { ...twoWay, gameType: 'R', sport: { id: 1, abbreviation: 'MLB' }, isWin: true },
      'Provider player evidence and source game metadata survive together');
    assert.equal(raw.person.id, 101, 'Landing keeps the MLB person identity at its existing person.id path');
    assert.equal(raw.sport.abbreviation, 'MLB', 'Fresh game lines carry their source level without a current-roster lookup');
    assert.equal(params[12], EFFECTIVE);
    assert.match(sql, /on conflict \(playerid, source, source_game_id, stat_type\)/);
    assert.match(sql, /created_at, updated_at/);
    assert.ok(!/created_at\s*=/.test(sql), 'A retry preserves the first observed creation time');
  }
  assert.deepEqual(JSON.parse(writes[0].params[10]), twoWay.stats.batting);
  assert.deepEqual(JSON.parse(writes[1].params[10]), twoWay.stats.pitching);
  for (const [status, isWinner, expected] of [['Final', false, false], ['In Progress', false, undefined], ['Final', undefined, undefined]]) {
    const resultDb = database();
    const sourceGame = { ...game, sport: undefined, status: { detailedState: status },
      teams: { ...game.teams, home: { ...game.teams.home, isWinner } } };
    await runMlbLiveGameLogs(resultDb, { effectiveAt: EFFECTIVE, request: async url =>
      String(url).includes('/schedule?') ? Response.json({ dates: [{ games: [sourceGame] }] }) : Response.json(box),
    });
    const raw = JSON.parse(resultDb.calls.find(c => c.sql.includes('insert into public.player_game_logs')).params[11]);
    assert.deepEqual(raw.sport, { id: 1, abbreviation: 'MLB' }, 'sportId=1 request supplies the missing source sport context');
    assert.equal(raw.isWin, expected, 'Only an explicit final schedule winner boolean becomes a fallback result');
    assert.equal(Object.hasOwn(raw, 'isWin'), expected !== undefined, 'Missing/in-progress winner is not fabricated as a loss');
  }
  const errorDb = database();
  const partial = await runMlbLiveGameLogs(errorDb, { effectiveAt: EFFECTIVE, request: async url =>
    String(url).includes('/schedule?') ? Response.json({ dates: [{ games: [game] }] }) : new Response('', { status: 503 }),
  });
  assert.equal(partial.rowsUpserted, 0);
  assert.match(partial.warnings[0], /gamePk=90001.*503/);
  await assert.rejects(() => runMlbLiveGameLogs(database(), { effectiveAt: '2026-03-26', request }), /explicit timezone/);

  const scheduleDb = database(), scheduleRequests = [];
  const scheduleRequest = async input => {
    const url = new URL(String(input));
    scheduleRequests.push(url);
    let games = [];
    if (url.searchParams.get('sportId') === '1') games = [game];
    if (url.searchParams.get('teamId') === '454') games = [
      { ...game, gamePk: 90002, sport: { id: 17 }, teams: { home: { team: { id: 454, name: 'Fixture AFL Home' } }, away: { team: { id: 490, name: 'Fixture AFL Away' } } } },
      { ...game, gamePk: 90003, sport: { id: 17 }, teams: { home: { team: { id: 454 } }, away: { team: { id: 999 } } } },
    ];
    return Response.json({ dates: [{ date: '2026-03-26', games }] });
  };
  const schedule = await runLiveScheduleRefresh(scheduleDb, { request: scheduleRequest, effectiveAt: EFFECTIVE });
  assert.equal(schedule.gamesUpserted, 2);
  assert.deepEqual(schedule.warnings, []);
  assert.equal(scheduleRequests.length, 12, 'All existing pro sports and six exact AFL sources are used');
  assert.equal(scheduleDb.calls[0].params[0], 4, 'Polling window uses historical Thursday in Arizona');
  assert.ok(scheduleRequests.every(url => url.searchParams.get('startDate') === '2026-03-25' && url.searchParams.get('endDate') === '2026-03-27'));
  const scheduleWrite = scheduleDb.calls.find(c => c.sql.includes('insert into public.team_schedules'));
  const rows = JSON.parse(scheduleWrite.params[0]);
  assert.deepEqual(rows.map(r => r.game_pk).sort(), [90001, 90002]);
  assert.equal(rows[0].home_score, 3);
  assert.equal(rows[0].status, 'Final');
  assert.equal(rows[0].game_type, 'R', 'A newly inserted schedule keeps the provider game type');
  assert.match(scheduleWrite.sql, /game_type = coalesce\(excluded.game_type, team_schedules.game_type\)/,
    'A sparse refresh cannot erase an already-known source game type');
  const excludedDb = database();
  const excludedRequest = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/boxscore')) return Response.json(box);
    return Response.json({ dates: [{ date: '2026-03-26', games: url.searchParams.get('sportId') === '1' ? [{ ...game, gameType: 'S' }] : [] }] });
  };
  await runMlbLiveGameLogs(excludedDb, { request: excludedRequest, effectiveAt: EFFECTIVE });
  await runLiveScheduleRefresh(excludedDb, { request: excludedRequest, effectiveAt: EFFECTIVE });
  const excludedRaw = JSON.parse(excludedDb.calls.find(c => c.sql.includes('insert into public.player_game_logs')).params[11]);
  const [excludedSchedule] = JSON.parse(excludedDb.calls.find(c => c.sql.includes('insert into public.team_schedules')).params[0]);
  assert.equal(excludedRaw.gameType, 'S');
  assert.equal(excludedSchedule.game_type, 'S');
  assert.equal(isBracketGameType(excludedRaw.gameType), true, 'Spring training player lines must count in fantasy');
  assert.equal(isBracketGameType(excludedSchedule.game_type), true, 'Spring training games are eligible for fantasy schedule and club results');
  assert.equal(rows.find(r => r.game_pk === 90002).level, 'MLB', 'Existing AFL classification is preserved');
  assert.equal(scheduleWrite.params[1], EFFECTIVE);
  const retirement = scheduleDb.calls.find(c => c.sql.includes("set status = 'Not Necessary'"));
  assert.deepEqual(retirement.params, ['2026-03-25', '2026-03-27', [90001, 90002], EFFECTIVE]);
  assert.match(retirement.sql, /game_time_utc < coalesce\(\$4::timestamptz, now\(\)\) - interval '3 hours'/);
  for (const call of scheduleDb.calls.filter(c => c.sql.includes('update public.flip_card_front_stage'))) {
    assert.deepEqual(call.params, [EFFECTIVE]);
    const unbound = call.sql.replaceAll('coalesce($1::timestamptz, now())', 'effective_clock');
    assert.ok(!unbound.includes('now()'), 'All next-game time predicates use the same effective clock');
  }
  const skippedDb = database({ start: '08:30:00', stop: '20:00:00', active: true });
  const skipped = await runLiveScheduleRefresh(skippedDb, { effectiveAt: EFFECTIVE, request: async () => { throw Error('Polling gate must prevent a request'); } });
  assert.equal(skipped.skipped, true);
  assert.equal(skippedDb.calls.length, 1, 'Out-of-window runs make no writes');
  const inactiveDb = database({ start: '00:00:00', stop: '23:59:59', active: false });
  assert.equal((await runLiveScheduleRefresh(inactiveDb, { effectiveAt: EFFECTIVE, request })).skipped, true);
  const warningsDb = database();
  const degraded = await runLiveScheduleRefresh(warningsDb, { effectiveAt: EFFECTIVE, request: async input => {
    if (new URL(String(input)).searchParams.get('sportId') === '11') return new Response('', { status: 503 });
    return scheduleRequest(input);
  } });
  assert.equal(degraded.warnings.length, 1);
  assert.ok(!warningsDb.calls.some(c => c.sql.includes("set status = 'Not Necessary'")), 'Failed coverage cannot retire missing games');

  // Without trusted dependency overrides, the same workers use the real
  // current date, global fetch and SQL now(), just as the HTTP routes do.
  const originalFetch = global.fetch;
  try {
    global.fetch = request;
    const liveDb = database();
    await runMlbLiveGameLogs(liveDb);
    assert.ok(liveDb.calls.filter(c => c.sql.includes('insert into public.player_game_logs')).every(c => c.params[12] === null));
    global.fetch = scheduleRequest;
    const liveScheduleDb = database({ start: '00:00:00', stop: '23:59:59', active: true });
    await runLiveScheduleRefresh(liveScheduleDb);
    assert.equal(liveScheduleDb.calls.find(c => c.sql.includes('insert into public.team_schedules')).params[1], null);
  } finally { global.fetch = originalFetch; }

  // A URL cannot select a replay clock/provider. Auth remains at the route.
  const priorSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'fixture-only';
  try {
    for (const [route, name, lib] of [
      ['mlb-live-gamelogs', 'runMlbLiveGameLogs', '@/lib/mlb/liveGameLogs'],
      ['live-schedule-refresh', 'runLiveScheduleRefresh', '@/lib/mlb/liveScheduleRefresh'],
    ]) {
      let called = 0;
      const { GET } = compile(`src/app/api/cron/${route}/route.ts`, {
        'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
        pg: { Pool: class {} },
        [lib]: { [name]: async (_db, options) => { called++; assert.equal(options, undefined); return { ok: true }; } },
      });
      const req = value => ({ headers: { get: () => value }, nextUrl: new URL('https://fixture.invalid?effectiveAt=2026-03-26T12:00:00Z') });
      assert.equal((await GET(req('wrong'))).status, 401);
      assert.equal(called, 0);
      assert.equal((await GET(req('Bearer fixture-only'))).status, 200);
      assert.equal(called, 1);
    }
  } finally {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
  }
  console.log('PASS shared MLB/schedule ingestion, YAT mapping, source fidelity, effective clock, polling guards and live route defaults');
})().catch(error => { console.error(error); process.exitCode = 1; });
