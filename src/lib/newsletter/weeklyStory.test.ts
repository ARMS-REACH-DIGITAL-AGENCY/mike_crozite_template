// The Gazette letter worded as the approved proofs (docs/newsletter-reference/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyStory, type StoryGame, type StoryPlayer } from './weeklyStory';

const info = (h: number) => ({ 5004: { name: 'Hamilton', city: 'Chandler, AZ', nickname: 'Huskies' }, 15525: { name: 'Campo Verde', city: 'Gilbert, AZ', nickname: 'Coyotes' }, 13700: { name: 'Aledo', city: 'Aledo, TX', nickname: 'Bearcats' } } as Record<number, { name: string; city: string; nickname: string }>)[h];
const swift: StoryPlayer = ['YAT1', 'Drew Swift', 'TRIPLE-A', 0, [18, 16, 5, 1, 1, 0, 2, 0, 0], 0, 150, null, [3, 0]];
const bell: StoryPlayer = ['YAT2', 'Cody Bellinger', 'MLB', 0, [20, 18, 4, 1, 0, 1, 2, 0, 0], 0, 120, null, [4, 2]];
const tied: StoryPlayer = ['YAT3', 'Josh Tiedemann', 'SINGLE-A', 1, 0, [6, 0, 1, 0, 3, 1, 0, 0, 2.1], null, 40, [2, 1]];
const g = (week: number, game_no: number, hr: number, ar: number, extra: Partial<StoryGame> = {}): StoryGame => ({ stage: 'bracket', round: 1, round_name: 'Round 1', region: 3, series_no: 1, game_no, week,
  home_hsid: 5004, away_hsid: 15525, home_seed: 2, away_seed: 127, home_runs: hr, away_runs: ar, winner_hsid: hr > ar ? 5004 : 15525,
  box: { h: { p: [swift, bell, tied] }, a: { p: [] } }, ...extra });

test('mid-series: result, series status, who led the way', () => {
  const s = weeklyStory(g(1, 1, 8, 1), 5004, [g(1, 1, 8, 1)], info, '2026-03-23', '2026-03-29', '2026-03-30');
  assert.equal(s.title, 'Hamilton beats Campo Verde, 8-1.');
  assert.equal(s.paragraphs[0], 'No. 2 Hamilton beat No. 127 Campo Verde 8-1 in Week 1 of Round 1 (March 23–March 29). Hamilton leads the series 1-0.');
  assert.equal(s.paragraphs[1], 'Leading the way for the Huskies: Drew Swift (TRIPLE-A) went 5-for-16 with 1 double, 1 triple, 2 walks; Cody Bellinger (MLB) went 4-for-18 with 1 homer, 1 double, 2 walks; Josh Tiedemann (SINGLE-A) worked 2.0 innings with 3 strikeouts and 0 earned runs.');
  const away = weeklyStory(g(1, 1, 8, 1), 15525, [g(1, 1, 8, 1)], info, '2026-03-23', '2026-03-29', '2026-03-30');
  assert.equal(away.title, 'Campo Verde falls to Hamilton, 8-1.');
  assert.equal(away.paragraphs[1], 'No Campo Verde alumni played this week.');
});

test('series over: the TEST 3 sweep letter with the next opponent', () => {
  const games = [g(1, 1, 4, 0), g(2, 2, 10, 0), g(3, 3, 6, 0),
    { ...g(4, 1, 0, 0), round: 2, round_name: 'Round 2', series_no: 1, away_hsid: 13700, away_seed: 66, winner_hsid: null }];
  const s = weeklyStory(games[2], 5004, games, info, '2026-04-06', '2026-04-12', '2026-04-13');
  assert.equal(s.title, 'Hamilton sweeps Campo Verde, 3-0.');
  assert.equal(s.paragraphs[0], "Round 1 is in the books, and the Huskies didn't drop a game. No. 2 Hamilton beat No. 127 Campo Verde 3-0 in the best-of-three (4-0, 10-0, 6-0), outscoring them 20-0 over the three weeks. Next up: No. 66 Aledo (Aledo, TX) in Round 2, starting today, April 13.");
  assert.match(s.paragraphs[1], /^The alumni who carried the series: Drew Swift \(TRIPLE-A\) went 15-for-48/);
});

test('the full recap leads with the turning point and credits only the runs a side won (Pete, Nov 25 2026)', () => {
  // Hamilton's April 5 2026 game, trimmed: innings [h1, a1, h2, a2, ...], each side's team OPS+/FIP- per inning (box.d).
  const day = (ops: number | null, fip: number | null): StoryPlayer[] => [
    ...(ops == null ? [] : [['YAT1', 'Drew Swift', 'TRIPLE-A', 0, [4, 3, 1, 0, 0, 0, 1, 0, 0], 0, ops, null] as StoryPlayer]),
    ...(fip == null ? [] : [['YAT9', 'Patrick Murphy', 'INTERNATIONAL', 1, 0, [3, 0, 0, 0, 1, 0, 0, 0, 2], null, fip] as StoryPlayer])];
  const cf = (fip: number | null): StoryPlayer[] => (fip == null ? [] : [['YAT7', 'Braydon Fisher', 'MLB', 1, 0, [3, 0, 0, 0, 1, 0, 0, 0, 2], null, fip]]);
  const game = g(2, 2, 8, 4, { away_hsid: 13700, away_seed: 128,
    innings: [0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0],
    box: { h: { p: [swift, bell, tied], wl: [4, 2], days: [day(-100, null), day(176, null), day(70, 33), day(233, null), day(188, 108), day(217, 186), day(170, 103)] },
      a: { p: [], wl: [1, 5], days: [cf(null), cf(75), cf(null), cf(null), cf(-12), cf(99), cf(null)] },
      d: [[-100, null, null, null], [176, null, null, 75], [70, null, 33, null], [233, null, null, null], [188, null, 108, -12], [217, null, 186, 99], [170, null, 103, null], [150, null, 120, 45]] } });
  const games = [g(1, 1, 3, 5, { away_hsid: 13700, away_seed: 128, winner_hsid: 13700 }), game];
  const s = weeklyStory(game, 5004, games, info, '2026-03-30', '2026-04-05', '2026-04-06');
  assert.equal(s.title, 'Hamilton beats Aledo, 8-4.');
  // Wednesday (the 3rd): Hamilton's team OPS+ was 70, so only the FIP- run counted - Murphy's, not Swift's.
  assert.equal(s.paragraphs[0], 'It was tied 1-1 after two innings, but in the 3rd, Hamilton put up a run with the help of Patrick Murphy on the mound (33 FIP-). '
    + 'Leading the way for the Huskies: Drew Swift (TRIPLE-A) went 5-for-16 (150 OPS+), Cody Bellinger (MLB) went 4-for-18 (120 OPS+) and Josh Tiedemann (SINGLE-A) worked 2.0 innings with 3 strikeouts (40 FIP-).');
  assert.equal(s.paragraphs[1], 'The Hamilton alumni never looked back, adding runs in the 4th, 5th, 6th, 7th, 8th and 9th. Aledo answered in the 2nd, 5th, 6th and 8th, mostly behind Braydon Fisher.');
  assert.match(s.paragraphs[2], /^That evens up this Fantasy Series with Aledo at a game apiece\. Week 3 should be fun\. As always, the rubber game starts today and ends on Sunday/);
  assert.match(s.paragraphs[2], /Be sure to check out the regional leaderboards below\.$/);
  assert.doesNotMatch(s.paragraphs.join(' '), /no runs scored|in the first inning\. There were/i);
});
