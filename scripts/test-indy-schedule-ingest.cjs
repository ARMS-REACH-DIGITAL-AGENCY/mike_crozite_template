'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS fixture runner compiles the actual TypeScript module with an isolated database dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/lib/indySchedules.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, {
  module: loaded, exports: loaded.exports, console, URL, fetch, AbortSignal, Intl,
  require: (name) => name === '@/lib/dbWriter'
    ? { writerQuery: () => { throw new Error('Test must explicitly inject its database'); } }
    : require(name),
}, { filename });
const { parseIndySchedulePayload, attachIndyFinalScore, syncIndyScheduleSeason, fillIndyCanonicalTeamLinks } = loaded.exports;

const season = {
  source_system: 'iscore_central', league_code: 'EXAMPLE', season_id: 'season-2026', league_id: 'league-a',
  season_year: 2026, season_start: '2026-04-21', season_end: '2026-09-13', schedule_timezone: 'America/New_York',
  game_type: 'R', source_url: 'https://example.com/official-season',
};
const game = (id, fields = {}) => ({
  gameGuid: id, homeTeam: { id: 'home-id', name: 'Home Club' }, awayTeam: { id: 'away-id', name: 'Away Club' },
  season: { id: 'season-2026', name: '2026 Championship Season' }, scheduledDate: '2026-07-23T21:00:00Z',
  gameInfo: { location: 'Home Ballpark' }, leagueId: 'league-a', gameStatusId: 3, ...fields,
});
const score = (id, fields = {}) => ({
  status: 'FINAL', gameSummary: { game_id: id },
  teams: { HOME: { id: 'home-id', runs: 5, shortName: 'HOM' }, AWAY: { id: 'away-id', runs: 0, shortName: 'AWY' } },
  ...fields,
});
const parse = (rows) => parseIndySchedulePayload(rows, season);
let cases = 0;
function check(label, fn) { fn(); cases++; console.log(`PASS ${label}`); }

check('same-date, same-time doubleheader retains distinct source IDs', () => {
  const result = parse([game('first'), game('second')]);
  assert.equal(result.games.length, 2);
  assert.equal(result.games[0].game_date, '2026-07-23');
  assert.equal(result.games[1].source_game_id, 'second');
});
check('season UUID, league identity, and approved window reject unrelated/test dates', () => {
  const result = parse([
    game('real'), game('wrong-season', { season: { id: 'season-2027', name: '2027' } }),
    game('wrong-league', { leagueId: 'league-b' }), game('preseason', { scheduledDate: '2026-03-10T22:35:00Z' }),
    game('next-year', { scheduledDate: '2027-01-31T22:35:00Z' }),
    game('test-season', { season: { id: season.season_id, name: 'DO-NOT-USE-2026 Season' } }),
  ]);
  assert.equal(result.games.length, 1);
  assert.equal(result.rejected.other_league_or_season, 2);
  assert.equal(result.rejected.outside_season_window, 2);
  assert.equal(result.rejected.test_season, 1);
});
check('late-evening local game retains its calendar date after UTC midnight', () => {
  const result = parse([game('late', { scheduledDate: '2026-07-24T01:30:00Z' })]);
  assert.equal(result.games[0].game_date, '2026-07-23');
  assert.equal(result.games[0].game_time_utc, '2026-07-24T01:30:00.000Z');
});
check('offset-free timestamps and invalid team identities fail closed', () => {
  const result = parse([
    game('ambiguous-time', { scheduledDate: '2026-07-23T21:00:00' }),
    game('same-team', { awayTeam: { id: 'home-id', name: 'Home Club' } }),
  ]);
  assert.equal(result.games.length, 0);
});
check('unknown status is reported without guessing a final result', () => {
  const result = parse([game('unknown', { gameStatusId: 99 })]);
  assert.equal(result.games.length, 0);
  assert.equal(result.rejected.unknown_status, 1);
});
check('exact repeated IDs deduplicate, contradictory records abort the batch', () => {
  assert.equal(parse([game('same'), game('same')]).games.length, 1);
  assert.throws(() => parse([game('same'), game('same', { gameStatusId: 2 })]), /Conflicting schedule/);
});
check('source shape change cannot silently import zero games', () => {
  assert.throws(() => parse({ message: 'not authorized' }), /not a game array/);
});
check('verified score preserves shutout zero and source abbreviations', () => {
  const row = parse([game('score')]).games[0];
  assert.equal(attachIndyFinalScore(row, score('score')), true);
  assert.equal(row.home_score, 5);
  assert.equal(row.away_score, 0);
  assert.equal(row.home_team_abbrev, 'HOM');
});
check('stale in-progress snapshots do not become final scores', () => {
  const row = parse([game('score')]).games[0];
  assert.equal(attachIndyFinalScore(row, score('score', { status: 'IN_PROGRESS' })), false);
  assert.equal(row.status, 'Final');
  assert.equal(row.home_score, null);
});
check('wrong-game and wrong-team scores never attach', () => {
  const row = parse([game('score')]).games[0];
  assert.equal(attachIndyFinalScore(row, score('another-game')), false);
  assert.equal(attachIndyFinalScore(row, score('score', {
    teams: { HOME: { id: 'another-team', runs: 5 }, AWAY: { id: 'away-id', runs: 0 } },
  })), false);
});

