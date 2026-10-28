// The 2027 season played start to finish on a LOCAL database, to prove the
// schedule fills itself (Pete, Oct 28: "15,368 is the number"):
//   - every one of the 1,024 schools plays every week of Weeks 1-30
//     (15,360 games): the bracket, and from Round 2 on the knocked-out
//     schools, paired each round across regions, teammates' schools first;
//   - Rounds 8-10 (Weeks 22-30): the 8 regional bracket winners play each
//     other, reseeded by regional seed, four series a round;
//   - Weeks 31-33: each region's Total Runs leader, then Week 34: the Total
//     Runs winner v the Main Bracket winner (8 games), all from the stored
//     results and standings, nothing by hand.
//
// Nothing touches production: the database must be on this machine, and the
// stats are stand-ins (made up, fixed by a seed) - the scores mean nothing,
// only the schedule does. The results job's own code (computeSeason,
// writeSeason) runs on the job's own SQL, twice a week (mid-week, and the
// Monday the week is final); then every day is run again, to show that a
// rerun changes nothing.
//
//   npx --yes tsx --tsconfig tsconfig.json scripts/master-bracket-season-proof.ts \
//     --db postgresql://postgres@localhost:5499/proof [--out proof.json]
//
// The database's master_bracket tables are dropped and built again from the
// migrations and scripts/master-bracket-seed.cjs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { bracketOrder, hashString, mulberry32, pairEliminated } from '@/lib/bracket/engine';
import type { Live } from '@/components/bracket/liveSeason';
import {
  CHAMPIONSHIP_SERIES, ROUNDS_9_10, ROUND_8, SQL_ROWS, SQL_RULINGS, clubsOf, computeSeason, pairKey, reseed, teammates, writeSeason,
  type Row, type Ruling, type Season,
} from './master-bracket-results';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const DB = arg('db') || '';
const OUT = arg('out');
const SEASON = '2027';
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

{
  const u = new URL(DB);
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || /neon|vercel|amazonaws/i.test(DB)) {
    throw new Error('the proof runs on a local database only (--db postgresql://...@localhost/...)');
  }
}
const pool = new Pool({ connectionString: DB, max: 3 });
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];

