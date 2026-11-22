// Run: npx tsx --test scripts/master-bracket-national-seeding.test.ts
// Focused chronological fixture: the regional winners are known after Week
// 20, but their tied original seeds depend on runs through all of Week 21.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Live } from '../src/components/bracket/liveSeason';
import { computeSeason, ROUND_8, type Row, type Season } from './master-bracket-results';

const season: Season = {
  season_key: '2027', is_test: false, opening_day: '2026-03-23', last_day: '2026-11-15',
  weeks: 34, regions: 8, schools_per_region: 128,
};
const date = (day: number) => new Date(Date.parse(`${season.opening_day}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
const hot = [4, 4, 2, 0, 0, 1, 0, 0, 0];
const cold = [4, 4, 0, 0, 0, 0, 0, 0, 0];

function fixture() {
  const rows: Row[] = [];
  const live: Live = { asOf: date(21 * 7), roster: {}, lines: [], clubs: {} };
  for (let region = 1; region <= 8; region++) {
    const home = region, away = 100 + region;
    const homeId = `YAT${String(home).padStart(6, '0')}`, awayId = `YAT${String(away).padStart(6, '0')}`;
    live.roster[String(home)] = [[homeId, `Winner ${region}`, 'MLB', 0, `H${region}`]];
    live.roster[String(away)] = [[awayId, `Runner-up ${region}`, 'MLB', 0, `A${region}`]];
    for (let game = 1; game <= 3; game++) {
      const week = 18 + game;
      rows.push({
        stage: 'bracket', region, round: 7, series_no: 1, game_no: game, game_id: region * 100 + week, week,
        home_hsid: home, away_hsid: away, home_seed: region <= 2 ? 1 : region - 1, away_seed: 128,
        home_school_name: `Winner ${region}`, away_school_name: `Runner-up ${region}`,
        status: 'scheduled', innings: null, winner_hsid: null, decided_by: null, locked_at: null,
      });
      // Winner 1 leads Winner 2 in runs after two wins each. In the final
      // week Winner 2 overtakes it; both still win their regional series.
      const hotDays = region === 1 ? (game < 3 ? 4 : 0) : region === 2 ? (game < 3 ? 3 : 7) : 3;
      for (let d = 0; d < 7; d++) {
        const day = (week - 1) * 7 + d;
        live.lines.push(
          [String(home), homeId, day, 'b', d < hotDays ? hot : cold, `h${region}:${day}`, `H${region}`, 1, 'MLB'],
          [String(away), awayId, day, 'b', cold, `a${region}:${day}`, `A${region}`, 1, 'MLB'],
        );
      }
    }
  }
  for (let series = 1; series <= 4; series++) for (let game = 1; game <= 3; game++) rows.push({
    stage: 'bracket', region: 0, round: 8, series_no: series, game_no: game, game_id: 8000 + series * 10 + game, week: 21 + game,
    home_hsid: null, away_hsid: null, home_seed: ROUND_8[series - 1][0], away_seed: ROUND_8[series - 1][1],
    home_school_name: null, away_school_name: null, status: 'tbd', innings: null,
    winner_hsid: null, decided_by: null, locked_at: null,
  });
  return { rows, live };
}

const score = (rows: Row[], live: Live, asof: string) => computeSeason(season, rows, [], live, asof, true);

test('Round 8 waits for Week 21 totals even when all regional winners clinch in Week 20', () => {
  const { rows, live } = fixture();
  const out = score(rows, live, date(20 * 7)); // Monday beginning Week 21
  assert.equal(out.results.filter((r) => r.lock).length, 16, 'all eight regional winners have two final wins');
  const fills = out.fills.filter((f) => f.game_id >= 8000);
  assert.equal(fills.length, 0, 'Week 21 can still change the runs tiebreak; Round 8 must not be stored yet');
  assert.deepEqual(out.decisions.filter((d) => d.kind === 'reseed_tie' || d.ref.startsWith('2027:bracket:8:')), []);
});

test('the last final Game 3 completes Round 7 and ranks tied seeds using every Week 21 run', () => {
  const { rows, live } = fixture();
  const asof = date(21 * 7); // Monday beginning Week 22
  const finals = score(rows, live, asof).results;
  // All but one regional game is already final in storage. The current
  // pass finalizes the remaining Game 3 and can then fill Round 8.
  for (const result of finals.filter((r) => r.game_id !== 821)) {
    Object.assign(rows.find((r) => r.game_id === result.game_id)!, result, { locked_at: `${asof}T11:00:00Z` });
  }
  const out = score(rows, live, asof);
  assert.deepEqual(out.results.map((r) => r.game_id), [821]);
  assert.equal(out.results[0].lock, true);
  assert.equal(out.fills.length, 12);
  const first = out.fills.find((f) => f.game_id === 8011);
  assert.equal(first?.home_hsid, 2, 'Winner 2 overtakes Winner 1 on the full Round 7 runs tiebreak');
  assert.equal(first?.home_seed, 1);
  assert.equal(out.decisions.length, 0);
});

test('an unfinished Round 7 cannot produce a premature reseeding tie decision', () => {
  const { rows, live } = fixture();
  // Match Winners 1 and 2 through Week 20 while keeping their decisive
  // Week 21 difference. A tie is only actionable after all three games.
  for (const line of live.lines) if (line[0] === '1' && line[2] < 20 * 7 && line[2] % 7 === 3) line[4] = cold;
  const out = score(rows, live, date(20 * 7));
  assert.equal(out.fills.length, 0);
  assert.deepEqual(out.decisions.filter((d) => d.kind === 'reseed_tie'), []);
});

test('chronological scoring reaches Week 22 without changing already-stored Round 8 opponents', () => {
  const { rows, live } = fixture();
  const asof = date(20 * 7);
  const early = score(rows, live, asof);
  for (const result of early.results) {
    const row = rows.find((r) => r.region === result.region && r.game_id === result.game_id)!;
    Object.assign(row, result, {
      computed_at: `${date(20 * 7 + 1)}T10:59:59Z`, locked_at: result.lock ? `${asof}T11:00:00Z` : null,
      box_in_progress: result.box,
    });
  }
  for (const fill of early.fills) Object.assign(rows.find((r) => r.region === fill.region && r.game_id === fill.game_id)!, fill, { status: 'scheduled' });
  const after = score(rows, live, date(21 * 7));
  const changed = after.decisions.filter((d) => d.kind === 'pairing_changed' && d.ref.startsWith('2027:bracket:8:'));
  assert.deepEqual(changed.map((d) => d.details), [], 'the Week 21 tiebreak must not invalidate stored national pairings');
});
