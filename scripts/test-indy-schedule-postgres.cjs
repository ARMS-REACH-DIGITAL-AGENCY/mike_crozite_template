'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Runs the actual ingestion SQL in an isolated Postgres-compatible fixture database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Optional isolated dependency, matching test-active-alumni-postgres.cjs:
// npm install --prefix /tmp/yatstats-indy-test-deps --ignore-scripts @electric-sql/pglite@0.3.14
// NODE_PATH=/tmp/yatstats-indy-test-deps/node_modules node scripts/test-indy-schedule-postgres.cjs
const { PGlite } = require('@electric-sql/pglite');
const filename = path.join(__dirname, '../src/lib/indySchedules.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, {
  module: loaded, exports: loaded.exports, console, URL, fetch, AbortSignal, Intl,
  require: (name) => name === '@/lib/dbWriter'
    ? { writerQuery: () => { throw new Error('Fixture database must be explicitly injected'); } }
    : require(name),
}, { filename });
const { syncIndyScheduleSeason, fillIndyCanonicalTeamLinks } = loaded.exports;
const db = new PGlite();
const query = async (sql, values) => {
  const result = await db.query(sql, values);
  return { rows: result.rows, rowCount: result.affectedRows };
};
const season = {
  source_system: 'iscore_central', league_code: 'EXAMPLE', season_id: 'season-2026', league_id: 'league-a',
  season_year: 2026, season_start: '2026-04-21', season_end: '2026-09-13', schedule_timezone: 'America/New_York',
  game_type: 'R', source_url: 'https://example.com/official-season',
};
const mappings = [
  { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
    source_team_id: 'home-id', source_team_name: 'Home Club', teamid: '100' },
  { source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
    source_team_id: 'away-id', source_team_name: 'Away Club', teamid: '200' },
];
const game = (id, changes = {}) => ({
  gameGuid: id, homeTeam: { id: 'home-id', name: 'Home Club' }, awayTeam: { id: 'away-id', name: 'Away Club' },
  season: { id: season.season_id, name: '2026 Championship Season' }, scheduledDate: '2026-07-23T21:00:00Z',
  gameInfo: { location: 'Home Ballpark' }, leagueId: season.league_id, gameStatusId: 3, ...changes,
});
const score = (id) => ({
  status: 'FINAL', gameSummary: { game_id: id },
  teams: { HOME: { id: 'home-id', runs: 5, shortName: 'HOM' }, AWAY: { id: 'away-id', runs: 0, shortName: 'AWY' } },
});
const options = {
  query, scoreLimit: 0, inputPayload: [game('doubleheader-1'), game('doubleheader-2')],
  inputScores: { 'doubleheader-1': score('doubleheader-1'), 'doubleheader-2': score('doubleheader-2') },
  fetcher: async () => { throw new Error('Saved fixtures must not access the network'); },
};
let cases = 0;
const check = (name, fn) => { fn(); cases++; console.log(`PASS ${name}`); };
const plain = (value) => JSON.parse(JSON.stringify(value));
const without = (rows, column) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== column)));

