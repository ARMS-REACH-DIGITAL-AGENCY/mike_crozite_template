// Writes the SQL that fills master_bracket with a season's schedule: every
// game of every round, with its week and dates, and the teams wherever they
// are already known (Round 1). Later rounds are empty slots ('tbd') that the
// results job (scripts/master-bracket-results.ts) fills as series end.
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

const [season, fieldFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (season === '2027') {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/bracket-lab/2026/index.json'), 'utf8'));
  const name = (h) => idx.schools[h][0];
  const round1 = idx.rounds[0].series.map((s) => ({ home: s[1], away: s[2], homeSeed: s[3], awaySeed: s[4], homeName: name(s[1]), awayName: name(s[2]) }));
  const rows = bracketRows({ regions: 8, perRegion: 128, nationalRounds: 3, round1 });
  // Check the ids and weeks against the site's own (index.json).
  const byId = new Map(rows.map((r) => [r.gameId, r]));
  for (const round of idx.rounds) for (const s of round.series) for (const g of s[7]) {
    const r = byId.get(g[0]);
    if (!r || r.week !== g[1] || r.round !== round.r || (round.r === 1 && (r.home !== g[2] || r.away !== g[3]))) throw new Error(`game ${g[0]} does not match index.json`);
  }
  // Season Championship Tournament (weeks 31-33: the leaderboard's top 8,
  // seeded 1v8, 4v5, 2v7, 3v6) and the Fantasy World Series (week 34).
  const sct = [[1, 8], [4, 5], [2, 7], [3, 6]];
  sct.forEach(([a, b], i) => rows.push({ stage: 'season_championship', region: 0, round: 1, roundName: 'Season Championship Tournament · Round 1', seriesNo: i + 1, gameNo: 1, gameId: 15361 + i, week: 31, homeSeed: a, awaySeed: b }));
  [0, 1].forEach((i) => rows.push({ stage: 'season_championship', region: 0, round: 2, roundName: 'Season Championship Tournament · Round 2', seriesNo: i + 1, gameNo: 1, gameId: 15365 + i, week: 32 }));
  rows.push({ stage: 'season_championship', region: 0, round: 3, roundName: 'Season Championship Game', seriesNo: 1, gameNo: 1, gameId: 15367, week: 33 });
  rows.push({ stage: 'world_series', region: 0, round: 1, roundName: 'Fantasy World Series', seriesNo: 1, gameNo: 1, gameId: 15368, week: 34 });
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
    out.push(...bracketRows({ regions: 1, perRegion: 16, nationalRounds: 0, round1 }).map((r) => ({ ...r, region: b + 1 })));
  });
  process.stdout.write(rowsSql('test-2026', '2026-10-05', out));
} else {
  console.error('usage: node scripts/master-bracket-seed.cjs 2027 | test-2026 <field.json>');
  process.exit(1);
}
