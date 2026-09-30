#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'audit';
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);
const root = process.cwd();
const defaultFixture = path.join(root, 'public', 'bracket-lab', '2026');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sameArray(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function score(innings) {
  let home = 0, away = 0;
  for (let i = 0; i < innings.length; i += 2) {
    home += Number(innings[i] || 0);
    away += Number(innings[i + 1] || 0);
  }
  return [home, away];
}

function pct(wl) {
  const w = Number(wl?.[0] || 0), l = Number(wl?.[1] || 0);
  return w + l ? w / (w + l) : null;
}

function definiteComparisonOptions(h, a, higherIsBetter, absent) {
  const key = (x, y) => `${x},${y}`;
  const out = new Set();
  const add = (x, y) => out.add(key(x, y));
  const cmp = (x, y) => {
    if (x === y) return 0;
    return higherIsBetter ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
  };

  if (h == null && a == null) {
    add(0, 0);
    return out;
  }
  if (h != null && a != null) {
    const c = cmp(h, a);
    if (c > 0) add(1, 0);
    else if (c < 0) add(0, 1);
    else {
      add(0, 0); add(1, 0); add(0, 1);
    }
    return out;
  }

  if (absent === 'forfeit') {
    add(h == null ? 0 : 1, a == null ? 0 : 1);
    return out;
  }

  const presentIsHome = h != null;
  const present = presentIsHome ? h : a;
  const c = cmp(present, 100);

  if (absent === 'hold') {
    if (c > 0) add(presentIsHome ? 1 : 0, presentIsHome ? 0 : 1);
    else if (c < 0) add(0, 0);
    else {
      add(0, 0);
      add(presentIsHome ? 1 : 0, presentIsHome ? 0 : 1);
    }
    return out;
  }

  if (c > 0) add(presentIsHome ? 1 : 0, presentIsHome ? 0 : 1);
  else if (c < 0) add(presentIsHome ? 0 : 1, presentIsHome ? 1 : 0);
  else { add(0, 0); add(1, 0); add(0, 1); }
  return out;
}

function combinedMetricOptions(row, absent) {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [ho, ao, hp, ap] = row;
  const offense = definiteComparisonOptions(ho, ao, true, absent);
  const pitching = definiteComparisonOptions(hp, ap, false, absent);
  const out = new Set();
  for (const o of offense) for (const p of pitching) {
    const [oh, oa] = o.split(',').map(Number);
    const [ph, pa] = p.split(',').map(Number);
    out.add(`${oh + ph},${oa + pa}`);
  }
  return out;
}

function createRecorder() {
  const categories = new Map();
  const record = (severity, code, message) => {
    const key = `${severity}:${code}`;
    let row = categories.get(key);
    if (!row) {
      row = { severity, code, count: 0, samples: [] };
      categories.set(key, row);
    }
    row.count++;
    if (row.samples.length < 8) row.samples.push(message);
  };
  return { categories, error: (c, m) => record('error', c, m), warn: (c, m) => record('warning', c, m) };
}

function auditFixture(fixture, options = {}) {
  const rec = createRecorder();
  const indexPath = path.join(fixture, 'index.json');
  const lbPath = path.join(fixture, 'lb.json');
  if (!fs.existsSync(indexPath)) throw new Error(`Missing ${indexPath}`);
  if (!fs.existsSync(lbPath)) throw new Error(`Missing ${lbPath}`);
  const index = readJson(indexPath);
  const lbRaw = readJson(lbPath);
  const lb = Array.isArray(lbRaw) ? lbRaw : (lbRaw.games || []);
  const absent = index.rules?.absent || 'hold';
  const mode = index.rules?.mode || 'adjusted';
  const details = new Map();
  const allGames = [];
  const regularGames = [];

  const detail = (file) => {
    if (details.has(file)) return details.get(file);
    const p = path.join(fixture, `${file}.json`);
    if (!fs.existsSync(p)) {
      rec.error('detail-file-missing', `${file}.json`);
      details.set(file, null);
      return null;
    }
    const value = readJson(p);
    details.set(file, value);
    return value;
  };

  const pushGame = (game, file, kind, region = null) => {
    if (!Array.isArray(game) || game.length < 7) {
      rec.error('game-row-invalid', `${kind}: malformed game row`);
      return;
    }
    const entry = { game, file, kind, region };
    allGames.push(entry);
    if (Number(game[1]) <= 30 && (kind === 'bracket' || kind === 'leaderboard')) regularGames.push(entry);
  };

  const expectedSeries = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1];
  if (!Array.isArray(index.rounds) || index.rounds.length !== 10) {
    rec.error('bracket-round-count', `expected 10 rounds, found ${index.rounds?.length ?? 0}`);
  }
  for (let r = 1; r <= 10; r++) {
    const round = index.rounds?.find((x) => Number(x.r) === r);
    if (!round) { rec.error('bracket-round-missing', `round ${r}`); continue; }
    const series = round.series || [];
    if (series.length !== expectedSeries[r - 1]) rec.error('bracket-series-count', `round ${r}: expected ${expectedSeries[r - 1]}, found ${series.length}`);
    for (const s of series) {
      const games = s?.[7] || [];
      if (games.length !== 3) rec.error('series-game-count', `round ${r}, ${s?.[1]} vs ${s?.[2]}: ${games.length} games`);
      const wins = [games.filter((g) => Number(g?.[6]) === Number(s?.[1])).length, games.filter((g) => Number(g?.[6]) === Number(s?.[2])).length];
      if (!sameArray(wins, (s?.[6] || []).map(Number))) rec.error('series-wins-mismatch', `round ${r}, ${s?.[1]} vs ${s?.[2]}: stored ${JSON.stringify(s?.[6])}, actual ${JSON.stringify(wins)}`);
      const expectedWinner = wins[0] > wins[1] ? Number(s?.[1]) : Number(s?.[2]);
      if (Number(s?.[5]) !== expectedWinner || Math.max(...wins) < 2) rec.error('series-winner-mismatch', `round ${r}, ${s?.[1]} vs ${s?.[2]}: winner ${s?.[5]}, wins ${wins.join('-')}`);
      for (const g of games) pushGame(g, `d-${r}-${Number(s?.[0] || 0)}`, 'bracket', Number(s?.[0] || 0));
    }
  }
  for (let r = 2; r <= 10; r++) {
    const prev = new Set((index.rounds?.find((x) => Number(x.r) === r - 1)?.series || []).map((s) => Number(s[5])));
    const cur = new Set((index.rounds?.find((x) => Number(x.r) === r)?.series || []).flatMap((s) => [Number(s[1]), Number(s[2])]));
    if (prev.size !== cur.size || [...prev].some((h) => !cur.has(h))) rec.error('bracket-advancement-mismatch', `round ${r}: participants are not exactly round ${r - 1} winners`);
  }

  for (const g of lb) pushGame(g, `d-lb-${Number(g[1])}-${Number(g[7])}`, 'leaderboard', Number(g[7]));
  for (const x of index.lbt || []) pushGame(x.game, 'd-lbt', 'season-championship');
  for (const g of index.gf || []) pushGame(g, 'd-gf', 'world-series');

  const lbtByWeek = new Map();
  for (const x of index.lbt || []) lbtByWeek.set(Number(x.game?.[1]), (lbtByWeek.get(Number(x.game?.[1])) || 0) + 1);
  for (const [week, count] of [[31, 4], [32, 2], [33, 1]]) if ((lbtByWeek.get(week) || 0) !== count) rec.error('postseason-shape', `week ${week}: expected ${count} games, found ${lbtByWeek.get(week) || 0}`);
  if ((index.gf || []).length !== 1 || Number(index.gf?.[0]?.[1]) !== 34) rec.error('world-series-shape', `expected one week-34 game, found ${(index.gf || []).length}`);

  const ids = new Set();
  const rosterManifest = index.rosters && typeof index.rosters === 'object' ? index.rosters : null;
  if (!rosterManifest) rec.error('roster-manifest-missing', 'index.json has no canonical season roster manifest; regenerate with the current simulator before certification');
  const rosterSets = new Map();
  if (rosterManifest) {
    for (const [hsid, rows] of Object.entries(rosterManifest)) rosterSets.set(Number(hsid), new Set((rows || []).map((r) => String(r[0]))));
  }

  let metricChecked = 0;
  let rosterSidesChecked = 0;
  for (const { game, file, kind } of allGames) {
    const id = Number(game[0]), week = Number(game[1]), home = Number(game[2]), away = Number(game[3]);
    if (ids.has(id)) rec.error('duplicate-game-id', `game ${id}`); else ids.add(id);
    const innings = Array.isArray(game[5]) ? game[5].map(Number) : [];
    if (innings.length !== 18) rec.error('inning-vector-length', `game ${id}: expected 18 values, found ${innings.length}`);
    for (let i = 0; i < Math.min(8, Math.floor(innings.length / 2)); i++) {
      const h = Number(innings[i * 2] || 0), a = Number(innings[i * 2 + 1] || 0);
      if (h < 0 || a < 0 || h + a > 2) rec.error('inning-run-limit', `game ${id} week ${week} inning ${i + 1}: ${h}-${a}`);
    }
    if (innings.length >= 18) {
      const h = Number(innings[16] || 0), a = Number(innings[17] || 0);
      if (h < 0 || a < 0 || h + a > 1) rec.error('inning9-run-limit', `game ${id} week ${week}: ${h}-${a}`);
    }

    const boxFile = detail(file);
    const box = boxFile?.[String(id)];
    if (!box) {
      rec.error('game-detail-missing', `game ${id} (${kind}) missing from ${file}.json`);
      continue;
    }

    if (mode === 'adjusted') {
      for (let i = 0; i < 8; i++) {
        const options = combinedMetricOptions(box.d?.[i], absent);
        if (!options) continue;
        metricChecked++;
        const saved = `${Number(innings[i * 2] || 0)},${Number(innings[i * 2 + 1] || 0)}`;
        if (!options.has(saved)) rec.error('metric-run-disagreement', `game ${id} week ${week} inning ${i + 1}: saved ${saved}, metrics ${JSON.stringify(box.d?.[i])}`);
      }
    } else {
      rec.warn('raw-mode-metric-check-skipped', `game ${id}: rounded raw metrics cannot be safely re-scored from export`);
    }

    if (innings.length >= 18) {
      const hp0 = pct(box.h?.wl), ap0 = pct(box.a?.wl);
      const hp = hp0 ?? 0.5, ap = ap0 ?? 0.5;
      const expected = hp0 == null && ap0 == null ? [0, 0] : hp > ap ? [1, 0] : ap > hp ? [0, 1] : [0, 0];
      const saved = [Number(innings[16] || 0), Number(innings[17] || 0)];
      if (!sameArray(expected, saved)) rec.error('inning9-wl-disagreement', `game ${id} week ${week}: saved ${saved.join('-')}, expected ${expected.join('-')} from ${JSON.stringify(box.h?.wl)} vs ${JSON.stringify(box.a?.wl)}`);
    }

    for (const [side, hsid] of [['h', home], ['a', away]]) {
      const rows = box?.[side]?.p || [];
      const actual = rows.map((p) => String(p[0]));
      const unique = new Set(actual);
      if (unique.size !== actual.length) rec.error('duplicate-player-row', `game ${id} ${side}: duplicate player IDs`);
      const expected = rosterSets.get(hsid);
      if (expected) {
        rosterSidesChecked++;
        const missing = [...expected].filter((pid) => !unique.has(pid));
        if (missing.length) rec.error('roster-incomplete', `game ${id} week ${week} school ${hsid}: ${missing.length}/${expected.size} canonical players missing (${missing.slice(0, 8).join(', ')})`);
      }
    }
  }

  const opps = new Map();
  const lbCounts = new Map();
  for (const g of lb) {
    const week = Number(g[1]), round = Math.ceil(week / 3), h = Number(g[2]), a = Number(g[3]);
    for (const [team, opp] of [[h, a], [a, h]]) {
      const k = `${round}:${team}`;
      if (!opps.has(k)) opps.set(k, new Set());
      opps.get(k).add(opp);
      const pairKey = `${round}:${Math.min(team, opp)}:${Math.max(team, opp)}`;
      lbCounts.set(pairKey, (lbCounts.get(pairKey) || 0) + (team < opp ? 1 : 0));
    }
  }
  for (const [k, set] of opps) if (set.size > 1) rec.error('leaderboard-opponent-changed', `${k}: opponents ${[...set].join(', ')}`);
  for (const [k, count] of lbCounts) if (count !== 3) rec.error('leaderboard-series-game-count', `${k}: ${count} games`);

  const board = new Map();
  const addStanding = (h, rf, ra, winner) => {
    const cur = board.get(h) || { h, games: 0, w: 0, l: 0, t: 0, rf: 0, ra: 0 };
    cur.games++; cur.rf += rf; cur.ra += ra;
    if (winner == null) cur.t++; else if (winner === h) cur.w++; else cur.l++;
    board.set(h, cur);
  };
  for (const { game } of regularGames) {
    const [hscore, ascore] = score(game[5] || []);
    const h = Number(game[2]), a = Number(game[3]), winner = game[6] == null ? null : Number(game[6]);
    addStanding(h, hscore, ascore, winner); addStanding(a, ascore, hscore, winner);
  }
  const schools = index.schools || {};
  const seed = (h) => Number(schools[String(h)]?.[2] ?? 9999);
  const rankBoard = (a, b) => {
    const x = board.get(a), y = board.get(b);
    return (y.rf - x.rf) || ((y.rf - y.ra) - (x.rf - x.ra)) || (y.w - x.w) || (seed(a) - seed(b));
  };
  const champion = Number(index.champion);
  const rebuiltLeaders = [];
  for (let region = 1; region <= 8; region++) {
    const ranked = [...board.keys()].filter((h) => Number(schools[String(h)]?.[1]) === region).sort(rankBoard);
    const q = ranked.find((h) => h !== champion);
    if (q != null) rebuiltLeaders.push(q);
  }
  rebuiltLeaders.sort(rankBoard);
  const storedLeaders = (index.lbLeaders || []).map(Number);
  if (!sameArray(rebuiltLeaders, storedLeaders)) rec.error('qualifier-snapshot-mismatch', `stored [${storedLeaders.join(', ')}], rebuilt [${rebuiltLeaders.join(', ')}]`);

  const gameCounts = [...board.values()].reduce((m, s) => {
    m.set(s.games, (m.get(s.games) || 0) + 1); return m;
  }, new Map());
  const unequal = [...board.values()].filter((s) => s.games !== 30);
  if (unequal.length) rec.warn('unequal-regular-season-opportunities', `${unequal.length} schools have fewer/more than 30 games; distribution ${JSON.stringify(Object.fromEntries([...gameCounts].sort((a, b) => a[0] - b[0])))}`);
  if (options.strictByes && unequal.length) rec.error('bye-policy-unresolved', `${unequal.length} schools do not have 30 scoring opportunities`);

  const errors = [...rec.categories.values()].filter((x) => x.severity === 'error').reduce((s, x) => s + x.count, 0);
  const warnings = [...rec.categories.values()].filter((x) => x.severity === 'warning').reduce((s, x) => s + x.count, 0);
  return {
    status: errors ? 'FAIL' : 'PASS',
    fixture,
    season: index.season,
    snapshot: index.snapshot || null,
    counts: {
      schools: Object.keys(schools).length,
      mainBracketGames: allGames.filter((x) => x.kind === 'bracket').length,
      leaderboardGames: allGames.filter((x) => x.kind === 'leaderboard').length,
      seasonChampionshipGames: allGames.filter((x) => x.kind === 'season-championship').length,
      worldSeriesGames: allGames.filter((x) => x.kind === 'world-series').length,
      gameIds: ids.size,
      metricInningsChecked: metricChecked,
      rosterSidesChecked,
      canonicalRosters: rosterSets.size,
    },
    errors,
    warnings,
    categories: [...rec.categories.values()].sort((a, b) => a.severity.localeCompare(b.severity) || b.count - a.count || a.code.localeCompare(b.code)),
  };
}