async function run() {
  await db.exec(`
    CREATE TABLE indy_iscore_leagues(league_code text PRIMARY KEY,league_name text);
    CREATE TABLE teamid_universe_mapping(teamid text PRIMARY KEY,current_team_name text,current_org_or_conference_name text);
    CREATE TABLE indy_iscore_team_source_map(
      source_system text,league_code text,season_id text,source_team_id text,source_team_name text,teamid text,updated_at timestamptz,
      PRIMARY KEY(source_system,league_code,season_id,source_team_id)
    );
    CREATE TABLE indy_iscore_player_source_map(
      source_system text,league_code text,season_id text,source_player_id text,source_team_id text,source_team_name text,
      teamid text,yatstats_playerid text,match_status text,last_seen_at timestamptz DEFAULT '2026-09-13T21:00:00Z',
      PRIMARY KEY(source_system,league_code,season_id,source_player_id)
    );
    CREATE TABLE flip_card_front_stage(
      playerid text PRIMARY KEY,current_teamid text,current_team_name text,current_org_or_conference_name text,
      status_label text DEFAULT 'RETIRED',source text DEFAULT 'official_roster',source_team_id text DEFAULT 'roster-owner',
      updated_at timestamptz DEFAULT '2026-10-20T12:00:00Z'
    );
    CREATE TABLE indy_iscore_raw_payloads(
      id bigserial PRIMARY KEY,source_system text,league_code text,payload_type text,source_url text,
      payload jsonb,payload_hash text,fetched_at timestamptz DEFAULT now(),
      UNIQUE(source_system,payload_type,source_url,payload_hash)
    );
    CREATE TABLE indy_iscore_games_raw(
      source_system text,league_code text,season_id text,league_id text,source_game_id text,game_date date,game_time_utc timestamptz,
      home_source_team_id text,away_source_team_id text,home_team_name text,away_team_name text,home_team_abbrev text,away_team_abbrev text,
      status text,venue_name text,game_type text,home_score integer,away_score integer,raw_payload jsonb,score_payload jsonb,
      raw_payload_id bigint REFERENCES indy_iscore_raw_payloads(id),updated_at timestamptz,
      PRIMARY KEY(source_system,league_code,season_id,source_game_id)
    );
    INSERT INTO indy_iscore_leagues VALUES('EXAMPLE','Example League'),('OTHER','Other League');
    INSERT INTO teamid_universe_mapping VALUES
      ('100',' Home  Club ','Example League'),('200','Away Club','Example League'),('300','Home Club','Other League');
  `);
  const players = [
    ['good', null, 'matched', 'Home Club', 'Example League', null],
    ['wrong-team', null, 'matched', 'Away Club', 'Example League', null],
    ['wrong-league', null, 'matched', 'Home Club', 'Other League', null],
    ['unmatched', null, 'unmatched', 'Home Club', 'Example League', null],
    ['conflict', '999', 'matched', 'Home Club', 'Example League', null],
    ['ambiguous', null, 'matched', 'Home Club', 'Example League', null],
    ['wrong-season', null, 'matched', 'Home Club', 'Example League', null],
    ['wrong-source-league', null, 'matched', 'Home Club', 'Example League', null],
    ['prelinked', '100', 'matched', 'Home Club', 'Example League', null],
    ['existing-stage', null, 'matched', 'Home Club', 'Example League', '777'],
  ];
  for (const [id, teamid, matched, teamName, leagueName, stageTeamId] of players) {
    await db.query('INSERT INTO flip_card_front_stage(playerid,current_teamid,current_team_name,current_org_or_conference_name) VALUES($1,$2,$3,$4)',
      [id, stageTeamId, id === 'good' ? ' Home  Club ' : teamName, leagueName]);
    await db.query(`INSERT INTO indy_iscore_player_source_map
      (source_system,league_code,season_id,source_player_id,source_team_id,source_team_name,teamid,yatstats_playerid,match_status)
      VALUES($1,$2,$3,$4,'home-id','Home Club',$5,$6,$7)`,
    [season.source_system, id === 'wrong-source-league' ? 'OTHER' : season.league_code,
      id === 'wrong-season' ? 'season-2025' : season.season_id, `${id}-source`, teamid, id, matched]);
  }
  await db.exec(`INSERT INTO indy_iscore_player_source_map
    SELECT source_system,league_code,season_id,'ambiguous-source-2',source_team_id,source_team_name,teamid,yatstats_playerid,match_status,last_seen_at
    FROM indy_iscore_player_source_map WHERE source_player_id='ambiguous-source'`);
  const beforePlayers = (await db.query('SELECT * FROM indy_iscore_player_source_map ORDER BY source_player_id')).rows;
  const beforeStage = (await db.query('SELECT * FROM flip_card_front_stage ORDER BY playerid')).rows;

  const unverified = await fillIndyCanonicalTeamLinks(mappings, { query, dryRun: false });
  check('a missing stored crosswalk cannot authorize actual identity writes', () => {
    assert.equal(unverified.playerLinksFilled, 0);
    assert.equal(unverified.stageTeamIdsFilled, 0);
  });

  const dry = await syncIndyScheduleSeason(season, options);
  check('dry run counts only safe identity links and makes no data changes', () => {
    assert.equal(dry.playerLinksEligible, 7);
    assert.equal(dry.stageTeamIdsEligible, 2);
    assert.equal(dry.playerLinksFilled, 0);
    assert.equal(dry.stageTeamIdsFilled, 0);
  });
  assert.deepEqual((await db.query('SELECT * FROM flip_card_front_stage ORDER BY playerid')).rows, beforeStage);
  assert.deepEqual((await db.query('SELECT * FROM indy_iscore_player_source_map ORDER BY source_player_id')).rows, beforePlayers);

  const first = await syncIndyScheduleSeason(season, { ...options, dryRun: false });
  check('verified source scope fills null source links and two unambiguous stage IDs', () => {
    assert.equal(first.gamesWritten, 2);
    assert.equal(first.mappingsWritten, 2);
    assert.equal(first.playerLinksFilled, 7);
    assert.equal(first.stageTeamIdsFilled, 2);
  });
  const afterPlayers = (await db.query('SELECT * FROM indy_iscore_player_source_map ORDER BY source_player_id')).rows;
  const afterStage = (await db.query('SELECT * FROM flip_card_front_stage ORDER BY playerid')).rows;
  const stageById = new Map(afterStage.map((row) => [row.playerid, row]));
  check('roster labels, status, source ownership and freshness remain byte-for-byte unchanged', () => {
    assert.deepEqual(without(afterPlayers, 'teamid'), without(beforePlayers, 'teamid'));
    assert.deepEqual(without(afterStage, 'current_teamid'), without(beforeStage, 'current_teamid'));
    assert.equal(stageById.get('good').current_teamid, '100');
    assert.equal(stageById.get('prelinked').current_teamid, '100');
    assert.equal(stageById.get('existing-stage').current_teamid, '777');
  });
  check('mismatched labels/leagues, unmatched/conflicting players and duplicate identities stay unlinked', () => {
    for (const id of ['wrong-team', 'wrong-league', 'unmatched', 'conflict', 'ambiguous', 'wrong-season', 'wrong-source-league']) {
      assert.equal(stageById.get(id).current_teamid, null, id);
    }
    for (const id of ['wrong-season-source', 'wrong-source-league-source']) {
      assert.equal(afterPlayers.find((row) => row.source_player_id === id).teamid, null, id);
    }
    assert.equal(afterPlayers.find((row) => row.source_player_id === 'conflict-source').teamid, '999');
  });
  const second = await syncIndyScheduleSeason(season, { ...options, dryRun: false });
  check('identical rerun performs no game, crosswalk or identity changes', () => {
    assert.equal(second.gamesWritten, 0);
    assert.equal(second.mappingsWritten, 0);
    assert.equal(second.playerLinksFilled, 0);
    assert.equal(second.stageTeamIdsFilled, 0);
    assert.equal(second.playerLinksEligible, 0);
    assert.equal(second.stageTeamIdsEligible, 0);
  });
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM indy_iscore_raw_payloads')).rows[0].n, 1);
  const withoutScores = await syncIndyScheduleSeason(season, { ...options, inputScores: {}, dryRun: false });
  const savedGames = (await db.query('SELECT source_game_id,home_score,away_score FROM indy_iscore_games_raw ORDER BY source_game_id')).rows;
  check('replay without score data retains verified scores and both doubleheader IDs', () => {
    assert.equal(withoutScores.gamesWritten, 0);
    assert.deepEqual(plain(savedGames), [
      { source_game_id: 'doubleheader-1', home_score: 5, away_score: 0 },
      { source_game_id: 'doubleheader-2', home_score: 5, away_score: 0 },
    ]);
  });
  const changed = await syncIndyScheduleSeason(season, {
    ...options, dryRun: false, inputScores: {}, inputPayload: [game('doubleheader-1', {
      homeTeam: { id: 'replacement-id', name: 'Home Club' }, scheduledDate: '2026-07-24T21:00:00Z',
    }), game('doubleheader-2')],
  });
  const replaced = (await db.query("SELECT home_score,away_score,score_payload,home_team_abbrev,game_date::text FROM indy_iscore_games_raw WHERE source_game_id='doubleheader-1'")).rows[0];
  check('changing a source participant clears incompatible scores while updating its date', () => {
    assert.equal(changed.gamesWritten, 1);
    assert.equal(replaced.home_score, null);
    assert.equal(replaced.away_score, null);
    assert.equal(replaced.score_payload, null);
    assert.equal(replaced.home_team_abbrev, null);
    assert.equal(replaced.game_date, '2026-07-24');
  });

  await db.exec("UPDATE indy_iscore_team_source_map SET teamid='999' WHERE source_team_id='home-id'; UPDATE indy_iscore_player_source_map SET teamid=NULL WHERE source_player_id='good-source'; UPDATE flip_card_front_stage SET current_teamid=NULL WHERE playerid='good'");
  const conflictingMap = await fillIndyCanonicalTeamLinks(mappings, { query, dryRun: false });
  check('conflicting stored canonical crosswalk blocks both identity fills', () => {
    assert.equal(conflictingMap.playerLinksFilled, 0);
    assert.equal(conflictingMap.stageTeamIdsFilled, 0);
  });
  console.log(`${cases} Postgres schedule and identity regression cases passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
