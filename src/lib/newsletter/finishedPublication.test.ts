// Unit fixtures only: these are not historical first-day publication proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFinishedEdition, renderFinishedEdition, stableJson, type FinishedEdition, type Row } from './finishedPublication';

function fixture(): FinishedEdition {
  const game = { stats_date: '2026-03-25', season_key: '2027', region: 7, game_id: 501, week: 1,
    home_hsid: 5004, away_hsid: 7, home_label: 'Hamilton', away_label: 'Other School', home_innings: ['1', '0', '2'], away_innings: ['0', '1', '0'],
    home_runs: 3, away_runs: 1, through_inning: 3, is_final: false };
  return { version: 'finished-publication-v1',
    ready: { cadence: 'daily', period_start: '2026-03-25', period_end: '2026-03-25', season_key: '2027', week: 1,
      cutoff_at: '2026-03-26T11:00:00Z', ready_at: '2026-11-22T12:00:00Z', row_counts: { daily_stat_lines: 2, daily_game_stories: 1, daily_game_scores: 1 } },
    recipient: { firebase_uid: 'fixture-fan', email: 'fixture@example.invalid', first_name: 'Fixture', home_hsid: 5004, home_school_name: 'Hamilton', plan: 'fan', is_superfan: false },
    control: { enabled: false, approved_layout_version: null, approved_by: null },
    selection: { seasonKey: '2027', region: 7, favorites: ['YAT000001'], picks: [{ position: 1, hsid: 7, label: 'Other School' }, { position: 2, hsid: 99, label: 'Idle School' }] },
    rows: {
      daily_stat_lines: [{ stats_date: '2026-03-25', stat_line_id: '1', yatid: 'YAT000001', line: 'Saved batter (Club, MLB): 2-for-4, HR', sort_key: 'a' }],
      daily_game_stories: [{ stats_date: '2026-03-25', hsid: 5004, season_key: '2027', region: 7, game_id: 501, school_name: 'Hamilton',
        opponent_name: 'Other School', title: 'HAMILTON LEADS', story: 'Hamilton leads 3-1.', series_note: 'Game 1 of 3.', shout_outs: [] }],
      daily_game_scores: [game], weekly_player_lines: [], weekly_box_scores: [],
    } };
}
const request = { cadence: 'daily' as const, date: '2026-03-25', email: 'fixture@example.invalid', seasonKey: '2027' };
function database(facts = fixture()) {
  const queries: string[] = [];
  return { queries, async query(sql: string, values: any[] = []) {
    queries.push(sql);
    assert.match(sql, /^SELECT /, 'publication helper must be read-only');
    assert.doesNotMatch(sql, /\b(?:master_bracket|player_game_logs|stat_lines|flip_card_front_stage)\b/i, 'publication reader must not access raw or scoring data');
    if (sql.includes(' FROM edition_ready ')) return { rows: [facts.ready] };
    if (sql.startsWith('SELECT count(*)')) { const name = sql.match(/ FROM (\w+)/)![1]; return { rows: [{ count: facts.ready.row_counts[name] }] }; }
    if (sql.includes(' FROM newsletter_recipients ')) return { rows: [facts.recipient] };
    if (sql.includes(' FROM alumni_newsletter_control')) return { rows: [facts.control] };
    if (sql.includes(' FROM newsletter_favorites ')) return { rows: facts.selection.favorites.map(yatid => ({ yatid })) };
    if (sql.includes(' FROM user_scoreboard_schools ')) return { rows: facts.selection.picks };
    for (const [name, rows] of Object.entries(facts.rows)) if (sql.includes(' FROM ' + name + ' ')) {
      if (name === 'daily_stat_lines') return { rows: rows.filter(row => values[1].includes(row.yatid)) };
      return { rows };
    }
    throw new Error('Unexpected query: ' + sql);
  } };
}

test('finished reader selects YAT favorites and the actual home-game region without reading raw data or preferences', async () => {
  const facts = fixture();
  facts.rows.daily_stat_lines.push({ stats_date: '2026-03-25', stat_line_id: '2', yatid: 'YAT000002', line: 'Home player who was not favorited', sort_key: 'b' });
  facts.recipient.region = 1; // Obsolete preference must not become the 2027 game.
  const db = database(facts), read = await readFinishedEdition(db, request);
  assert.equal(read.selection.region, 7);
  assert.equal(read.rows.daily_stat_lines.length, 1);
  assert.equal(read.rows.daily_stat_lines[0].yatid, 'YAT000001');
  assert.ok(db.queries.every(sql => !sql.includes('playerid')));
  assert.equal(read.control.enabled, false);
});