function printReport(report) {
  console.log('YAT?STATS Tournament Integrity Audit');
  console.log(`Status: ${report.status}`);
  console.log(`Fixture: ${report.fixture}`);
  if (report.snapshot) console.log(`Snapshot: ${JSON.stringify(report.snapshot)}`);
  console.log(`Games: ${report.counts.mainBracketGames} bracket + ${report.counts.leaderboardGames} leaderboard + ${report.counts.seasonChampionshipGames} season championship + ${report.counts.worldSeriesGames} world series`);
  console.log(`Checks: ${report.counts.metricInningsChecked} metric innings; ${report.counts.rosterSidesChecked} roster sides; ${report.counts.canonicalRosters} canonical school rosters`);
  for (const severity of ['error', 'warning']) {
    const rows = report.categories.filter((x) => x.severity === severity);
    if (!rows.length) continue;
    console.log(`\n${severity === 'error' ? 'ERRORS' : 'WARNINGS'}`);
    for (const row of rows) {
      console.log(`- ${row.code}: ${row.count}`);
      for (const sample of row.samples) console.log(`    ${sample}`);
    }
  }
  console.log(`\nResult: ${report.errors} error(s), ${report.warnings} warning(s).`);
}

function writeReport(report) {
  const reportPath = flag('--report');
  if (reportPath) {
    const dest = path.resolve(root, reportPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(report, null, 2));
    console.log(`JSON report: ${dest}`);
  }
}

