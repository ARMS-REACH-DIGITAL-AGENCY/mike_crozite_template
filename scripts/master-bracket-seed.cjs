// Writes the SQL that fills master_bracket with a season's schedule: every
// game of every round, with its week and dates, and the teams wherever they
// are already known (Round 1). Later rounds are empty slots ('tbd') that the
// results job (scripts/master-bracket-results.ts) fills as series end. So are
// the knocked-out schools' games (every school plays every week) and, in
// 2027, Weeks 31-34.
//
//   node scripts/master-bracket-seed.cjs 2027 > out.sql
//     The 2027 season: the 1,024-school field and Round 1 of
//     public/bracket-lab/2026/index.json (the field the site shows), on the
//     2027 calendar (Week 1 = Mon Feb 1, 2027).
//   node scripts/master-bracket-seed.cjs test-2026 <field.json> > out.sql
//     The October 2026 test: six brackets of 16 ([[hsid, name], ...] per
//     bracket, seed order - TEST_BRACKETS on the test/bracket-* branches).
//   --json: the rows as JSON (master_bracket's columns) instead of SQL.
//
// Game ids match the ones the site gives each game. Re-running is safe:
// existing rows are left as they are.
const fs = require('node:fs');
const path = require('node:path');

// The bracket engine's seeding order (lib/bracket/engine.ts bracketOrder).
function bracketOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function dbRows(season, opening, rows) {
  return rows.map((r) => {
    const start = addDays(opening, (r.week - 1) * 7);
    return {
      season_key: season, stage: r.stage, region: r.region, round: r.round, round_name: r.roundName, series_no: r.seriesNo,
      game_no: r.gameNo, game_id: r.gameId, week: r.week, game_start_date: start, game_end_date: addDays(start, 6),
      home_hsid: r.home ?? null, away_hsid: r.away ?? null, home_seed: r.homeSeed ?? null, away_seed: r.awaySeed ?? null,
      home_school_name: r.homeName ?? null, away_school_name: r.awayName ?? null,
      status: r.home != null && r.away != null ? 'scheduled' : 'tbd',
      innings: null, winner_hsid: null, decided_by: null, locked_at: null,
    };
  });
}

function rowsSql(season, opening, rows) {
  if (process.argv.includes('--json')) return JSON.stringify(dbRows(season, opening, rows));
  const cols = ['season_key', 'stage', 'region', 'round', 'round_name', 'series_no', 'game_no', 'game_id', 'week',
    'game_start_date', 'game_end_date', 'home_hsid', 'away_hsid', 'home_seed', 'away_seed', 'home_school_name', 'away_school_name', 'status'];
  const values = rows.map((r) => {
    const start = addDays(opening, (r.week - 1) * 7);
    const known = r.home != null && r.away != null;
    return `(${[season, r.stage, r.region, r.round, r.roundName, r.seriesNo, r.gameNo, r.gameId, r.week, start, addDays(start, 6),
      r.home, r.away, r.homeSeed, r.awaySeed, r.homeName, r.awayName, known ? 'scheduled' : 'tbd'].map(q).join(', ')})`;
  });
  return `INSERT INTO public.master_bracket (${cols.join(', ')}) VALUES\n${values.join(',\n')}\nON CONFLICT DO NOTHING;\n`;
}

