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
      daily_game_scores: [game], weekly_player_lines: [], weekly_box_scores: [], newsletter_transactions: [],
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

test('daily scoreboard: home game first, then the region\'s top 7 scores (Pete, Nov 24 2026)', () => {
  const facts = fixture();
  const other = (game_id: number, away_seed: number, home_seed: number, away_runs: number, home_runs: number, region = 7) => ({
    stats_date: '2026-03-25', season_key: '2027', region, game_id, week: 1, home_hsid: 1000 + game_id, away_hsid: 2000 + game_id,
    home_label: 'Home ' + game_id, away_label: 'Away ' + game_id, home_seed, away_seed,
    home_innings: [String(home_runs)], away_innings: [String(away_runs)], home_runs, away_runs, through_inning: 1, is_final: false });
  facts.rows.daily_game_scores.push(
    other(502, 16, 1, 0, 0), other(503, 15, 2, 1, 1), other(504, 14, 3, 0, 0), other(505, 13, 4, 0, 0),
    other(506, 12, 5, 0, 0), other(507, 10, 7, 1, 0), other(508, 9, 8, 0, 0), other(510, 11, 6, 0, 0), other(509, 16, 1, 9, 9, 8));
  const result = renderFinishedEdition(facts);
  const keys = result.rowKeys.daily_game_scores as Array<{ slot: unknown; key: unknown[] }>;
  assert.deepEqual(keys.map(slot => slot.key[3]), [501, 503, 507, 502, 504, 505, 506, 510]);
  assert.equal(keys[0].slot, 'home');
  assert.equal((result.html.match(/data-slot="/g) || []).length, 8);
  assert.doesNotMatch(result.html, /ADD A TEAM/);
});

test('daily scoreboard uses the drawn board picture when it exists', () => {
  const before = process.env.NEWSLETTER_BOARD_IMAGE_BASE;
  process.env.NEWSLETTER_BOARD_IMAGE_BASE = 'https://boards.example.invalid/nl/digest/';
  try {
    const result = renderFinishedEdition(fixture());
    assert.match(result.html, /<img src="https:\/\/boards\.example\.invalid\/nl\/digest\/2026-03-25\/5004\.png" alt="Region 7 scoreboard: /);
    assert.doesNotMatch(result.html, /data-slot="/);
  } finally {
    if (before == null) delete process.env.NEWSLETTER_BOARD_IMAGE_BASE; else process.env.NEWSLETTER_BOARD_IMAGE_BASE = before;
  }
});

test('daily layout keeps saved values', () => {
  const facts = fixture(), result = renderFinishedEdition(facts, { baseUrl: 'https://isolated.example.invalid/5004?asof=2026-03-25' });
  assert.equal(result.rowKeys.daily_game_scores.length, 1);
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
  assert.equal((result.html.match(/data-slot="/g) || []).length, 1);
  // Pete's Nov 22 2026 masthead: date year first | MY FAVORITES | weekday.
  // The masthead dateline: date, MY FAVORITES, weekday, each cell with its own
  // light background so Outlook keeps it light (Pete, Nov 24 2026).
  assert.match(result.html, /<td class="left"[^>]*bgcolor="#f5f1e6"[^>]*>2026 March 26<\/td><td class="mid"[^>]*>My Favorites<\/td><td class="right"[^>]*>Thursday<\/td>/);
  assert.match(result.html, /<table role="presentation" class="masthead-table"[^>]*bgcolor="#f5f1e6"/);
  assert.doesNotMatch(result.html, /FAN FAVORITES|WHERE THEY YAT/);
  const withSite = renderFinishedEdition(facts, { baseUrl: 'https://hamilton.az.yatstats.com/' });
  assert.match(withSite.html, /<img src="https:\/\/hamilton\.az\.yatstats\.com\/img\/newsletter\/daily-digest-logo\.png" alt="The Daily Digest, powered by YAT\?STATS"[^>]*>/);
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

test('the Gazette follows the approved TEST 3 proof (Pete, Nov 24 2026; docs/newsletter-reference/)', () => {
  const facts = fixture();
  facts.ready = { ...facts.ready, cadence: 'weekly', period_start: '2026-03-23', period_end: '2026-03-29', cutoff_at: '2026-03-30T11:00:00Z', week: 1,
    row_counts: { weekly_player_lines: 3, weekly_box_scores: 1, weekly_player_totals: 2 } };
  facts.rows.daily_stat_lines = []; facts.rows.daily_game_stories = []; facts.rows.daily_game_scores = [];
  facts.selection.favorites = ['YAT000001', 'YAT000009'];
  facts.presentation = { baseUrl: 'https://hamilton.az.yatstats.com/', schoolLocation: 'Chandler, AZ',
    gazette: { mastheadUrl: 'https://hamilton.az.yatstats.com/gazette-masthead.jpg', teamLogoBase: 'https://hamilton.az.yatstats.com/logo/' } };
  const line = (yatid: string, name: string, stats: Record<string, unknown>) => ({ period_start: '2026-03-23', hsid: 5004, yatid, player_name: name, team_name: 'Club', games: 1, line: name, stats });
  facts.rows.weekly_player_lines = [
    line('YAT000001', 'Cody Bellinger', { pitcher: false, teamid: '20', bat: [13, 11, 4, 0, 1, 0, 2, 0, 0], pit: 0, ops_plus: 183, fip_minus: null, club_wl: [3, 0] }),
    line('YAT000002', 'Beau Berge', { pitcher: false, teamid: null, bat: 0, pit: 0, ops_plus: null, fip_minus: null, club_wl: null }),
    line('YAT000003', 'Dom Hamel', { pitcher: true, teamid: '531', bat: 0, pit: [11, 0, 5, 0, 2, 6, 7, 7, 5.07], ops_plus: null, fip_minus: 132, club_wl: [1, 1] }),
  ];
  facts.rows.weekly_player_totals = [
    { period_start: '2026-03-23', yatid: 'YAT000001', player_name: 'Cody Bellinger', teamid: '20', bat: [13, 11, 4, 0, 1, 0, 2, 0, 0], pit: null, pitcher: false },
    { period_start: '2026-03-23', yatid: 'YAT000009', player_name: 'Kevin Ginkel', teamid: '29', bat: [0, 0, 0, 0, 0, 0, 0, 0, 0], pit: [9, 0, 2, 0, 6, 3, 1, 1, 0, 0], pitcher: true },
  ];
  const table = (total: string) => ({ columns: [], rows: [], totals: ['Totals', '', '0', '0', '0', '0', '0', '0', '0', '0', '0', total] });
  facts.rows.weekly_box_scores = [{ period_start: '2026-03-23', season_key: '2027', region: 7, game_id: 385, home_hsid: 5004, away_hsid: 7,
    home_name: 'Hamilton', away_name: 'Other School', home_runs: 3, away_runs: 4,
    home_batting: table('160'), away_batting: table(''), home_pitching: { totals: ['Totals', '', '', '', '', '', '', '', '', '', '119'] }, away_pitching: table(''),
    home_story: { title: 'Hamilton falls to Other School, 4-3.', paragraphs: ['No. 1 Hamilton lost to No. 128 Other School 3-4 in Week 1 of Round 1 (March 23–March 29). Other School leads the series 1-0.', 'Leading the way for the Huskies: Cody Bellinger (MLB) went 4-for-11 with 1 triple, 2 walks.'] },
    away_story: { title: 'x', paragraphs: [] } }];
  const result = renderFinishedEdition(facts);
  assert.match(result.subject, /^YAT-A-BOY Weekly Gazette \| Hamilton/);
  const order = ['Yataboy Gazette', 'HAMILTON', 'Chandler, Arizona', 'WEEKLY EDITION · WEEK 1', 'Monday, March 30, 2026', 'HAMILTON\'S WEEK',
    'Hamilton falls to Other School, 4-3.', 'Hi Fixture,', 'leads the series 1-0', 'Leading the way for the Huskies', 'Hamilton Alumni Stats',
    'Week of March 23–March 29, 2026', 'Hamilton\'s 3 active alumni. Your favorites are in bold.', '>BATTERS<', '>PITCHERS<', 'YOUR 2 SUPERFAN FAVORITES',
    'See each day of the week in the stat drawer'];
  let at = -1;
  for (const piece of order) { const k = result.html.indexOf(piece.replace(/'/g, '&#x27;'), at + 1) >= 0 ? result.html.indexOf(piece.replace(/'/g, '&#x27;'), at + 1) : result.html.indexOf(piece, at + 1); assert.ok(k > at, 'Missing or out of order: ' + piece); at = k; }
  // Bellinger (a favorite) in bold with the TEST 3 columns: OPS+, W-L, AB..SF, OBP, SLG, OPS.
  assert.match(result.html, /<tr align=center style="font-weight:bold"><td align=left style="font-size:13px"><img src="https:\/\/hamilton\.az\.yatstats\.com\/logo\/20" width="16" height="16" alt="" style="vertical-align:middle"> Bellinger<td style="color:#b8860b">183<td>3-0<td>11<td>4<td>0<td>1<td>0<td>2<td>0<td>0<td>\.462<td>\.545<td>1\.007/);
  // No logo: the proof's spacer; no favorite: not bold.
  assert.match(result.html, /<tr align=center><td align=left style="font-size:13px"><span style="display:inline-block;width:16px;margin-right:5px"><\/span>Berge<td style="color:#b8860b">—<td>0-0/);
  // Pitcher: IP from outs, WHIP, K/BB, FIP; team OPS+ / FIP- from the stored game.
  assert.match(result.html, /> Hamel<td style="color:#b8860b">132<td>1-1<td>3\.2<td>6<td>7<td>7<td>0<td>5<td>0<td>2<td>3\.00<td>0\.40<td>5\.07/);
  assert.match(result.html, />BATTERS<td style="color:#b8860b">160<td>4-1</);
  assert.match(result.html, />PITCHERS<td style="color:#b8860b">119<td>4-1</);
  // Favorites: dashes for OPS+/FIP-, their own week.
  assert.match(result.html, /> Ginkel<td style="color:#b8860b">—<td>0-0<td>3\.0<td>3<td>1<td>1<td>0<td>2<td>0<td>6<td>1\.67<td>3\.00<td>—/);
  assert.doesNotMatch(result.html, /TEST REPLAY|pipeline|commissioner/i);
  assert.equal(result.layoutVersion, 'gazette-test3-v1');
  // Pete, Nov 24 2026: the favorites' transactions that week, in MLB's words.
  facts.rows.newsletter_transactions = [{ effective_date: '2026-03-27', transaction_type: 'Optioned', description: 'Cincinnati Reds optioned C Will Banfield to Louisville Bats.' }];
  const withTx = renderFinishedEdition(facts);
  assert.ok(withTx.html.indexOf("YOUR FAVORITES' TRANSACTIONS") > withTx.html.indexOf('SUPERFAN FAVORITES'));
  assert.match(withTx.html, />Mar 27<td align=left style="white-space:normal;line-height:18px;padding:4px 6px">Cincinnati Reds optioned C Will Banfield to Louisville Bats\./);
  assert.match(withTx.text, /Mar 27: Cincinnati Reds optioned C Will Banfield to Louisville Bats\./);
  const db = database(facts);
  return readFinishedEdition(db, { ...request, cadence: 'weekly', date: '2026-03-23' }).then(read => {
    assert.equal(read.rows.weekly_player_lines.length, 3);
    assert.deepEqual(read.selection.favorites, ['YAT000001', 'YAT000009']);
    assert.equal(read.rows.weekly_player_totals?.length, 2);
  });
});

test('the Digest lists the favorites\' transactions under My Favorites (Pete, Nov 24 2026)', () => {
  const facts = fixture();
  facts.rows.newsletter_transactions = [{ effective_date: '2026-03-25', transaction_type: 'Optioned', description: 'Cincinnati Reds optioned C Will Banfield to Louisville Bats.' }];
  const result = renderFinishedEdition(facts);
  const fav = result.html.indexOf('MY FAVORITES'), tx = result.html.indexOf('>TRANSACTIONS<'), desk = result.html.indexOf('The Fantasy Desk');
  assert.ok(fav > 0 && tx > fav && desk > tx, 'Transactions sit between My Favorites and the Fantasy Desk');
  assert.match(result.html, /Cincinnati Reds optioned C Will Banfield to Louisville Bats\./);
  assert.match(result.text, /TRANSACTIONS\nCincinnati Reds optioned C Will Banfield to Louisville Bats\./);
  facts.rows.newsletter_transactions = [];
  assert.doesNotMatch(renderFinishedEdition(facts).html, />TRANSACTIONS</);
});

test('Next Game prints once per player, worded as his card words it (Pete, Nov 23 2026)', () => {
  const facts = fixture();
  const first = facts.rows.daily_stat_lines[0];
  facts.rows.daily_stat_lines.push({ ...first, stat_line_id: '1b', line: 'second line', sort_key: 'a2',
    next_game_date: 'Wednesday | October 14, 2026', next_game_home_away: 'vs.', next_game_opponent: 'Peoria Javelinas' });
  facts.ready.row_counts = { ...facts.ready.row_counts, daily_stat_lines: 2 };
  const html = renderFinishedEdition(facts).html;
  assert.equal((html.match(/class="favorite-next"/g) || []).length, 1);
  // Pete, Nov 24 2026: the label on its own line, then the game with commas.
  assert.match(html, /<span class="fav-text">Next Game<\/span><\/td><\/tr><tr><td align="left" valign="top" colspan="2" class="favorite-next-game"[^>]*><span class="fav-text">Wednesday, October 14, 2026 vs\. Peoria Javelinas<\/span>/);
  facts.rows.daily_stat_lines[1].next_game_home_away = '@';
  assert.match(renderFinishedEdition(facts).html, /Wednesday, October 14, 2026 @ Peoria Javelinas/);
  delete facts.rows.daily_stat_lines[1].next_game_date;
  assert.doesNotMatch(renderFinishedEdition(facts).html, /class="favorite-next"/);
});