function runAudit() {
  const fixture = path.resolve(root, flag('--fixture', defaultFixture));
  const report = auditFixture(fixture, { strictByes: has('--strict-byes') });
  printReport(report); writeReport(report);
  process.exitCode = report.errors ? 1 : 0;
}

function runRegenerate() {
  const dataArg = flag('--data');
  if (!dataArg) throw new Error('regenerate requires --data <source-export-directory>');
  const data = path.resolve(root, dataArg);
  const target = path.resolve(root, flag('--fixture', defaultFixture));
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const token = `${process.pid}-${Date.now()}`;
  const staging = path.join(parent, `.2026-next-${token}`);
  const backup = path.join(parent, `.2026-backup-${token}`);
  const resultFile = path.join(os.tmpdir(), `yatstats-bracket-2026-${token}.json`);
  fs.rmSync(staging, { recursive: true, force: true });

  console.log(`Regenerating into staging: ${staging}`);
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const simArgs = ['--yes', 'tsx', 'scripts/simulate-bracket-2026.ts', '--data', data, '--out', resultFile, '--export', staging];
  if (has('--no-spring')) simArgs.push('--no-spring');
  const mode = flag('--mode'); if (mode) simArgs.push('--mode', mode);
  const absent = flag('--absent'); if (absent) simArgs.push('--absent', absent);
  const child = spawnSync(runner, simArgs, { cwd: root, stdio: 'inherit' });
  if (child.status !== 0) throw new Error(`Simulator failed with exit code ${child.status}`);

  const report = auditFixture(staging, { strictByes: has('--strict-byes') });
  printReport(report); writeReport(report);
  if (report.errors) {
    console.error(`\nRegeneration rejected. Existing fixture was not changed. Staging kept at ${staging}`);
    process.exitCode = 1;
    return;
  }

  try {
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    fs.renameSync(staging, target);
    fs.rmSync(backup, { recursive: true, force: true });
    console.log(`\nPublished validated fixture: ${target}`);
  } catch (err) {
    if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw err;
  }
}

if (command === 'audit') runAudit();
else if (command === 'regenerate') runRegenerate();
else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node scripts/bracket-integrity-2026.mjs [audit|regenerate] [options]');
  process.exitCode = 2;
}