// A single-elimination bracket of best-of-3 series: rounds of 3 weeks, the
// winners of series 2k-1 and 2k meeting in series k of the next round.
function bracketRows({ regions, perRegion, nationalRounds, round1, firstWeek = 1 }) {
  const rows = [];
  const rounds = Math.log2(perRegion) + nationalRounds;
  let gameId = 1;
  for (let r = 1; r <= rounds; r++) {
    const inRegion = r <= Math.log2(perRegion);
    const perReg = inRegion ? perRegion / 2 ** r : 0;
    const total = inRegion ? perReg * regions : regions / 2 ** (r - Math.log2(perRegion));
    for (let si = 0; si < total; si++) {
      const s = r === 1 ? round1[si] : null;
      for (let g = 1; g <= 3; g++) {
        rows.push({
          stage: 'bracket', region: inRegion ? Math.floor(si / perReg) + 1 : 0, round: r, roundName: `Round ${r}`,
          seriesNo: inRegion ? (si % perReg) + 1 : si + 1, gameNo: g, gameId: gameId++, week: firstWeek + (r - 1) * 3 + g - 1,
          home: s?.home ?? null, away: s?.away ?? null, homeSeed: s?.homeSeed ?? null, awaySeed: s?.awaySeed ?? null,
          homeName: s?.homeName ?? null, awayName: s?.awayName ?? null,
        });
      }
    }
  }
  return rows;
}

// 2027, Rounds 8-10 (Pete, Oct 28): the 8 regional bracket winners play each
// other all nine weeks, four 3-game series a round - Round 8 series 1-4,
// Round 9 series 5-8, Round 10 series 9-12 (9 is the Bracket Championship).
// The results job fills them (its reseeding and routing). The bracket's main
// path (series 1-6 and 9) keeps the game ids the site gives it; series 7, 8
// and 10-12 are numbered after it.
function nationalRows(firstGameId, firstRound) {
  const rows = [];
  let gameId = firstGameId;
  const add = (round, seriesNos) => {
    for (const seriesNo of seriesNos) {
      for (let g = 1; g <= 3; g++) {
        rows.push({ stage: 'bracket', region: 0, round, roundName: `Round ${round}`, seriesNo, gameNo: g, gameId: gameId++, week: (round - 1) * 3 + g });
      }
    }
  };
  add(firstRound, [1, 2, 3, 4]);
  add(firstRound + 1, [5, 6]);
  add(firstRound + 2, [9]);
  add(firstRound + 1, [7, 8]);
  add(firstRound + 2, [10, 11, 12]);
  return rows;
}

// The knocked-out schools' games (Pete, Oct 28: every school plays every
// week). From Round 2 on, every school out of the bracket is paired for the
// round - one opponent, the round's three weeks - so each week has a game for
// every school. stayIn: how many schools are never out (2027: the 8 regional
// bracket winners, who play each other in Rounds 8-10). The pairs are drawn
// when the round before ends (the results job), so every slot starts empty.
// Numbered after the bracket's games.
function totalRunsRows({ field, rounds, region, firstGameId, stayIn = 1, firstWeek = 1 }) {
  const rows = [];
  let gameId = firstGameId;
  for (let r = 2; r <= rounds; r++) {
    const pairs = (field - Math.max(field / 2 ** (r - 1), stayIn)) / 2;
    for (let si = 0; si < pairs; si++) {
      for (let g = 1; g <= 3; g++) {
        rows.push({
          stage: 'total_runs', region, round: r, roundName: `Total Runs · Round ${r}`, seriesNo: si + 1, gameNo: g,
          gameId: gameId++, week: firstWeek + (r - 1) * 3 + g - 1,
        });
      }
    }
  }
  return rows;
}

// Every school once a week, every week of the bracket: (field x weeks) / 2.
function checkEveryWeek(rows, field, weeks) {
  const regular = rows.filter((r) => r.stage === 'bracket' || r.stage === 'total_runs');
  if (regular.length !== (field * weeks) / 2) throw new Error(`${regular.length} games in weeks 1-${weeks}; ${field} schools need ${(field * weeks) / 2}`);
  for (let w = 1; w <= weeks; w++) {
    const n = regular.filter((r) => r.week === w).length;
    if (n !== field / 2) throw new Error(`week ${w} has ${n} games, not ${field / 2}`);
  }
}

