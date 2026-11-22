// TEST-ONLY: read-only verification of the production writer's persisted season.
// Uses the actual preparedIndex/preparedBoxes readers; never calculates or writes
// an official result. Run after a writer checkpoint, not concurrently with it.
//
// NODE_OPTIONS=--conditions=react-server NODE_PATH=./node_modules/next/dist/compiled \
//   node --import tsx scripts/audit-production-rehearsal.ts \
//   --connection-file /secure/connection.json --expected-branch br-... \
//   --season 2026-rehearsal --through-week 34 --report /tmp/audit.json
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';
import type { GameBox, GameRow } from '../src/components/bracket/gallery';

type Stored = {
  stage: string; region: number; round: number; series_no: number; game_no: number;
  game_id: number; week: number; game_start_date: string; game_end_date: string;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null;
  away_seed: number | null; status: string; innings: number[] | null;
  home_runs: number | null; away_runs: number | null; winner_hsid: number | null;
  decided_by: string | null; computed_at: string | null; locked_at: string | null;
  box_present: boolean;
};
type Season = { opening_day: string; last_day: string; weeks: number; regions: number;
  schools_per_region: number; is_test: boolean };
type Group = { key: string; games: Stored[]; first: Stored; winner: number | null; loser: number | null };
type Failure = { check: string; detail: unknown };
const failures: Failure[] = [];
let checks = 0, failureCount = 0, boxesChecked = 0;
function check(name: string, pass: unknown, detail: unknown = '') {
  checks++;
  if (!pass) {
    failureCount++;
    if (failures.length < 100) failures.push({ check: name, detail });
  }
}
const eq = (name: string, actual: unknown, expected: unknown, detail: unknown = '') =>
  check(name, isDeepStrictEqual(actual, expected), { detail, actual, expected });
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const offset = (day: string, n: number) => iso(Date.parse(day + 'T00:00:00Z') + n * DAY);
const groupKey = (g: Stored) => [g.stage, g.round, g.region, g.series_no].join(':');
const sorted = (xs: Iterable<number>) => [...xs].sort((a, b) => a - b);
const participants = (g: Stored) => [g.home_hsid, g.away_hsid].filter((x): x is number => x != null);
const sum = (xs: number[], parity: number) => xs.reduce((n, x, i) => n + (i % 2 === parity ? x : 0), 0);