test('missing ready row, missing YAT identity and incomplete period all block rendering', async () => {
  let calls = 0;
  await assert.rejects(readFinishedEdition({ query: async () => { calls++; return { rows: [] }; } }, request), /No finished edition_ready/);
  assert.equal(calls, 1);
  const noYat = database();
  const base = noYat.query.bind(noYat);
  noYat.query = async (sql, values) => sql.includes('newsletter_favorites') ? { rows: [{ yatid: null }] } : base(sql, values);
  await assert.rejects(readFinishedEdition(noYat, request), /YAT ID/);
  const incomplete = database(), read = incomplete.query.bind(incomplete);
  incomplete.query = async (sql, values) => sql.includes('count(*)') ? { rows: [{ count: 999 }] } : read(sql, values);
  await assert.rejects(readFinishedEdition(incomplete, request), /count differs/);
});

test('daily layout keeps saved values, deduplicates home-game picks, and stacks mobile scoreboards', () => {
  const facts = fixture(), result = renderFinishedEdition(facts, { baseUrl: 'https://isolated.example.invalid/5004?asof=2026-03-25' });
  assert.equal(result.rowKeys.daily_game_scores.filter((slot: any) => slot.key).length, 1);
  assert.equal(result.rowKeys.daily_game_scores.length, 12);
  assert.match(result.html, /board-columns\{grid-template-columns:minmax\(0,1fr\)[;}]/);
  assert.match(result.html, /Saved batter \(Club, MLB\): 2-for-4, HR/);
  assert.doesNotMatch(result.html, /pipeline|approved_by|review-copy|commissioner/i);
  assert.match(result.html, /https:\/\/isolated\.example\.invalid\/5004\?asof=2026-03-25/);
  assert.doesNotMatch(result.html, /https:\/\/yatstats\.com/);
  assert.equal(result.facts.presentation?.baseUrl, 'https://isolated.example.invalid/5004?asof=2026-03-25');
  assert.deepEqual(result.hashes, renderFinishedEdition(result.facts).hashes);
  assert.equal(result.hashes.html, createHash('sha256').update(result.html).digest('hex'));
  assert.equal(result.hashes.text, createHash('sha256').update(result.text).digest('hex'));
});