async function run() {
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    assert.match(sql.trim(), /^(?:WITH|SELECT)\b/, 'default dry run cannot issue a mutation');
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i, 'a read-only CTE cannot hide a mutation');
    if (sql.includes('canonical_ids')) return { rows: [
      { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
        source_team_id: 'home-id', source_team_name: 'Home Club', canonical_ids: ['100'] },
      { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
        source_team_id: 'away-id', source_team_name: 'Away Club', canonical_ids: ['200', '201'] },
    ] };
    return { rows: [] };
  };
  const result = await syncIndyScheduleSeason(season, {
    query, inputPayload: [game('score')], inputScores: { score: score('score') },
    fetcher: async () => { throw new Error('A saved payload replay must not fetch'); },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.gamesWritten, 0);
  assert.equal(result.teamsResolved, 1);
  assert.equal(result.unresolvedTeams[0], 'Away Club');
  assert.equal(result.scoresAttached, 1);
  cases++; console.log('PASS default dry run reads only and reports ambiguous canonical teams');

  let requests = 0;
  const windows = [];
  const many = Array.from({ length: 1000 }, (_, i) => game(`other-${i}`, { leagueId: 'unrelated' }));
  const paged = await syncIndyScheduleSeason(season, {
    query, scoreLimit: 0,
    fetcher: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/api/public/games');
      assert.equal(parsed.searchParams.get('leagueId'), season.league_id);
      assert.equal(parsed.searchParams.get('take'), '1000');
      windows.push([parsed.searchParams.get('startDateFrom'), parsed.searchParams.get('startDateTo')]);
      const body = requests++ === 0 ? many : [game('one')];
      return { ok: true, json: async () => body };
    },
  });
  assert.equal(requests, 3);
  assert.ok(Date.parse(windows[1][1]) < Date.parse(windows[2][0]));
  assert.equal(paged.gamesAccepted, 1);
  cases++; console.log('PASS a full public API window is split instead of truncated');

  await assert.rejects(syncIndyScheduleSeason(season, {
    query, scoreLimit: 0, fetcher: async () => ({ ok: false, status: 401 }),
  }), /HTTP 401/);
  cases++; console.log('PASS upstream access error surfaces without attempting a fallback or write');

  await assert.rejects(fillIndyCanonicalTeamLinks([
    { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
      source_team_id: 'home-id', source_team_name: 'Home Club', teamid: '100' },
    { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
      source_team_id: 'home-id', source_team_name: 'Home Club', teamid: '999' },
  ], { query: async () => { throw new Error('An ambiguous identity must fail before querying'); } }), /Ambiguous canonical team/);
  cases++; console.log('PASS contradictory canonical identities fail before any database query');
  console.log(`${cases} independent schedule ingestion regression cases passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