function inspectBox(g: Stored, box: GameBox) {
  const id = g.game_id;
  const b = box as any;
  const shape = Array.isArray(b?.d) && b.d.length === 8 && Array.isArray(b?.x) && b.x.length === 8 &&
    Array.isArray(b?.f) && b.f.length >= 9 && b.h && b.a &&
    [b.h, b.a].every(side => Array.isArray(side.p) && Array.isArray(side.days) && side.days.length === 7 && Array.isArray(side.wl));
  check('complete-ledger-shape', shape, id);
  if (!shape) return;
  boxesChecked++;
  for (let d = 0; d < 8; d++) {
    const x: (number | null)[] = b.x[d];
    check('four-raw-metrics', Array.isArray(x) && x.length === 4 && x.every(v => v == null || Number.isFinite(v)), { id, inning: d + 1 });
    if (!Array.isArray(x) || x.length !== 4) continue;
    eq('rounded-display-keeps-raw-comparison', b.d[d], x.map(v => v == null ? null : Math.round(v)), { id, inning: d + 1 });
    // An absent side holds at 100 for the comparison and cannot itself earn
    // a run; this independent ledger invariant catches rounded-cell winners.
    const runs = [0, 0];
    for (const [h, a, higher, posted] of [[x[0], x[1], true, b.f[d]?.[0]], [x[2], x[3], false, b.f[d]?.[1]]] as const) {
      if (!posted || (h == null && a == null)) continue;
      const hv = h ?? 100, av = a ?? 100;
      if (h != null && (higher ? hv > av : hv < av)) runs[0]++;
      if (a != null && (higher ? av > hv : av < hv)) runs[1]++;
    }
    eq('ledger-metrics-match-stored-inning', (g.innings || []).slice(d * 2, d * 2 + 2), runs, { id, inning: d + 1 });
  }
  for (const sideName of ['h', 'a'] as const) {
    const side = b[sideName];
    const ids = side.p.map((p: any[]) => p[0]);
    check('canonical-ledger-player-ids', ids.every((id: unknown) => typeof id === 'string' && /^YAT\d+$/.test(id)), { id, side: sideName });
    check('one-row-per-ledger-player', new Set(ids).size === ids.length, { id, side: sideName });
    const wl = [0, 0];
    for (const p of side.p) {
      if (Array.isArray(p[8])) { wl[0] += p[8][0]; wl[1] += p[8][1]; }
    }
    eq('school-wl-equals-player-ledger', side.wl, wl, { id, side: sideName });
    for (let d = 0; d < 7; d++) {
      check('complete-daily-roster', Array.isArray(side.days[d]) &&
        isDeepStrictEqual(side.days[d].map((p: any[]) => p[0]), ids), { id, side: sideName, day: d });
    }
    if (side.days.every((day: unknown) => Array.isArray(day) && day.length === side.p.length)) {
      for (let p = 0; p < side.p.length; p++) {
        const daily = side.days.reduce((totals: number[], day: any[][]) => {
          const wl = day[p]?.[8];
          if (Array.isArray(wl)) { totals[0] += wl[0]; totals[1] += wl[1]; }
          return totals;
        }, [0, 0]);
        eq('weekly-player-wl-equals-daily-ledgers', side.p[p][8], daily, { id, side: sideName, player: ids[p] });
      }
    }
  }
  if (g.status === 'final') {
    check('final-ledger-posted', b.f.slice(0, 9).every((f: unknown) => Array.isArray(f) && f[0] === true && f[1] === true), id);
    const ratio = (wl: number[]) => wl[0] + wl[1] ? wl[0] / (wl[0] + wl[1]) : 0.5;
    const h = ratio(b.h.wl), a = ratio(b.a.wl);
    eq('wl-ledger-matches-inning-nine', (g.innings || []).slice(16, 18), [h > a ? 1 : 0, a > h ? 1 : 0], id);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (key: string) => { const i = args.indexOf('--' + key); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--help')) {
    console.log('Read-only: --expected-branch br-ID --season KEY [--connection-file FILE] [--through-week 0..34] [--now ISO] [--report FILE]. Without a file, use DATABASE_URL/PLAYERS_DATABASE_URL and REHEARSAL_NEON_BRANCH.');
    return;
  }
  const connectionFile = arg('connection-file'), expectedBranch = arg('expected-branch'), seasonKey = arg('season');
  if (!expectedBranch || !seasonKey) throw Error('expected-branch and season are required');
  const secret = connectionFile ? JSON.parse(fs.readFileSync(connectionFile, 'utf8')) : {
    DATABASE_URL: process.env.DATABASE_URL, PLAYERS_DATABASE_URL: process.env.PLAYERS_DATABASE_URL,
    branch_id: process.env.REHEARSAL_NEON_BRANCH,
  };
  if (secret.branch_id !== expectedBranch) throw Error('Connection file does not identify the expected isolated branch');
  const connection = secret.PLAYERS_DATABASE_URL || secret.DATABASE_URL;
  if (typeof connection !== 'string') throw Error('Missing isolated database connection');
  const target = new URL(connection);
  process.env.DATABASE_URL = connection;
  process.env.PLAYERS_DATABASE_URL = connection;
  const through = Number(arg('through-week') ?? 34);
  if (!Number.isInteger(through) || through < 0 || through > 34) throw Error('through-week must be 0..34');
  const pool = new Pool({ connectionString: connection, max: 2, ssl: { rejectUnauthorized: false },
    options: '-c default_transaction_read_only=on' });
  try {
    const { rows: [season] } = await pool.query<Season>(
      'SELECT opening_day::text,last_day::text,weeks,regions,schools_per_region,is_test FROM public.fantasy_seasons WHERE season_key=$1', [seasonKey]);
    if (!season) throw Error('Requested season is absent from the isolated database');
    eq('full-production-season-shape', [season.is_test, season.weeks, season.regions, season.schools_per_region], [false, 34, 8, 128]);
    eq('monday-opening', new Date(season.opening_day + 'T00:00:00Z').getUTCDay(), 1);
    eq('complete-calendar', season.last_day, offset(season.opening_day, 237));
    const now = arg('now') ? Date.parse(arg('now')!) : Date.parse(offset(season.opening_day, through * 7) + 'T11:00:00Z');
    if (!Number.isFinite(now)) throw Error('Invalid --now timestamp');
    const { rows } = await pool.query<Stored>(
      'SELECT stage,region,round,series_no,game_no,game_id,week,game_start_date::text,game_end_date::text,' +
      'home_hsid,away_hsid,home_seed,away_seed,status,innings,home_runs,away_runs,winner_hsid,decided_by,' +
      'computed_at::text,locked_at::text,box IS NOT NULL AS box_present FROM public.master_bracket WHERE season_key=$1 ORDER BY week,game_id', [seasonKey]);
    eq('complete-game-slots', rows.length, 15368);
    eq('unique-public-game-ids', new Set(rows.map(g => g.game_id)).size, rows.length);
    const expectedStages: Record<string, number> = { bracket: 3084, total_runs: 12276, season_championship: 7, world_series: 1 };
    for (const [stage, n] of Object.entries(expectedStages)) eq('stage-slot-count', rows.filter(g => g.stage === stage).length, n, stage);
    const first = rows.filter(g => g.stage === 'bracket' && g.round === 1 && g.game_no === 1);
    const field = new Map<number, { region: number; seed: number }>();
    for (const g of first) {
      for (const [id, seed] of [[g.home_hsid, g.home_seed], [g.away_hsid, g.away_seed]]) {
        if (id != null) { check('opening-school-once', !field.has(id), id); field.set(id, { region: g.region, seed: seed || 0 }); }
      }
    }
    eq('opening-series', first.length, 512);
    eq('full-field', field.size, 1024);
    for (let r = 1; r <= 8; r++) eq('original-regional-seeds',
      sorted([...field.values()].filter(s => s.region === r).map(s => s.seed)), Array.from({ length: 128 }, (_, i) => i + 1), r);
    const groups = new Map<string, Group>();
    for (const g of rows) {
      eq('game-calendar', [g.game_start_date, g.game_end_date], [offset(season.opening_day, (g.week - 1) * 7), offset(season.opening_day, g.week * 7 - 1)], g.game_id);
      check('valid-week', g.week >= 1 && g.week <= 34, g.game_id);
      check('whole-pair-or-empty-slot', (g.home_hsid == null) === (g.away_hsid == null), g.game_id);
      if (g.home_hsid != null) {
        check('field-opponents', g.home_hsid !== g.away_hsid && participants(g).every(h => field.has(h)), g.game_id);
      }
      if (g.week <= through) check('closed-week-final', g.status === 'final' && !!g.locked_at && !!g.computed_at && g.box_present, { id: g.game_id, status: g.status });
      if (g.innings != null) {
        check('valid-innings', g.innings.length >= 18 && g.innings.length % 2 === 0 && g.innings.every(n => Number.isInteger(n) && n >= 0 && n <= 2), g.game_id);
        eq('score-equals-innings', [g.home_runs, g.away_runs], [sum(g.innings, 0), sum(g.innings, 1)], g.game_id);
      }
      if (g.status === 'final') {
        check('final-winner-and-ledger', g.box_present && g.winner_hsid != null && participants(g).includes(g.winner_hsid) && !!g.locked_at, g.game_id);
        check('final-score-winner', g.home_runs != null && g.away_runs != null && g.home_runs !== g.away_runs &&
          g.winner_hsid === (g.home_runs > g.away_runs ? g.home_hsid : g.away_hsid), g.game_id);
      }
      const key = groupKey(g);
      const group = groups.get(key) || { key, games: [], first: g, winner: null, loser: null };
      group.games.push(g); groups.set(key, group);
    }
    for (let w = 1; w <= 34; w++) {
      const week = rows.filter(g => g.week === w);
      eq('weekly-game-slots', week.length, w <= 30 ? 512 : w === 31 ? 4 : w === 32 ? 2 : 1, w);
      if (w <= Math.min(through, 30)) eq('every-school-once-per-week', sorted(week.flatMap(participants)), sorted(field.keys()), w);
    }
    for (const group of groups.values()) {
      const g = group.first;
      const regular = g.stage === 'bracket' || g.stage === 'total_runs';
      eq('series-game-count', group.games.length, regular ? 3 : 1, group.key);
      for (const x of group.games) eq('constant-series-matchup', [x.home_hsid, x.away_hsid], [g.home_hsid, g.away_hsid], x.game_id);
      const hw = group.games.filter(x => x.status === 'final' && x.winner_hsid === g.home_hsid).length;
      const aw = group.games.filter(x => x.status === 'final' && x.winner_hsid === g.away_hsid).length;
      group.winner = hw >= (regular ? 2 : 1) ? g.home_hsid : aw >= (regular ? 2 : 1) ? g.away_hsid : null;
      group.loser = group.winner == null ? null : group.winner === g.home_hsid ? g.away_hsid : g.home_hsid;
    }
    const find = (stage: string, round: number, region: number, no: number) => groups.get([stage, round, region, no].join(':'));
    const pair = (targetGroup: Group | undefined, expected: (number | null | undefined)[], reason: string) => {
      if (!targetGroup || expected.some(x => x == null)) return;
      eq(reason, sorted(participants(targetGroup.first)), sorted(expected as number[]), targetGroup.key);
    };
    for (const group of groups.values()) {
      const g = group.first;
      if (g.stage === 'bracket' && g.round >= 2 && g.round <= 7) pair(group,
        [find('bracket', g.round - 1, g.region, g.series_no * 2 - 1)?.winner,
          find('bracket', g.round - 1, g.region, g.series_no * 2)?.winner], 'regional-winners-advance');
    }
    // Approved national bracket includes placement games; all eight regional
    // winners keep playing in Weeks 22-30, not just semifinal/final survivors.
    const nationalRoutes: [number, number, number, number, 'winner' | 'loser', number, number, 'winner' | 'loser'][] = [
      [9,5,8,1,'winner',8,2,'winner'], [9,6,8,3,'winner',8,4,'winner'],
      [9,7,8,1,'loser',8,2,'loser'], [9,8,8,3,'loser',8,4,'loser'],
      [10,9,9,5,'winner',9,6,'winner'], [10,10,9,5,'loser',9,8,'winner'],
      [10,11,9,6,'loser',9,7,'winner'], [10,12,9,7,'loser',9,8,'loser'],
    ];
    for (const [r, no, ar, an, sideA, br, bn, sideB] of nationalRoutes) pair(find('bracket', r, 0, no),
      [find('bracket', ar, 0, an)?.[sideA], find('bracket', br, 0, bn)?.[sideB]], 'national-advancement');
    const regionWinners = Array.from({ length: 8 }, (_, i) => find('bracket', 7, i + 1, 1)?.winner);
    if (regionWinners.every(x => x != null)) {
      for (let r = 8; r <= 10; r++) {
        const current = [...groups.values()].filter(s => s.first.stage === 'bracket' && s.first.round === r);
        if (current.every(s => s.first.home_hsid != null)) eq('eight-regional-winners-retained', sorted(current.flatMap(s => participants(s.first))), sorted(regionWinners as number[]), r);
      }
    }
    const totals = (lastWeek: number) => {
      const out = new Map<number, { runs: number; allowed: number; wins: number }>();
      for (const g of rows.filter(g => g.week <= lastWeek && g.status === 'final' && ['bracket', 'total_runs'].includes(g.stage))) {
        for (const [id, runs, allowed] of [[g.home_hsid, g.home_runs, g.away_runs], [g.away_hsid, g.away_runs, g.home_runs]]) {
          if (id == null) continue;
          const t = out.get(id) || { runs: 0, allowed: 0, wins: 0 };
          t.runs += runs || 0; t.allowed += allowed || 0; t.wins += g.winner_hsid === id ? 1 : 0;
          out.set(id, t);
        }
      }
      return out;
    };
    if (regionWinners.every(x => x != null) && rows.filter(g => g.week <= 21).every(g => g.status === 'final')) {
      const at21 = totals(21);
      const ranked = (regionWinners as number[]).sort((a, b) => field.get(a)!.seed - field.get(b)!.seed ||
        (at21.get(b)?.runs || 0) - (at21.get(a)?.runs || 0));
      for (const [i, seedA, seedB] of [[1,1,8], [2,4,5], [3,3,6], [4,2,7]]) {
        // The production regional-winner draw is 1v8, 4v5, 3v6, 2v7.
        const targetGroup = find('bracket', 8, 0, i);
        pair(targetGroup, [ranked[seedA - 1], ranked[seedB - 1]], 'regional-winner-reseeding');
        if (targetGroup) eq('national-original-to-new-seeds', [targetGroup.first.home_seed, targetGroup.first.away_seed], [seedA, seedB], targetGroup.key);
      }
    }
    for (let r = 2; r <= 10; r++) {
      const roundGroups = [...groups.values()].filter(s => s.first.round === r && ['bracket', 'total_runs'].includes(s.first.stage));
      if (roundGroups.every(s => s.first.home_hsid != null)) eq('eligible-regular-round-field', sorted(roundGroups.flatMap(s => participants(s.first))), sorted(field.keys()), r);
    }
    const champion = find('bracket', 10, 0, 9)?.winner || 0;
    if (champion && rows.filter(g => g.week <= 30).every(g => g.status === 'final')) {
      const t = totals(30);
      const rank = (a: number, b: number) => {
        const x = t.get(a) || { runs: 0, allowed: 0, wins: 0 }, y = t.get(b) || { runs: 0, allowed: 0, wins: 0 };
        return y.runs - x.runs || (y.runs - y.allowed) - (x.runs - x.allowed) || y.wins - x.wins || field.get(a)!.seed - field.get(b)!.seed;
      };
      const leaders = Array.from({ length: 8 }, (_, i) => [...field.keys()].filter(id => field.get(id)!.region === i + 1 && id !== champion).sort(rank)[0]).sort(rank);
      const quarterfinals = rows.filter(g => g.stage === 'season_championship' && g.week === 31);
      eq('regional-total-runs-qualifiers', sorted(quarterfinals.flatMap(participants)), sorted(leaders));
      for (const g of quarterfinals) eq('postseason-seeding', [g.home_hsid, g.away_hsid], [leaders[(g.home_seed || 0) - 1], leaders[(g.away_seed || 0) - 1]], g.game_id);
    }
    for (const group of groups.values()) if (group.first.stage === 'season_championship' && group.first.round > 1) {
      const g = group.first;
      pair(group, [find('season_championship', g.round - 1, 0, g.series_no * 2 - 1)?.winner,
        find('season_championship', g.round - 1, 0, g.series_no * 2)?.winner], 'postseason-winners-advance');
    }
    const lbChampion = find('season_championship', 3, 0, 1)?.winner || 0;
    const world = rows.find(g => g.stage === 'world_series');
    if (champion && lbChampion && world) eq('world-series-participants', [world.home_hsid, world.away_hsid], [champion, lbChampion]);
    for (const g of rows.filter(g => g.stage === 'season_championship' && g.home_hsid != null))
      check('bracket-champion-postseason-bye', !participants(g).includes(champion), g.game_id);

    const { preparedIndex, preparedBoxes } = await import('../src/lib/bracket/preparedIndex');
    const prepared = await preparedIndex(seasonKey, now);
    if (!prepared) throw Error('Actual production prepared reader rejected this season');
    const visible = rows.filter(g => g.home_hsid != null && g.away_hsid != null);
    const displayed: GameRow[] = [...prepared.index.rounds.flatMap(r => r.series.flatMap(s => s[7])),
      ...prepared.lb.map(g => g.slice(0, 7) as GameRow), ...prepared.index.lbt.map(g => g.game), ...prepared.index.gf];
    const byId = new Map(displayed.map(g => [g[0], g]));
    eq('prepared-game-count', displayed.length, visible.length);
    eq('prepared-no-duplicate-games', byId.size, displayed.length);
    eq('prepared-full-field', sorted(Object.keys(prepared.index.schools).map(Number)), sorted(field.keys()));
    eq('prepared-bracket-champion', prepared.index.champion, champion);
    eq('prepared-total-runs-champion', prepared.index.lbChampion, lbChampion);
    eq('prepared-world-champion', prepared.index.grandChampion, world?.winner_hsid || 0);
    for (const g of visible) eq('stored-scoreboard-parity', byId.get(g.game_id), [g.game_id, g.week, g.home_hsid, g.away_hsid,
      g.status === 'final' ? g.decided_by || 'runs' : '', g.innings || [], g.status === 'final' ? g.winner_hsid : null], g.game_id);
    const files = new Map<string, { stage: string; round: number | null; region: number | null; week: number | null }>();
    for (const g of rows.filter(g => g.box_present)) {
      const file = g.stage === 'bracket' ? `d-${g.round}-${g.region}` : g.stage === 'total_runs' ? `d-lb-${g.week}-${g.region}` : g.stage === 'season_championship' ? 'd-lbt' : 'd-gf';
      files.set(file, { stage: g.stage, round: g.stage === 'bracket' ? g.round : null,
        region: ['bracket', 'total_runs'].includes(g.stage) ? g.region : null, week: g.stage === 'total_runs' ? g.week : null });
    }
    const storedById = new Map(rows.map(g => [g.game_id, g]));
    for (const [file, f] of files) {
      const boxes = await preparedBoxes(seasonKey, file);
      const { rows: saved } = await pool.query<{ game_id: number; box: GameBox }>(
        'SELECT game_id,box FROM public.master_bracket WHERE season_key=$1 AND stage=$2 AND ($3::int IS NULL OR round=$3) AND ($4::int IS NULL OR region=$4) AND ($5::int IS NULL OR week=$5) AND box IS NOT NULL',
        [seasonKey, f.stage, f.round, f.region, f.week]);
      eq('prepared-ledger-file-membership', sorted(Object.keys(boxes).map(Number)), sorted(saved.map(x => x.game_id)), file);
      for (const s of saved) {
        check('stored-prepared-ledger-equality', isDeepStrictEqual(boxes[String(s.game_id)], s.box), s.game_id);
        inspectBox(storedById.get(s.game_id)!, s.box);
      }
    }
    eq('all-persisted-ledgers-checked', boxesChecked, rows.filter(g => g.box_present).length);
    const report = { ok: failureCount === 0, season: seasonKey, databaseBranch: expectedBranch,
      databaseHost: target.hostname, checkedAt: new Date().toISOString(), effectiveAt: new Date(now).toISOString(),
      throughWeek: through, field: field.size, slots: rows.length, finalGames: rows.filter(g => g.status === 'final').length,
      preparedGames: displayed.length, preparedLedgerFiles: files.size, boxesChecked, checks, failureCount, failures,
      champions: { bracket: champion, totalRuns: lbChampion, world: world?.winner_hsid || 0 },
      limitations: ['This verifies persisted results and actual prepared readers; it does not certify source coverage or browser rendering.'] };
    if (arg('report')) fs.writeFileSync(arg('report')!, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (failureCount) process.exitCode = 1;
  } finally { await pool.end(); }
}

main().catch(error => { console.error('[production-rehearsal-audit]', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
