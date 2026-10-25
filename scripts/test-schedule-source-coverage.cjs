// Run with: node scripts/test-schedule-source-coverage.cjs
// Execute the actual shared consumer logic with schedule-only and game-log
// fixtures. No network or database calls; no rewritten copy of the policy.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS fixture harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const profile = fs.readFileSync(path.join(root, 'src/app/[hsid]/player/[playerId]/[slug]/page.tsx'), 'utf8');
const snapshot = fs.readFileSync(path.join(root, 'src/components/yatstats/PlayerSevenDaySnapshot.tsx'), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;

function loadPureModule(relativePath) {
  const scope = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, relativePath), 'utf8')), scope);
  return scope.exports;
}
const { resolveScheduleTeamId } = loadPureModule('src/lib/playerUtils.ts');
const { getTeamLogoUrl, getOriginalForCardCopy } = loadPureModule('src/lib/playerImage.ts');

function sourceFunction(source, name) {
  const file = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(file);
    else ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(found, `Actual source function ${name} exists`);
  return found;
}

function sourceSection(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Actual source section ${start} exists`);
  return source.slice(from, to);
}

const profileMatching = sourceSection(profile, '  const usedLogs = ', '  // ── Stats grids');
const profileRows = sourceSection(profile, '  const scheduleTableRows: ', '  // Opens on this season');
const summarySource = `${sourceFunction(snapshot, 'formatGameTime')}\n${sourceFunction(snapshot, 'buildGameSummary')}`;

const pastGame = {
  game_date: '2026-07-10', status: 'Final', result: 'W 6-3',
  opponent: 'Schedule opponent', home_away: 'Home', is_home: true,
  game_pk: null, schedule_source: 'iscore_central', source_game_id: 'game-one',
  tracks_player_lines: false,
};
const playerLine = {
  source: 'mlb_api', source_game_id: 'game-one', game_date: '2026-07-10',
  stat_type: 'batting', stats: { atBats: 4 }, line_summary: '4 AB',
  opponent_name: 'Log opponent',
};

function profileGames(game, logs = [], tracksLines = true) {
  const scope = {
    gameLogs: logs,
    logStints: [{ teamid: 'fixture-team', teamName: 'Fixture team', level: 'INDY', start: '2026-04-01', end: null, tracksLines }],
    stintSchedules: [[game]], todayIso: '2026-10-23', preferredType: 'batting',
    statHeaders: ['AB'], POSTSEASON_TYPES: new Set(['F', 'D', 'L', 'W', 'C', 'P']),
    NEVER_PLAYED_STATUS: /^(scheduled|pre-game|warmup)$/i,
    teamIdMap: new Map(),
    toISODate: value => String(value || '').slice(0, 10),
    formatDisplayDate: value => value,
    levelLabel: value => value,
    mlbTeamLogoUrl: () => null,
    getTeamLogoUrl, getOriginalForCardCopy,
    statCells: log => log?.stats ? [String(log.stats.atBats)] : null,
  };
  vm.runInNewContext(compile(`${sourceFunction(profile, 'resultBadge')}\n${profileMatching}\n${profileRows}\nresult = scheduleTableRows;`), scope);
  return scope.result;
}

function gameSummary(game, logs = []) {
  const logMap = new Map();
  for (const row of logs) logMap.set(row.source_game_id, [...(logMap.get(row.source_game_id) || []), row]);
  const scope = {
    game, logMap, teamIdMap: new Map(),
    mlbTeamLogoUrl: () => null, mlbTeamAbbreviation: () => '',
    getTeamLogoUrl, getOriginalForCardCopy,
  };
  vm.runInNewContext(compile(`${summarySource}\nresult = buildGameSummary(game, logMap, teamIdMap, 'America/Phoenix');`), scope);
  return scope.result;
}

test('Schedule-only final games retain the team result without inventing DNP in either consumer', () => {
  const rows = profileGames(pastGame);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resultLetter, 'W');
  assert.equal(rows[0].didNotPlay, false);
  assert.deepEqual(Array.from(rows[0].stats), ['-']);
  const summary = gameSummary(pastGame);
  assert.equal(summary.resultLine, 'W 6-3');
  assert.equal(summary.subLine, '');
});

test('MLB game-log coverage retains DNP and college stints retain their blank stats', () => {
  const mlbGame = { ...pastGame, game_pk: 123, schedule_source: 'mlb_api', source_game_id: '123' };
  delete mlbGame.tracks_player_lines;
  assert.equal(profileGames(mlbGame)[0].didNotPlay, true);
  assert.equal(gameSummary(mlbGame).subLine, 'DNP');
  assert.equal(profileGames({ ...mlbGame, game_pk: null, schedule_source: 'college', source_game_id: null }, [], false)[0].didNotPlay, false);
});

test('A same-id MLB line cannot be attached to an independent schedule game', () => {
  const rows = profileGames(pastGame, [playerLine]);
  assert.equal(rows.length, 2, 'Unmatched real MLB line is retained as its own game');
  const scheduleRow = rows.find(row => row.opponent === 'Schedule opponent');
  assert.deepEqual(Array.from(scheduleRow.stats), ['-']);
  assert.equal(scheduleRow.didNotPlay, false);
  assert.deepEqual(Array.from(rows.find(row => row.opponent === 'Log opponent').stats), ['4']);
  assert.equal(gameSummary(pastGame, [playerLine]).subLine, '');
});

test('A same-date MLB line cannot fill a source-identified independent game lacking an id', () => {
  const rows = profileGames({ ...pastGame, source_game_id: null }, [playerLine]);
  assert.equal(rows.length, 2);
  assert.deepEqual(Array.from(rows.find(row => row.opponent === 'Schedule opponent').stats), ['-']);
});

test('A verified line from the matching source still displays even for a partial-coverage feed', () => {
  const line = { ...playerLine, source: 'iscore_central' };
  const rows = profileGames(pastGame, [line]);
  assert.equal(rows.length, 1);
  assert.deepEqual(Array.from(rows[0].stats), ['4']);
  assert.equal(rows[0].didNotPlay, false);
  assert.equal(gameSummary(pastGame, [line]).subLine, '4 AB');
});

test('Legacy unmarked rows keep the existing game-id and date matching behavior', () => {
  const legacy = { ...pastGame, game_pk: 'game-one' };
  delete legacy.schedule_source;
  delete legacy.source_game_id;
  assert.deepEqual(Array.from(profileGames(legacy, [playerLine])[0].stats), ['4']);
  assert.deepEqual(Array.from(profileGames({ ...legacy, game_pk: null }, [playerLine])[0].stats), ['4']);
  assert.equal(gameSummary(legacy, [playerLine]).subLine, '4 AB');
});

function consumerTeamIds(identity, fallbackTeamId = null) {
  const scope = {
    transactionStatus: identity, teamIdMap: new Map([['147', '20']]),
    resolveScheduleTeamId,
    resolvedCurrentTeam: fallbackTeamId ? { teamid: fallbackTeamId } : null,
    mostRecentSeason: null,
  };
  vm.runInNewContext(compile(
    sourceSection(profile, '  const scheduleTeamId = resolveScheduleTeamId(', '  // ── Game Log')
    + '\nprofileId = scheduleTeamId;\n'
    + sourceSection(snapshot, '  const teamId = resolveScheduleTeamId(', '  // Only the week')
    + '\nsnapshotId = teamId;'
  ), scope);
  return [scope.profileId, scope.snapshotId];
}

test('Both shared consumers prefer canonical team ids over independent source UUIDs', () => {
  assert.deepEqual(consumerTeamIds({
    current_teamid: '12345', current_team_source: 'iscore_central',
    current_team_source_team_id: 'd286072d-6635-4bdd-baf9-5be9faf9fc58',
  }), ['12345', '12345']);
  assert.deepEqual(consumerTeamIds({
    current_teamid: '555', current_team_source: 'mlb_api', current_team_source_team_id: '147',
  }), ['555', '555']);
});

test('MLB mapping and legacy canonical-id sources retain their existing resolution', () => {
  assert.deepEqual(consumerTeamIds({ current_team_source: 'mlb_api', current_team_source_team_id: '147' }), ['20', '20']);
  assert.deepEqual(consumerTeamIds({ current_team_source: 'mlb_api', current_team_source_team_id: 'unmapped' }), [null, null]);
  assert.deepEqual(consumerTeamIds({ current_team_source: 'tbc_college', current_team_source_team_id: '321' }), ['321', '321']);
  assert.deepEqual(consumerTeamIds({ current_team_source_team_id: '321' }), ['321', '321']);
});

test('Unmapped independent source UUIDs never become schedule keys, while profile fallback remains available', () => {
  const identity = { current_team_source: 'indy_iscore', current_team_source_team_id: 'd286072d-6635-4bdd-baf9-5be9faf9fc58' };
  assert.deepEqual(consumerTeamIds(identity), [null, null]);
  assert.deepEqual(consumerTeamIds(identity, '789'), ['789', null]);
  assert.deepEqual(consumerTeamIds(null, '789'), ['789', null]);
});

test('Canonical opponent ids use the existing team image helper in both consumers', () => {
  const game = { ...pastGame, opponent_teamid: '54321' };
  const expected = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/54321.png';
  assert.equal(profileGames(game)[0].logoUrl, expected);
  assert.equal(gameSummary(game).logoUrl, expected);
});