// ---------------------------------------------------------------------------
// Stand-in alumni: 2-11 per school, each on one of 480 made-up teams (a team
// has one official level), so schools share real-life-style teammates. Each
// alumnus's lines day by day and each team's results, fixed by a seed.
// ---------------------------------------------------------------------------
type Line = Live['lines'][number];
const LEVELS = ['MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'INDY', 'INTERNATIONAL'];
const TEAMS = 480;
function standIns(field: number[], days: number) {
  const roster: Live['roster'] = {};
  const teamOf = new Map<string, string>();
  const byDay: Line[][] = Array.from({ length: days }, () => []);
  for (const h of field) {
    const rand = mulberry32(hashString(`proof:roster:${h}`));
    const n = 2 + Math.floor(rand() * 10);
    const players: Live['roster'][string] = [];
    for (let i = 0; i < n; i++) {
      const pid = `${h}-${i}`;
      const team = Math.floor(rand() * TEAMS);
      const level = LEVELS[team % LEVELS.length];
      const pitcher = rand() < 0.45 ? 1 : 0;
      const club = `Club ${team}`;
      players.push([pid, `Player ${pid}`, level, pitcher, club]);
      teamOf.set(pid, `T${team}`);
      for (let d = 0; d < days; d++) {
        const r = mulberry32(hashString(`proof:line:${pid}:${d}`));
        if (pitcher) {
          if (r() >= 0.22) continue;
          const outs = 3 + Math.floor(r() * 16);
          const hits = Math.floor(r() * (outs / 2));
          const runs = Math.floor(r() * (hits + 1));
          byDay[d].push([String(h), pid, d, 'p', [outs, Math.floor(r() * 2), Math.floor(r() * 4), 0, Math.floor(r() * 9), hits, runs, runs], `G${team}-${d}`, club, 1, level]);
        } else {
          if (r() >= 0.6) continue;
          const pa = 3 + Math.floor(r() * 3);
          const bb = r() < 0.12 ? 1 : 0;
          const ab = pa - bb;
          const hits = Math.floor(r() * (ab + 1) * 0.6);
          const hr = hits && r() < 0.15 ? 1 : 0;
          const d2 = hits - hr > 0 && r() < 0.3 ? 1 : 0;
          byDay[d].push([String(h), pid, d, 'b', [pa, ab, hits, d2, 0, hr, bb, 0, 0], `G${team}-${d}`, club, 1, level]);
        }
      }
    }
    roster[String(h)] = players;
  }
  const clubDays: Record<string, [number, string, 0 | 1, number][]>[] = Array.from({ length: days }, () => ({}));
  for (let t = 0; t < TEAMS; t++) {
    for (let d = 0; d < days; d++) {
      const r = mulberry32(hashString(`proof:club:${t}:${d}`));
      if (r() >= 0.85) continue;
      const won = r() < 0.5 ? 1 : 0;
      const by = 1 + Math.floor(r() * 5);
      (clubDays[d][`Club ${t}`] ||= []).push([d, `G${t}-${d}`, won, won ? by : -by]);
    }
  }
  // The live data as the route would send it on a bracket day: every day
  // before it is over; the day itself hasn't started.
  const liveAsOf = (today: number): Live => {
    const lines: Line[] = [];
    const clubs: Live['clubs'] = {};
    const games: NonNullable<Live['games']> = {};
    for (let d = 0; d < Math.min(today, days); d++) {
      lines.push(...byDay[d]);
      for (const [club, list] of Object.entries(clubDays[d])) {
        (clubs[club] ||= []).push(...list);
        (games[club] ||= []).push(...list.map(([day, game]) => [day, game, 1, 1, 0] as [number, string, 0 | 1, 0 | 1, number]));
      }
    }
    return { asOf: '', roster, lines, clubs, games, fans: {} };
  };
  return { teamOf, liveAsOf, lineCount: byDay.reduce((n, d) => n + d.length, 0), alumni: teamOf.size };
}

// The table's teams and results, for "did a rerun change anything".
const SQL_STATE = `
SELECT md5(string_agg(concat_ws('|', stage, region, round, series_no, game_no, game_id, home_hsid, away_hsid, home_seed, away_seed,
                                 status, innings::text, home_runs, away_runs, winner_hsid, decided_by, locked_at IS NOT NULL), ',' ORDER BY game_id)) AS md5,
       (SELECT count(*) FROM public.master_bracket_history)::int AS history,
       (SELECT count(*) FROM public.needs_decision)::int AS decisions
  FROM public.master_bracket WHERE season_key = $1`;

async function main() {
  const t0 = Date.now();
  // A fresh copy of the tables, from the migrations and the seed.
  await q('DROP TABLE IF EXISTS public.master_bracket_history, public.master_bracket, public.commissioner_rulings, public.needs_decision, public.fantasy_seasons CASCADE');
  await q("CREATE OR REPLACE FUNCTION public.stat_lines_reland_held() RETURNS integer LANGUAGE sql AS 'SELECT 0'");
  for (const f of ['20261027_master_bracket.sql', '20261028_master_bracket_total_runs.sql']) await q(readFileSync(join('migrations', f), 'utf8'));
  await q(execFileSync('node', ['scripts/master-bracket-seed.cjs', SEASON], { maxBuffer: 1 << 28 }).toString());
  const [season] = await q<Season>(
    'SELECT season_key, is_test, opening_day::text, last_day::text, weeks, regions, schools_per_region FROM public.fantasy_seasons WHERE season_key = $1', [SEASON]);
  const seeded = await q<{ stage: string; n: number; known: number }>(
    'SELECT stage, count(*)::int AS n, count(home_hsid)::int AS known FROM public.master_bracket WHERE season_key = $1 GROUP BY 1 ORDER BY min(game_id)', [SEASON]);

  const rows0 = await q<Row>(SQL_ROWS, [SEASON]);
  const field = [...new Set(rows0.filter((r) => r.stage === 'bracket' && r.round === 1).flatMap((r) => [r.home_hsid!, r.away_hsid!]))];
  const days = season.weeks * 7;
  const data = standIns(field, days);
  const opening = Date.parse(`${season.opening_day}T00:00:00Z`);
  const dayIndex = (asof: string) => Math.round((Date.parse(`${asof}T00:00:00Z`) - opening) / DAY);

  // Twice a week: Thursday (a week in progress) and the Monday it's final.
  const asofs: string[] = [];
  for (let w = 1; w <= season.weeks; w++) asofs.push(iso(opening + (7 * (w - 1) + 3) * DAY), iso(opening + 7 * w * DAY));

  type RunLog = { asof: string; results: number; final: number; fills: Record<string, number>; decisions: string[]; ms: number };
  const runOnce = async (asof: string): Promise<RunLog> => {
    const t = Date.now();
    const rows = await q<Row>(SQL_ROWS, [SEASON]);
    const rulings = await q<Ruling>(SQL_RULINGS, [SEASON]);
    const live = data.liveAsOf(dayIndex(asof));
    const out = computeSeason(season, rows, rulings, live, asof, false, clubsOf(live, data.teamOf));
    const client = await pool.connect();
    try {
      await writeSeason(client, SEASON, out, false);
    } finally {
      client.release();
    }
    const stageOf = new Map(rows.map((r) => [r.game_id, `${r.stage} round ${r.round}`]));
    const fills: Record<string, number> = {};
    for (const f of out.fills) fills[stageOf.get(f.game_id)!] = (fills[stageOf.get(f.game_id)!] || 0) + 1;
    return { asof, results: out.results.length, final: out.results.filter((r) => r.lock).length, fills, decisions: out.decisions.map((d) => `${d.kind}: ${d.summary}`), ms: Date.now() - t };
  };

  const log: RunLog[] = [];
  for (const asof of asofs) {
    const r = await runOnce(asof);
    log.push(r);
    const f = Object.entries(r.fills).map(([k, n]) => `${k}: ${n}`).join(', ');
    console.log(`${asof}: ${r.results} scored (${r.final} final)${f ? `; filled ${f}` : ''}${r.decisions.length ? `; ${r.decisions.length} for Pete` : ''} (${(r.ms / 1000).toFixed(1)}s)`);
  }
  const [before] = await q<{ md5: string; history: number; decisions: number }>(SQL_STATE, [SEASON]);

  // Every day again, in order: nothing may change.
  const rerun: RunLog[] = [];
  for (const asof of asofs) rerun.push(await runOnce(asof));
  const [after] = await q<{ md5: string; history: number; decisions: number }>(SQL_STATE, [SEASON]);

  // ---------------------------------------------------------------------------
  // The checks.
  // ---------------------------------------------------------------------------
  const rows = await q<Row & { locked: boolean }>(`${SQL_ROWS.replace('box IS NULL AS box_missing', 'box IS NULL AS box_missing, locked_at IS NOT NULL AS locked')}`, [SEASON]);
  const checks: { check: string; ok: boolean; detail: string }[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ check: name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  };
  // Pete's example (Oct 28): the 8 regional bracket winners' seeds and runs
  // through Round 7, and the Round 8 he wrote down ([home region, away region]).
  {
    const example = [[1, 4, 85], [2, 2, 90], [3, 44, 100], [4, 12, 99], [5, 1, 125], [6, 2, 91], [7, 10, 75], [8, 5, 110]]
      .map(([region, seed, runs]) => ({ region, seed, runs }));
    const { ranked } = reseed(example);
    const got = ROUND_8.map(([h, a]) => [ranked[h - 1].region, ranked[a - 1].region]);
    const pete = [[5, 3], [1, 8], [2, 7], [6, 4]];
    check('Pete\'s example: Round 8 comes out as he wrote it', JSON.stringify(got) === JSON.stringify(pete),
      got.map(([h, a], i) => `Series ${i + 1}: (#${ROUND_8[i][1]}) Region ${a} at (#${ROUND_8[i][0]}) Region ${h}`).join('; '));
  }
  const by = (stage: string) => rows.filter((r) => r.stage === stage);
  const regular = rows.filter((r) => r.stage === 'bracket' || r.stage === 'total_runs');

  check('15,368 games', rows.length === 15368,
    `${rows.length}: bracket ${by('bracket').length}, knocked-out ${by('total_runs').length}, Weeks 31-33 ${by('season_championship').length}, Week 34 ${by('world_series').length}`);
  check('every game has its two schools, is final and locked', rows.every((r) => r.home_hsid != null && r.away_hsid != null && r.status === 'final' && r.locked),
    `${rows.filter((r) => r.home_hsid != null && r.away_hsid != null).length} with both schools, ${rows.filter((r) => r.status === 'final' && r.locked).length} final and locked`);
  const weekly = new Map<number, number>();
  const perSchool = new Map<number, Set<number>>();
  let doubles = 0;
  for (const r of regular) {
    weekly.set(r.week, (weekly.get(r.week) || 0) + 1);
    for (const h of [r.home_hsid!, r.away_hsid!]) {
      const s = perSchool.get(h) || new Set<number>();
      if (s.has(r.week)) doubles++;
      s.add(r.week);
      perSchool.set(h, s);
    }
  }
  check('Weeks 1-30: 512 games every week', [...weekly.values()].every((n) => n === 512) && weekly.size === 30,
    `${weekly.size} weeks, ${Math.min(...weekly.values())}-${Math.max(...weekly.values())} games a week, ${regular.length} in all (1,024 x 30 / 2 = 15,360)`);
  check('every school plays every week, once', perSchool.size === 1024 && [...perSchool.values()].every((s) => s.size === 30) && doubles === 0,
    `${perSchool.size} schools; each plays ${Math.min(...[...perSchool.values()].map((s) => s.size))}-${Math.max(...[...perSchool.values()].map((s) => s.size))} weeks; ${doubles} school-weeks with two games`);

  // The bracket, series by series.
  type S = { stage: string; round: number; region: number; series_no: number; games: Row[] };
  const series = new Map<string, S>();
  for (const r of [...rows].sort((a, b) => a.game_no - b.game_no)) {
    const k = `${r.stage}:${r.round}:${r.region}:${r.series_no}`;
    (series.get(k) || series.set(k, { stage: r.stage, round: r.round, region: r.region, series_no: r.series_no, games: [] }).get(k)!).games.push(r);
  }
  const winner = (s: S) => {
    const need = s.games.length === 1 ? 1 : 2;
    const h = s.games.filter((g) => g.winner_hsid === s.games[0].home_hsid).length;
    return h >= need ? s.games[0].home_hsid! : s.games[0].away_hsid!;
  };
  const loser = (s: S) => (winner(s) === s.games[0].home_hsid ? s.games[0].away_hsid! : s.games[0].home_hsid!);
  const list = (stage: string, round: number) => [...series.values()].filter((s) => s.stage === stage && s.round === round).sort((a, b) => a.region - b.region || a.series_no - b.series_no);
  const regionOf = new Map<number, number>();
  const seedOf = new Map<number, number>();
  for (const r of by('bracket').filter((r) => r.round === 1)) {
    regionOf.set(r.home_hsid!, r.region); regionOf.set(r.away_hsid!, r.region);
    seedOf.set(r.home_hsid!, r.home_seed!); seedOf.set(r.away_hsid!, r.away_seed!);
  }

  // The knocked-out schools: each round, exactly the schools out so far, one
  // opponent for the round's three games.
  const out = new Set<number>();
  const pairing: { round: number; pairs: number; schools: number; crossRegion: number; teammatePairs: number; teammatePairsByDrawAlone: number }[] = [];
  const clubsAtEnd = clubsOf(data.liveAsOf(days), data.teamOf);
  const mates = teammates(clubsAtEnd);
  let poolsOk = true;
  for (let round = 2; round <= 10; round++) {
    if (round - 1 <= 7) for (const s of list('bracket', round - 1)) out.add(loser(s));
    const pairs = list('total_runs', round);
    const schools = pairs.flatMap((s) => [s.games[0].home_hsid!, s.games[0].away_hsid!]);
    const same = pairs.every((s) => s.games.length === 3 && s.games.every((g) => g.home_hsid === s.games[0].home_hsid && g.away_hsid === s.games[0].away_hsid));
    const exact = schools.length === out.size && new Set(schools).size === schools.length && schools.every((h) => out.has(h));
    if (!same || !exact) poolsOk = false;
    const drawOnly = pairEliminated([...out].sort((a, b) => a - b), `${SEASON}:total_runs:${round}:0`).pairs;
    pairing.push({
      round, pairs: pairs.length, schools: schools.length,
      crossRegion: pairs.filter((s) => regionOf.get(s.games[0].home_hsid!) !== regionOf.get(s.games[0].away_hsid!)).length,
      teammatePairs: pairs.filter((s) => mates(s.games[0].home_hsid!, s.games[0].away_hsid!) > 0).length,
      teammatePairsByDrawAlone: drawOnly.filter(([a, b]) => mates(a, b) > 0).length,
    });
  }
  check('knocked-out schools: each round pairs exactly the schools out of the bracket', poolsOk,
    pairing.map((p) => `Round ${p.round}: ${p.schools} schools, ${p.pairs} pairs`).join('; '));
  const pairsByRound = new Map<number, Set<string>>();
  for (const r of rows) (pairsByRound.get(r.round) || pairsByRound.set(r.round, new Set()).get(r.round)!).add(`${r.stage}|${pairKey(r.home_hsid!, r.away_hsid!)}`);
  const seen = new Set<string>();
  let rematches = 0;
  for (let round = 1; round <= 10; round++) {
    const now = [...(pairsByRound.get(round) || [])].map((k) => k.split('|'));
    for (const [stage, k] of now) if (stage === 'total_runs' && seen.has(k)) rematches++;
    for (const [, k] of now) seen.add(k);
  }
  check('knocked-out schools never meet the same school twice', rematches === 0, `${rematches} knocked-out pairs had played each other before`);
  const r2 = pairing[0];
  check('Round 2 pairs real-life teammates\' schools first', r2.teammatePairs > r2.teammatePairsByDrawAlone,
    `${r2.teammatePairs} of ${r2.pairs} Round 2 pairs share a team (a draw alone: ${r2.teammatePairsByDrawAlone}); ${r2.crossRegion} of ${r2.pairs} cross regions`);

  // Rounds 8-10: the 8 regional bracket winners, reseeded by regional seed
  // (a tie in seed: more runs, Weeks 1-21), then Pete's series routing.
  const runsTo = (h: number, week: number) => regular.filter((r) => r.week <= week && (r.home_hsid === h || r.away_hsid === h))
    .reduce((n, r) => n + (r.home_hsid === h ? r.home_runs! : r.away_runs!), 0);
  const eight = list('bracket', 7).map(winner);
  const { ranked: newSeeds } = reseed(eight.map((h) => ({ hsid: h, seed: seedOf.get(h)!, runs: runsTo(h, 21) })));
  const r8 = list('bracket', 8);
  const r8ok = r8.length === 4 && r8.every((s, i) => s.series_no === i + 1
    && s.games[0].home_hsid === newSeeds[ROUND_8[i][0] - 1].hsid && s.games[0].away_hsid === newSeeds[ROUND_8[i][1] - 1].hsid
    && s.games[0].home_seed === ROUND_8[i][0] && s.games[0].away_seed === ROUND_8[i][1]);
  check('Round 8: the 8 regional winners reseeded, 1 v 8, 4 v 5, 3 v 6, 2 v 7', r8ok,
    r8.map((s) => `Series ${s.series_no}: #${s.games[0].home_seed} Region ${regionOf.get(s.games[0].home_hsid!)} (regional seed ${seedOf.get(s.games[0].home_hsid!)}) v #${s.games[0].away_seed} Region ${regionOf.get(s.games[0].away_hsid!)} (${seedOf.get(s.games[0].away_hsid!)})`).join('; '));
  const nat = (round: number, no: number) => list('bracket', round).find((s) => s.series_no === no)!;
  const routed = ROUNDS_9_10.every(([round, no, a, b]) => {
    const t = nat(round, no);
    const pick = ([r, n, side]: [number, number, 'W' | 'L']) => (side === 'W' ? winner(nat(r, n)) : loser(nat(r, n)));
    return t && new Set([t.games[0].home_hsid, t.games[0].away_hsid]).has(pick(a)) && new Set([t.games[0].home_hsid, t.games[0].away_hsid]).has(pick(b));
  });
  check('Rounds 9-10: series 5-12 routed as Pete wrote them', routed && list('bracket', 9).length === 4 && list('bracket', 10).length === 4,
    ROUNDS_9_10.map(([round, no]) => `S${no}: ${nat(round, no).games[0].home_school_name} v ${nat(round, no).games[0].away_school_name}`).join('; '));
  const eightSet = new Set(eight);
  const late = regular.filter((r) => r.week >= 22 && (eightSet.has(r.home_hsid!) || eightSet.has(r.away_hsid!)));
  check('Weeks 22-30: the 8 regional winners play only each other, every week', late.length === 36 && late.every((r) => r.stage === 'bracket' && eightSet.has(r.home_hsid!) && eightSet.has(r.away_hsid!)),
    `${late.length} games (8 schools x 9 weeks / 2 = 36), all between two of the 8`);
  const champion = winner(nat(10, CHAMPIONSHIP_SERIES));

  // Weeks 31-34 against the stored standings (the view).
  const standings = await q<{ region: number; hsid: number; region_rank: number; runs_for: number; run_diff: number; wins: number; games: number; seed: number }>(
    'SELECT region, hsid, region_rank::int, runs_for, run_diff, wins, games, seed FROM public.total_runs_standings WHERE season_key = $1', [SEASON]);
  const leaders = [1, 2, 3, 4, 5, 6, 7, 8].map((region) => standings.filter((s) => s.region === region && s.hsid !== champion).sort((a, b) => a.region_rank - b.region_rank)[0]);
  const ranked = [...leaders].sort((a, b) => b.runs_for - a.runs_for || b.run_diff - a.run_diff || b.wins - a.wins || a.seed - b.seed);
  const w31 = list('season_championship', 1);
  const order = bracketOrder(8); // the seed's Week 31 slots: 1 v 8, 4 v 5, 2 v 7, 3 v 6
  const w31ok = w31.every((s, i) => s.games[0].home_hsid === ranked[order[2 * i] - 1].hsid && s.games[0].away_hsid === ranked[order[2 * i + 1] - 1].hsid);
  check('every school\'s Total Runs counts 30 games', standings.length === 1024 && standings.every((s) => s.games === 30),
    `${standings.length} schools in the standings, ${Math.min(...standings.map((s) => s.games))}-${Math.max(...standings.map((s) => s.games))} games each`);
  check('Week 31: the 8 regional Total Runs leaders, seeded 1 v 8, 4 v 5, 2 v 7, 3 v 6', w31ok,
    w31.map((s) => `#${s.games[0].home_seed} ${s.games[0].home_school_name} v #${s.games[0].away_seed} ${s.games[0].away_school_name}`).join('; '));
  const w32 = list('season_championship', 2), w33 = list('season_championship', 3);
  const advOk = w32.every((s, i) => new Set([s.games[0].home_hsid, s.games[0].away_hsid]).has(winner(w31[2 * i])) && new Set([s.games[0].home_hsid, s.games[0].away_hsid]).has(winner(w31[2 * i + 1])))
    && new Set([w33[0].games[0].home_hsid, w33[0].games[0].away_hsid]).has(winner(w32[0])) && new Set([w33[0].games[0].home_hsid, w33[0].games[0].away_hsid]).has(winner(w32[1]));
  check('Weeks 32-33: winners advance', advOk, `${w32.map((s) => `${s.games[0].home_school_name} v ${s.games[0].away_school_name}`).join('; ')}; final: ${w33[0].games[0].home_school_name} v ${w33[0].games[0].away_school_name}`);
  const byes = rows.filter((r) => r.week >= 31 && r.week <= 33 && (r.home_hsid === champion || r.away_hsid === champion)).length;
  check('the Main Bracket winner has byes in Weeks 31-33', byes === 0, `${by('bracket').find((r) => r.home_hsid === champion)?.home_school_name || champion}: ${byes} games in Weeks 31-33`);
  const ws = by('world_series')[0];
  check('Week 34: the Main Bracket winner v the Total Runs winner', ws.home_hsid === champion && ws.away_hsid === winner(w33[0]),
    `${ws.home_school_name} (Main Bracket winner) v ${ws.away_school_name} (Total Runs winner); ${ws.winner_hsid === ws.home_hsid ? ws.home_school_name : ws.away_school_name} won`);

  // Nothing by hand: every slot the seed left empty was filled by the job.
  const [{ filled }] = await q<{ filled: number }>(`
    SELECT count(DISTINCT h.master_bracket_id)::int AS filled FROM public.master_bracket_history h
     WHERE h.reason = 'bracket results job' AND h.old_values->>'home_hsid' IS NULL AND h.new_values->>'home_hsid' IS NOT NULL`);
  const empty = seeded.reduce((n, s) => n + s.n - s.known, 0);
  check('every empty slot filled by the results job, from stored results', filled === empty,
    `${empty} empty slots in the seed (${seeded.map((s) => `${s.stage} ${s.n - s.known}`).join(', ')}); ${filled} filled by the job (master_bracket_history)`);

  check('a rerun of every day changes nothing', before.md5 === after.md5 && before.history === after.history && before.decisions === after.decisions,
    `table ${before.md5 === after.md5 ? 'identical' : 'CHANGED'}; history ${before.history} -> ${after.history}; needs-decision ${before.decisions} -> ${after.decisions}; rerun fills: ${rerun.reduce((n, r) => n + Object.values(r.fills).reduce((a, b) => a + b, 0), 0)}`);

  // A locked final can't be changed; a delete isn't blocked (an open item).
  let updateBlocked = false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE public.master_bracket SET home_runs = home_runs + 1 WHERE season_key = $1 AND game_id = 15368', [SEASON]);
  } catch {
    updateBlocked = true;
  } finally {
    await client.query('ROLLBACK');
  }
  let deleted = 0;
  try {
    await client.query('BEGIN');
    deleted = (await client.query('DELETE FROM public.master_bracket WHERE season_key = $1 AND game_id = 15368', [SEASON])).rowCount || 0;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  check('a locked final can\'t be changed', updateBlocked, updateBlocked ? 'the UPDATE was refused' : 'the UPDATE went through');
  const decisions = await q<{ kind: string; summary: string }>('SELECT kind, summary FROM public.needs_decision ORDER BY id');

  const firstFill = (key: string) => log.find((r) => r.fills[key])?.asof;
  const report = {
    note: 'Local database only; stand-in stats (scores mean nothing). The results job\'s own code and SQL.',
    seeded, alumni: data.alumni, lines: data.lineCount, runs: log.length * 2,
    drawn: Object.fromEntries([...Array.from({ length: 9 }, (_, i) => `total_runs round ${i + 2}`), 'bracket round 8', 'season_championship round 1', 'season_championship round 2', 'season_championship round 3', 'world_series round 1'].map((k) => [k, firstFill(k)])),
    pairing, checks, deleteOfLockedFinal: deleted ? 'not blocked (open item)' : 'blocked', decisions,
    champion: { bracket: ws.home_school_name, totalRuns: ws.away_school_name, worldSeries: ws.winner_hsid === ws.home_hsid ? ws.home_school_name : ws.away_school_name },
    log, minutes: +((Date.now() - t0) / 60000).toFixed(1),
  };
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`drawn: ${JSON.stringify(report.drawn)}`);
  console.log(`delete of a locked final: ${report.deleteOfLockedFinal}; needs-decision items: ${decisions.length}`);
  console.log(`${checks.filter((c) => c.ok).length} of ${checks.length} checks pass (${report.minutes} min)`);
  await pool.end();
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
