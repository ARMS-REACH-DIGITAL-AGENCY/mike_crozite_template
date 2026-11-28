'use strict';
// PIPELINE regression: the March 23–25, 2026 schedule and affected alumni
// below were read from the isolated production copy. Pete explicitly requires
// spring training and exhibition stats to count for fantasy (not career stats).
// Runs the actual input route and scorer, without network or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const YANKEES = 'New York Yankees', CUBS = 'Chicago Cubs', REDS = 'Cincinnati Reds', SPRINGFIELD = 'Springfield Cardinals', BREWERS = 'Milwaukee Brewers';
const stages = [
  ['5065', 'YAT078516', 'Max Fried', 'MLB', 'P', YANKEES],
  ['5065', 'YAT113795', 'Pete Crow-Armstrong', 'MLB', 'OF', CUBS],
  ['1772', 'YAT056439', 'Giancarlo Stanton', 'MLB', 'OF', YANKEES],
  ['1772', 'YAT100751', 'Hunter Greene', 'MLB', 'P', REDS],
  ['1772', 'YAT151012', 'Jack Gurevitch', 'DOUBLE-A', '1B', SPRINGFIELD],
  ['8805', 'YAT100867', 'Garrett Mitchell', 'MLB', 'OF', BREWERS],
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
// Actual March 23 Mitchell batting line; other fixtures test pitching and
// exhibition stats without misclassifying the affiliate as MLB.
sourceLines.push(
  { playerid: 'YAT100867', day: 0, stat_type: 'batting', stats: { plateAppearances: 4, atBats: 4, hits: 1, doubles: 1, rbi: 3, strikeOuts: 1 }, game: '832078', team: BREWERS, status: 'Final', level: 'MLB', game_type: 'S' },
  { playerid: 'YAT100751', day: 0, stat_type: 'pitching', stats: { inningsPitched: '2.0', baseOnBalls: 1, strikeOuts: 2, hits: 1 }, game: '832078', team: REDS, status: 'Final', level: 'MLB', game_type: 'S' },
  { playerid: 'YAT151012', day: 0, stat_type: 'batting', stats: { plateAppearances: 3, atBats: 3, hits: 1 }, game: '831442', team: SPRINGFIELD, status: 'Final', level: 'DOUBLE-A', game_type: 'E' },
);
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
const request = () => GET({ nextUrl: new URL('https://test.invalid/api/bracket/live?start=2026-03-23&weeks=1&h=5065,1772,455,1789,8805,1641') });
function score(live) {
  const games = [[73, 1, 5065, 455, '', [], null], [133, 1, 1772, 1789, '', [], null], [1, 1, 8805, 1641, '', [], null]];
  const idx = { season: 2027, weeks: [['2026-03-23', '2026-03-29']], schools: {
    5065: ['Harvard-Westlake', 1, 1], 1772: ['Notre Dame', 1, 2], 455: ['Sonora', 1, 15], 1789: ['Madison', 1, 16], 8805: ['Orange Lutheran', 1, 3], 1641: ['Northview', 1, 14],
  }, rounds: [{ r: 1, name: 'Round 1', start: '2026-03-23', end: '2026-03-29', series: games.map((g, i) => [i + 1, g[2], g[3], 1, 16, 0, [0, 0], [g]]) }],
  lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0, grandChampion: 0 };
  return scoreLive(idx, live, '2026-03-25');
}
(async () => {
  const reply = await request();
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.body.clubs[YANKEES], [[0, '831780', 0, -9], [1, '831779', 1, 5], [2, '823244', 1, 7]], 'Spring and regular outcomes count once for fantasy');
  assert.deepEqual(reply.body.clubs[SPRINGFIELD], [[0, '831442', 0, -1]], 'Affiliate exhibition outcome counts');
  assert.deepEqual(reply.body.clubs[BREWERS], [[0, '832078', 1, 8], [1, '832077', 1, 3]]);
  assert.equal(reply.body.games[YANKEES].length, 3, 'Spring games participate in completion checks');
  assert.equal(reply.body.lines.length, 5);
  const boxes = score(reply.body);
  assert.deepEqual(boxes['73'].h.wl, [3, 2]);
  assert.deepEqual(boxes['133'].h.wl, [2, 4]);
  assert.deepEqual(boxes['1'].h.wl, [2, 0]);
  assert.equal(boxes['73'].h.rd, 7);
  assert.equal(boxes['133'].h.rd, -9);
  assert.equal(boxes['1'].h.rd, 11);
  for (const [game, rosterCount] of [['73', 2], ['133', 3], ['1', 1]]) {
    const side = boxes[game].h;
    assert.equal(side.p.length, rosterCount, 'Every roster member remains visible');
    for (const d of [3, 4, 5, 6]) {
      assert.equal(side.days[d].length, rosterCount);
      for (const row of side.days[d]) {
        assert.deepEqual(row[8], [0, 0], 'No future W-L');
        assert.ok(!row[4] || row[4].every(n => n === 0));
        assert.ok(!row[5] || row[5].every(n => n === 0));
      }
    }
    assert.deepEqual(side.days.flat().reduce((wl, row) => [wl[0] + row[8][0], wl[1] + row[8][1]], [0, 0]), side.wl);
  }
  const mitchell = boxes['1'].h.days[0].find(p => p[0] === 'YAT100867');
  assert.deepEqual(mitchell[4], [4,4,1,1,0,0,0,0,0], 'Actual March 23 spring training line reaches stored scorer');
  assert.deepEqual(boxes['133'].h.days[0].find(p => p[0] === 'YAT100751')[5].slice(0,8), [6,0,1,0,2,1,0,0], 'Spring training pitching counts');
  assert.deepEqual(boxes['133'].h.days[0].find(p => p[0] === 'YAT151012')[4], [3,3,1,0,0,0,0,0,0], 'Exhibition batting counts');
  assert.equal(reply.body.lines.find(line => line[1] === 'YAT151012')[8], 'DOUBLE-A', 'Affiliate is not labeled MLB');

  // Boundary fixtures: stale logs cannot restore an excluded game through
  // isWin, even when the log lacks gameType or its schedule moved later.
  for (const [game_type, n] of ['I', 'A'].map((t, i) => [t, i])) {
    const game = String(990000 + n);
    schedules.push({ game, day: 10, game_type, home: YANKEES, away: 'Fixture visitor', home_runs: 99, away_runs: 0, status: 'Final', start: null });
    sourceLines.push({ ...sourceLines[0], game, day: 0, game_type: null, stats: { plateAppearances: 99, atBats: 99, hits: 99 } });
    sourceClubs.push({ team: YANKEES, game, day: 0, is_win: true });
    sourceClubs.push({ team: YANKEES, game: 'unknown-' + game, day: 0, is_win: true, game_type });
    sourceLines.push({ ...sourceLines[0], game: 'unknown-' + game, day: 0, game_type });
  }
  const excluded = await request();
  assert.deepEqual(excluded.body.lines, reply.body.lines, 'No intrasquad/All-Star line through either source or schedule authority');
  assert.deepEqual(excluded.body.clubs, reply.body.clubs, 'No excluded game result fallback');
  assert.deepEqual(excluded.body.games, reply.body.games);

  // A source can already hold tomorrow's results during a replay. The
  // shared scorer must still limit every stored daily/weekly row to today.
  schedules.push({ game: 'future-regular', day: 3, game_type: 'R', home: YANKEES, away: 'Fixture visitor', home_runs: 99, away_runs: 0, status: 'Final', start: null });
  sourceLines.push({ ...sourceLines[0], game: 'future-regular', day: 3, stats: { plateAppearances: 99, atBats: 99, hits: 99 } });
  const future = await request();
  assert.deepEqual(score(future.body), boxes, 'Future regular-season input cannot alter this day’s saved scoreboard or Stat Ledger');

  const supportedTypes = ['S', 'E', ' s ', 'R', 'F', 'D', 'L', 'W', 'C', 'P', null, undefined, '', 'college'];
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
  for (const type of ['I', 'A', ' i ']) assert.equal(isBracketGameType(type), false);
  console.log('PASS spring batting/pitching, exhibition club outcomes, complete rosters, excluded-game fallback and future cutoff');
})().catch(error => { console.error(error); process.exitCode = 1; });