test('the supplied Daily Digest newspaper template retains its sections and changes no finished facts', () => {
  const facts = fixture(), original = stableJson(facts);
  const result = renderFinishedEdition(facts);
  assert.equal(stableJson(facts), original);
  assert.equal(stableJson(result.facts), original);
  assert.equal(result.layoutVersion, 'daily-digest-phone8-v2');
  const sections = ['YOUR HOMETOWN. THEIR NEXT CHAPTER.', 'MY FAVORITES', 'The Daily Digest', 'MY FAVORITES',
    'THE FANTASY DESK', 'Daily Double', '>Connect<', '>Contribute<', '>Remember<'];
  const documentBody = result.html.slice(result.html.indexOf('<body')).toLowerCase();
  let previous = -1;
  for (const heading of sections) { const index = documentBody.indexOf(heading.toLowerCase(), previous + 1); assert.ok(index > previous, 'Missing or reordered section: ' + heading); previous = index; }
  assert.equal((result.html.match(/data-slot="/g) || []).length, 12);
  // Pete's Nov 22 2026 masthead: date year first | MY FAVORITES | weekday.
  assert.match(result.html, /<td class="left">2026 March 26<\/td><td class="mid">My Favorites<\/td><td class="right">Thursday<\/td>/);
  assert.doesNotMatch(result.html, /FAN FAVORITES|WHERE THEY YAT/);
  const withSite = renderFinishedEdition(facts, { baseUrl: 'https://hamilton.az.yatstats.com/' });
  assert.match(withSite.html, /<img src="https:\/\/hamilton\.az\.yatstats\.com\/img\/newsletter\/daily-digest-logo\.png" alt="The Daily Digest, powered by YAT\?STATS">/);
  assert.match(result.html, /board-crown/);
  assert.doesNotMatch(result.html, /TEST REPLAY|DESIGN PROOF|Commissioner|needs_decision/);
});

test('no favorites and favorites with no appearances remain distinct; HTML is escaped and private text is rejected', () => {
  const facts = fixture();
  facts.rows.daily_stat_lines = []; facts.selection.favorites = [];
  assert.match(renderFinishedEdition(facts).text, /haven't picked any favorites/);
  facts.selection.favorites = ['YAT000001'];
  assert.match(renderFinishedEdition(facts).text, /None of your players were in action yesterday/);
  facts.rows.daily_game_stories[0].story = '<script>alert("x")</script>';
  assert.match(renderFinishedEdition(facts).html, /&lt;script&gt;/);
  assert.doesNotMatch(renderFinishedEdition(facts).html, /<script>/);
  facts.rows.daily_game_stories[0].story = 'Pipeline notes for commissioner review';
  assert.throws(() => renderFinishedEdition(facts), /Internal text/);
});

test('weekly edition prints full saved roster and box cells, preserving club-transfer lines and extra innings without rescoring', () => {
  const facts = fixture();
  facts.ready = { ...facts.ready, cadence: 'weekly', period_start: '2026-03-23', period_end: '2026-03-29', cutoff_at: '2026-03-30T11:00:00Z', row_counts: { weekly_player_lines: 2, weekly_box_scores: 1 } };
  facts.rows.daily_stat_lines = []; facts.rows.daily_game_stories = []; facts.rows.daily_game_scores = [];
  facts.rows.weekly_player_lines = ['Old Club 2-0', 'New Club 0-1'].map((club, i) => ({ period_start: '2026-03-23', hsid: 5004, yatid: 'YAT000001', team_name: club, games: 1, line: 'Saved player (' + club + '): finished line ' + i }));
  const table = { columns: ['Player', 'Team', 'OPS+'], rows: [['Saved player', 'Saved club', '89.123']], totals: ['Totals', '', '89.123'] };
  facts.rows.weekly_box_scores = [{ period_start: '2026-03-23', season_key: '2027', region: 7, game_id: 501, home_hsid: 5004, away_hsid: 7,
    home_name: 'Hamilton', away_name: 'Other School', home_runs: 17, away_runs: 16,
    line_score: { columns: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'R'], home: ['0','0','0','0','0','0','0','0','0','1','17'], away: ['0','0','0','0','0','0','0','0','0','0','16'] },
    home_batting: table, away_batting: table, home_pitching: table, away_pitching: table, extra_base_hits: { home: ['HR: Saved player'], away: [] } }];
  const result = renderFinishedEdition(facts);
  assert.match(result.subject, /Weekly Gazette/);
  assert.match(result.text, /Old Club 2-0/); assert.match(result.text, /New Club 0-1/);
  assert.match(result.text, /89\.123/); assert.match(result.text, /Other School 16 · Hamilton 17/);
  assert.match(result.html, /<th>10<\/th>/);
  assert.equal(result.rowKeys.weekly_player_lines.length, 2);
  const db = database(facts);
  return readFinishedEdition(db, { ...request, cadence: 'weekly', date: '2026-03-23' }).then(read => assert.equal(read.rows.weekly_player_lines.length, 2));
});

test('Next Game prints once per player, worded as his card words it (Pete, Nov 23 2026)', () => {
  const facts = fixture();
  const first = facts.rows.daily_stat_lines[0];
  facts.rows.daily_stat_lines.push({ ...first, stat_line_id: '1b', line: 'second line', sort_key: 'a2',
    next_game_date: '2026-10-14', next_game_home_away: 'vs.', next_game_opponent: 'Peoria Javelinas' });
  facts.ready.row_counts = { ...facts.ready.row_counts, daily_stat_lines: 2 };
  const html = renderFinishedEdition(facts).html;
  assert.equal((html.match(/class="favorite-next"/g) || []).length, 1);
  assert.match(html, /<strong>Next Game<\/strong> \| Wednesday, 10\/14 vs\. Peoria Javelinas/);
  facts.rows.daily_stat_lines[1].next_game_home_away = '@';
  assert.match(renderFinishedEdition(facts).html, /Wednesday, 10\/14 @ Peoria Javelinas/);
  delete facts.rows.daily_stat_lines[1].next_game_date;
  assert.doesNotMatch(renderFinishedEdition(facts).html, /class="favorite-next"/);
});
