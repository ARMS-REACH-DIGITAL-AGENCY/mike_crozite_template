'use strict';
// PIPELINE regression: the March 23–25, 2026 schedule and affected alumni
// below were read from the isolated production copy. Spring/exhibition
// results caused the reported .600 and .333 W% despite a real 1–0 record.
// Runs the actual input route and scorer, without network or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const YANKEES = 'New York Yankees', CUBS = 'Chicago Cubs', REDS = 'Cincinnati Reds', SPRINGFIELD = 'Springfield Cardinals';
const stages = [
  ['5065', 'YAT078516', 'Max Fried', 'MLB', 'P', YANKEES],
  ['5065', 'YAT113795', 'Pete Crow-Armstrong', 'MLB', 'OF', CUBS],
  ['1772', 'YAT056439', 'Giancarlo Stanton', 'MLB', 'OF', YANKEES],
  ['1772', 'YAT100751', 'Hunter Greene', 'MLB', 'P', REDS],
  ['1772', 'YAT151012', 'Jack Gurevitch', 'DOUBLE-A', '1B', SPRINGFIELD],
].map(([hsid, yatid, display_name, level_label, position, current_team_name]) => ({
  hsid, yatid, playerid: yatid, display_name, level_label, position, current_team_name, status_label: 'ACTIVE',
}));
const schedules = [
  ['831780', 0, 'S', CUBS, YANKEES, 15, 6],
  ['831779', 1, 'S', CUBS, YANKEES, 3, 8],
  ['823244', 2, 'R', 'San Francisco Giants', YANKEES, 0, 7],
  ['832078', 0, 'S', 'Milwaukee Brewers', REDS, 9, 1],
  ['832077', 1, 'S', 'Milwaukee Brewers', REDS, 4, 1],
  ['831442', 0, 'E', SPRINGFIELD, 'St. Louis Cardinals', 2, 3],
].map(([game, day, game_type, home, away, home_runs, away_runs]) => ({
  game, day, game_type, home, away, home_runs, away_runs, status: 'Final', start: null,
}));
const sourceLines = [
  { playerid: 'YAT056439', day: 2, stat_type: 'batting', stats: { plateAppearances: 4, atBats: 4, hits: 2 }, game: '823244', team: YANKEES, status: 'Final', level: 'MLB', game_type: 'R' },
  { playerid: 'YAT078516', day: 2, stat_type: 'pitching', stats: { inningsPitched: '6.1', baseOnBalls: 1, hitByPitch: 1, strikeOuts: 4, hits: 2, runs: 0, earnedRuns: 0 }, game: '823244', team: YANKEES, status: 'Final', level: 'MLB', game_type: 'R' },
];
const sourceClubs = [];
async function query(sql, params) {
  if (sql.includes('FROM flip_card_front_stage')) return { rows: stages.filter(r => params[0].includes(r.hsid)) };
  // Which alumni have a game line in the period (a stat line beats any status).
  if (sql.includes('array_agg(DISTINCT (game_date')) { const by = {}; for (const r of sourceLines) if (params[0].includes(r.playerid) && r.day >= 0 && r.day < params[2]) (by[r.playerid] ||= new Set()).add(r.day); return { rows: Object.entries(by).map(([yatid, days]) => ({ yatid, days: [...days] })) }; }
  if (sql.includes('SELECT DISTINCT ON (yatid,')) return { rows: sourceLines.filter(r => params[0].includes(r.playerid) && r.day >= 0 && r.day < params[2]) };
  if (sql.includes('SELECT DISTINCT ON (team_name,')) return { rows: sourceClubs.filter(r => params[0].includes(r.team) && r.day >= 0 && r.day < params[2]) };
  if (sql.includes('FROM team_schedules')) return { rows: schedules.filter(r => sql.includes('game_pk = ANY')
    ? params[0].includes(r.game)
    : r.day >= 0 && r.day < params[2] && (params[0].includes(r.home) || params[0].includes(r.away))) };
  if (sql.includes('FROM public.player_team_stints')) return { rows: [] };
  if (sql.includes('FROM user_profiles')) return { rows: [] };
  throw Error('Unexpected query: ' + sql);
}
const stubs = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/db': { query, getSeasonUsageByPlayerIds: async () => ({}) },
  '@/lib/bracket/fetchLiveBatches': { BRACKET_LIVE_BATCH_SIZE: 64, fetchBracketLiveBatches() { throw Error('Unexpected network request'); } },
  './schoolSeason': { setLiveInning() {} }, './inAction': { setInAction() {} },
};
const modules = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (modules.has(absolute)) return modules.get(absolute);
  const exports = {};
  modules.set(absolute, exports);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(absolute), id);
    return load(target + '.ts');
  });
  return exports;
}
const { GET } = load('src/app/api/bracket/live/route.ts');
const { scoreLive } = load('src/components/bracket/liveSeason.ts');
const { isBracketGameType } = load('src/lib/bracket/scheduleAuthority.ts');
const request = () => GET({ nextUrl: new URL('https://test.invalid/api/bracket/live?start=2026-03-23&weeks=1&h=5065,1772,455,1789') });
function score(live) {
  const games = [[73, 1, 5065, 455, '', [], null], [133, 1, 1772, 1789, '', [], null]];
  const idx = { season: 2027, weeks: [['2026-03-23', '2026-03-29']], schools: {
    5065: ['Harvard-Westlake', 1, 1], 1772: ['Notre Dame', 1, 2], 455: ['Sonora', 1, 15], 1789: ['Madison', 1, 16],
  }, rounds: [{ r: 1, name: 'Round 1', start: '2026-03-23', end: '2026-03-29', series: games.map((g, i) => [i + 1, g[2], g[3], 1, 16, 0, [0, 0], [g]]) }],
  lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0, grandChampion: 0 };
  return scoreLive(idx, live, '2026-03-25');
}
(async () => {
  const reply = await request();
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.body.clubs, { [YANKEES]: [[2, '823244', 1, 7]] }, 'Only the actual regular-season game counts');
  assert.deepEqual(Object.keys(reply.body.games), [YANKEES], 'Preseason games cannot delay completion or create in-action counts');
  assert.equal(reply.body.lines.length, 2);
  const boxes = score(reply.body);
  for (const [game, rosterCount] of [['73', 2], ['133', 3]]) {
    const side = boxes[game].h;
    assert.deepEqual(side.wl, [1, 0], 'Weekly record through Wednesday equals the real 1–0 result');
    assert.equal((side.wl[0] / (side.wl[0] + side.wl[1])).toFixed(3), '1.000');
    assert.equal(side.p.length, rosterCount, 'Every roster member remains visible');
    assert.equal(side.rd, 7, 'Preseason run differential cannot pollute tiebreaks');
    for (const d of [0, 1, 3, 4, 5, 6]) {
      assert.equal(side.days[d].length, rosterCount);
      for (const row of side.days[d]) {
        assert.deepEqual(row[8], [0, 0], 'No Monday/Tuesday or future W–L');
        assert.ok(!row[4] || row[4].every(n => n === 0));
        assert.ok(!row[5] || row[5].every(n => n === 0));
      }
    }
    assert.deepEqual(side.days[2].reduce((wl, row) => [wl[0] + row[8][0], wl[1] + row[8][1]], [0, 0]), side.wl);
  }

  // Boundary fixtures: stale logs cannot restore an excluded game through
  // isWin, even when the log lacks gameType or its schedule moved later.
  for (const [game_type, n] of ['S', 'E', 'I', 'A'].map((t, i) => [t, i])) {
    const game = String(990000 + n);
    schedules.push({ game, day: 10, game_type, home: YANKEES, away: 'Fixture visitor', home_runs: 99, away_runs: 0, status: 'Final', start: null });
    sourceLines.push({ ...sourceLines[0], game, day: 0, game_type: null, stats: { plateAppearances: 99, atBats: 99, hits: 99 } });
    sourceClubs.push({ team: YANKEES, game, day: 0, is_win: true });
    sourceClubs.push({ team: YANKEES, game: 'unknown-' + game, day: 0, is_win: true, game_type });
    sourceLines.push({ ...sourceLines[0], game: 'unknown-' + game, day: 0, game_type });
  }
  const excluded = await request();
  assert.deepEqual(excluded.body.lines, reply.body.lines, 'No preseason line through either source or schedule authority');
  assert.deepEqual(excluded.body.clubs, reply.body.clubs, 'No preseason result fallback');
  assert.deepEqual(excluded.body.games, reply.body.games);

  // A source can already hold tomorrow's results during a replay. The
  // shared scorer must still limit every stored daily/weekly row to today.
  schedules.push({ game: 'future-regular', day: 3, game_type: 'R', home: YANKEES, away: 'Fixture visitor', home_runs: 99, away_runs: 0, status: 'Final', start: null });
  sourceLines.push({ ...sourceLines[0], game: 'future-regular', day: 3, stats: { plateAppearances: 99, atBats: 99, hits: 99 } });
  const future = await request();
  assert.deepEqual(score(future.body), boxes, 'Future regular-season input cannot alter this day’s saved scoreboard or Stat Ledger');

  const supportedTypes = ['R', 'F', 'D', 'L', 'W', 'C', 'P', null, undefined, '', 'college'];
  for (const [n, game_type] of supportedTypes.entries()) {
    assert.equal(isBracketGameType(game_type), true);
    const game = 'supported-' + n;
    sourceLines.push({ ...sourceLines[0], game, game_type });
    sourceClubs.push({ team: YANKEES, game, day: 2, is_win: true, game_type });
  }
  const supported = await request();
  assert.equal(supported.body.lines.filter(line => line[5].startsWith('supported-')).length, supportedTypes.length);
  assert.equal(supported.body.clubs[YANKEES].filter(row => row[1].startsWith('supported-')).length, supportedTypes.length);
  // Unknown/non-MLB source types stay supported; no MLB-only allow-list.
  assert.equal(isBracketGameType('college'), true);
  for (const type of ['S', 'E', 'I', 'A', ' s ']) assert.equal(isBracketGameType(type), false);
  console.log('PASS real March25 1–0 / 1.000, empty Mon/Tue records, complete rosters, preseason fallback exclusion, future cutoff and postseason support');
})().catch(error => { console.error(error); process.exitCode = 1; });