const [season, fieldFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (season === '2027') {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/bracket-lab/2026/index.json'), 'utf8'));
  const name = (h) => idx.schools[h][0];
  const round1 = idx.rounds[0].series.map((s) => ({ home: s[1], away: s[2], homeSeed: s[3], awaySeed: s[4], homeName: name(s[1]), awayName: name(s[2]) }));
  // Rounds 1-7 in the eight regions (games 1-3,048), then Rounds 8-10.
  const rows = bracketRows({ regions: 8, perRegion: 128, nationalRounds: 0, round1 });
  rows.push(...nationalRows(rows.length + 1, 8));
  // Check the ids and weeks against the site's own (index.json).
  const byId = new Map(rows.map((r) => [r.gameId, r]));
  for (const round of idx.rounds) for (const s of round.series) for (const g of s[7]) {
    const r = byId.get(g[0]);
    if (!r || r.week !== g[1] || r.round !== round.r || (round.r === 1 && (r.home !== g[2] || r.away !== g[3]))) throw new Error(`game ${g[0]} does not match index.json`);
  }
  // The knocked-out schools' games: 3,085-15,360, across regions (region 0).
  rows.push(...totalRunsRows({ field: 1024, rounds: 10, region: 0, firstGameId: rows.length + 1, stayIn: 8 }));
  checkEveryWeek(rows, 1024, 30);
  if (rows.length !== 15360) throw new Error(`weeks 1-30 should end at game 15,360, not ${rows.length}`);
  // Season Championship Tournament (weeks 31-33: the leaderboard's top 8,
  // seeded 1v8, 4v5, 2v7, 3v6) and the Fantasy World Series (week 34).
  const sct = [[1, 8], [4, 5], [2, 7], [3, 6]];
  sct.forEach(([a, b], i) => rows.push({ stage: 'season_championship', region: 0, round: 1, roundName: 'Season Championship Tournament · Round 1', seriesNo: i + 1, gameNo: 1, gameId: 15361 + i, week: 31, homeSeed: a, awaySeed: b }));
  [0, 1].forEach((i) => rows.push({ stage: 'season_championship', region: 0, round: 2, roundName: 'Season Championship Tournament · Round 2', seriesNo: i + 1, gameNo: 1, gameId: 15365 + i, week: 32 }));
  rows.push({ stage: 'season_championship', region: 0, round: 3, roundName: 'Season Championship Game', seriesNo: 1, gameNo: 1, gameId: 15367, week: 33 });
  rows.push({ stage: 'world_series', region: 0, round: 1, roundName: 'Fantasy World Series', seriesNo: 1, gameNo: 1, gameId: 15368, week: 34 });
  if (rows.length !== 15368 || new Set(rows.map((r) => r.gameId)).size !== 15368) throw new Error(`the 2027 season is 15,368 games, not ${rows.length}`);
  process.stdout.write(rowsSql('2027', '2027-02-01', rows));
} else if (season === 'test-2026' && fieldFile) {
  const field = JSON.parse(fs.readFileSync(fieldFile, 'utf8'));
  const order = bracketOrder(16);
  const out = [];
  field.forEach((schools, b) => {
    const round1 = [];
    for (let i = 0; i < 16; i += 2) {
      const [h, a] = [schools[order[i] - 1], schools[order[i + 1] - 1]];
      round1.push({ home: h[0], away: a[0], homeSeed: order[i], awaySeed: order[i + 1], homeName: h[1], awayName: a[1] });
    }
    // One test branch per bracket: its games are numbered 1, 2, 3 ... like
    // the branch numbers them (testSeason.ts applyTestField).
    const own = bracketRows({ regions: 1, perRegion: 16, nationalRounds: 0, round1 }).map((r) => ({ ...r, region: b + 1 }));
    // Its knocked-out schools play each other: each test bracket is its own
    // season, never paired with another.
    own.push(...totalRunsRows({ field: 16, rounds: 4, region: b + 1, firstGameId: own.length + 1 }));
    checkEveryWeek(own, 16, 12);
    out.push(...own);
  });
  process.stdout.write(rowsSql('test-2026', '2026-10-05', out));
} else {
  console.error('usage: node scripts/master-bracket-seed.cjs 2027 | test-2026 <field.json>');
  process.exit(1);
}
