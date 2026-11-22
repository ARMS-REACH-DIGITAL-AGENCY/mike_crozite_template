// TEST-ONLY controller. The scorer, advancement, writer, prepared readers and
// browser remain the production implementation. Only the database, source
// snapshot and effective clock are controlled here.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { runSeason, SQL_SEASONS, type Season } from './master-bracket-results';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import type { Live } from '@/components/bracket/liveSeason';

const arg = (name: string, fallback = '') => {
  const at = process.argv.indexOf('--' + name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const flag = (name: string) => process.argv.includes('--' + name);
const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Snapshot = { start: string; weeks: number; capturedAt: string; sourceBase: string; branch: string; endpoint: string; commit: string; fieldHash: string; live: Live };

// A recording of the actual production raw-input route, narrowed to precisely
// the requested schools/window. No fantasy score or player statistic is made
// here. Validate representative windows against fresh route responses below.
export function recordedRequest(snapshot: Snapshot): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.pathname !== '/api/bracket/live' || url.searchParams.get('start') !== snapshot.start) {
      throw new Error('Recorded transport only serves the captured production source path/calendar');
    }
    const weeks = Number(url.searchParams.get('weeks'));
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > snapshot.weeks) throw new Error('Invalid or uncaptured source window');
    const hsids = (url.searchParams.get('h') || '').split(',');
    const wanted = new Set(hsids);
    const days = Math.min(weeks, snapshot.weeks) * 7;
    const roster = Object.fromEntries(hsids.map(id => {
      if (!(id in snapshot.live.roster)) throw new Error('School missing from source recording: ' + id);
      return [id, snapshot.live.roster[id]];
    }));
    const lines = snapshot.live.lines.filter(line => wanted.has(String(line[0])) && line[2] >= 0 && line[2] < days);
    const clubNames = new Set([...Object.values(roster).flat().map(p => p[4]), ...lines.map(line => line[6])].filter(Boolean));
    const windowed = <T extends [number, ...unknown[]]>(all: Record<string, T[]>) =>
      Object.fromEntries(Object.entries(all).filter(([club]) => clubNames.has(club)).map(([club, games]) => [club, games.filter(g => g[0] >= 0 && g[0] < days)]).filter(([, games]) => (games as T[]).length));
    const people = new Set(Object.values(roster).flat().map(p => p[0]));
    const fans = Object.fromEntries(hsids.filter(h => snapshot.live.fans?.[h]?.slice(0, weeks).some(n => n > 0)).map(h => [h, snapshot.live.fans![h].slice(0, weeks)]));
    return Response.json({ asOf: snapshot.live.asOf, start: snapshot.start, weeks, roster, lines,
      clubs: windowed(snapshot.live.clubs), games: windowed(snapshot.live.games || {}), fans,
      yatIdentityBySourceId: Object.fromEntries(Object.entries(snapshot.live.yatIdentityBySourceId || {}).filter(([, id]) => people.has(id))),
    });
  }) as typeof fetch;
}

function normalizedSource(input: Live) {
  const sorted = (rows: unknown[][]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const groups = (map: Record<string, unknown[][]>) => Object.fromEntries(Object.keys(map).sort().map(k => [k, sorted(map[k])]));
  return { roster: groups(input.roster), lines: sorted(input.lines), clubs: groups(input.clubs), games: groups(input.games || {}),
    fans: Object.fromEntries(Object.entries(input.fans || {}).sort(([a], [b]) => a.localeCompare(b))),
    aliases: Object.fromEntries(Object.entries(input.yatIdentityBySourceId || {}).sort(([a], [b]) => a.localeCompare(b))) };
}

async function main() {
  const connectionFile = arg('connection-file');
  if (connectionFile) {
    const config = JSON.parse(readFileSync(connectionFile, 'utf8'));
    process.env.DATABASE_URL = config.DATABASE_URL;
    process.env.PLAYERS_DATABASE_URL = config.PLAYERS_DATABASE_URL;
    process.env.REHEARSAL_NEON_BRANCH = config.branch_id;
  }
  const expectedBranch = arg('expected-branch');
  const expectedEndpoint = arg('expected-endpoint');
  if (!expectedBranch || !expectedEndpoint || process.env.REHEARSAL_NEON_BRANCH !== expectedBranch) {
    throw new Error('An explicitly verified isolated branch and endpoint are required');
  }
  if (!process.env.DATABASE_URL || process.env.PLAYERS_DATABASE_URL !== process.env.DATABASE_URL) throw new Error('Both production DB variables must target the same isolated database');
  const endpoint = new URL(process.env.DATABASE_URL).hostname;
  if (endpoint !== expectedEndpoint) throw new Error('Connection endpoint does not match the verified isolated target');
  const seasonKey = arg('season', '2027');
  const base = arg('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
  const folder = resolve(arg('output', '/tmp/bracket-production-rehearsal'));
  mkdirSync(folder, { recursive: true });
  const sourceFile = resolve(arg('snapshot', folder + '/production-source.json.gz'));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceHashes = Object.fromEntries([
    'scripts/rehearse-production-bracket.ts', 'scripts/master-bracket-results.ts',
    'src/components/bracket/liveSeason.ts', 'src/lib/bracket/engine.ts',
    'src/lib/bracket/fetchLiveBatches.ts', 'src/lib/bracket/preparedIndex.ts',
    'src/app/api/bracket/live/route.ts', 'src/lib/bracket/scheduleAuthority.ts',
  ].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  const codeHash = digest(sourceHashes);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    const { rows: [identity] } = await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
    if (identity?.endpoint !== endpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Connected Neon endpoint differs from verified target');
    const { rows: [season] } = await pool.query<Season>(SQL_SEASONS, [seasonKey, '2026-03-25']);
    if (!season || season.is_test || season.opening_day !== '2026-03-23' || season.last_day !== '2026-11-15' || season.weeks !== 34 || season.regions !== 8 || season.schools_per_region !== 128) {
      throw new Error('The isolated season must retain production dimensions/rules and the agreed March 23–November 15 calendar');
    }
    const { rows: field } = await pool.query('SELECT region,series_no,home_hsid,away_hsid,home_seed,away_seed FROM master_bracket WHERE season_key=$1 AND stage=\'bracket\' AND round=1 AND game_no=1 ORDER BY region,series_no', [seasonKey]);
    const hsids = [...new Set(field.flatMap(r => [String(r.home_hsid), String(r.away_hsid)]))].sort((a, b) => Number(a) - Number(b));
    if (field.length !== 512 || hsids.length !== 1024) throw new Error('Incomplete production field');
    let snapshot: Snapshot;
    if (existsSync(sourceFile)) {
      snapshot = JSON.parse(gunzipSync(readFileSync(sourceFile)).toString('utf8'));
      if (snapshot.branch !== expectedBranch || snapshot.endpoint !== endpoint || snapshot.fieldHash !== digest(field) || snapshot.start !== season.opening_day || snapshot.weeks !== 34) throw new Error('Source recording belongs to a different rehearsal');
    } else {
      let batch = 0;
      const live = await fetchBracketLiveBatches(base, season.opening_day, 34, hsids, async (...args) => {
        const response = await fetch(...args);
        console.log(JSON.stringify({ phase: 'capture', batch: ++batch, schools: Math.min(batch * 64, 1024), status: response.status }));
        return response;
      });
      snapshot = { start: season.opening_day, weeks: 34, capturedAt: new Date().toISOString(), sourceBase: base, branch: expectedBranch, endpoint, commit, fieldHash: digest(field), live };
      mkdirSync(dirname(sourceFile), { recursive: true });
      writeFileSync(sourceFile, gzipSync(JSON.stringify(snapshot)));
    }
    const request = recordedRequest(snapshot);
    const sample = hsids.slice(0, 64);
    for (const weeks of [1, 17, 34]) {
      const direct = await fetchBracketLiveBatches(base, season.opening_day, weeks, sample);
      const recorded = await fetchBracketLiveBatches(base, season.opening_day, weeks, sample, request);
      if (digest(normalizedSource(direct)) !== digest(normalizedSource(recorded))) throw new Error('Recorded source differs from production route at week ' + weeks);
    }
    const sourceHash = digest(snapshot.live);
    console.log(JSON.stringify({ phase: 'source-verified', sourceHash, fieldHash: snapshot.fieldHash, schools: hsids.length, lines: snapshot.live.lines.length, players: Object.values(snapshot.live.roster).flat().length }));
    if (flag('capture-only')) return;
    const from = arg('from', season.opening_day);
    const through = arg('through', addDays(season.last_day, 1));
    const cadence = arg('cadence', 'daily');
    if (!['daily', 'weekly'].includes(cadence) || from < season.opening_day || through > addDays(season.last_day, 1) || through < from) throw new Error('Invalid replay bounds');
    const days: string[] = [];
    for (let day = from; day <= through; day = addDays(day, 1)) {
      if (cadence === 'daily' || new Date(day + 'T00:00:00Z').getUTCDay() === 1 || day === through) days.push(day);
    }
    const progressFile = folder + '/progress.json';
    const history: unknown[] = [];
    if (existsSync(progressFile)) {
      const previous = JSON.parse(readFileSync(progressFile, 'utf8'));
      if (previous.branch !== expectedBranch || previous.sourceHash !== sourceHash || previous.codeHash !== codeHash) throw new Error('Use a new output folder when replay source/code/branch changes');
      history.push(...previous.history);
    }
    for (const day of days) {
      const began = Date.now();
      const effectiveAt = addDays(day, 1) + 'T10:59:59Z';
      const passes = await runSeason(pool, season, day, { base, withBox: true, effectiveAt, request });
      const { rows: [counts] } = await pool.query("SELECT count(*) FILTER(WHERE status='final')::int AS final,count(*) FILTER(WHERE status='in_progress')::int AS in_progress,count(*) FILTER(WHERE home_hsid IS NOT NULL AND away_hsid IS NOT NULL)::int AS filled FROM master_bracket WHERE season_key=$1", [seasonKey]);
      const entry = { day, effectiveAt, seconds: Math.round((Date.now() - began) / 100) / 10, passes, ...counts };
      history.push(entry);
      writeFileSync(progressFile, JSON.stringify({ branch: expectedBranch, endpoint, commit, codeHash, sourceHashes, season: seasonKey, cadence, sourceHash, fieldHash: snapshot.fieldHash, through: day, history }, null, 2));
      console.log(JSON.stringify({ phase: 'persisted', ...entry }));
      if (passes.some(pass => pass.decisions.length)) throw new Error('Production job reported a decision; inspect stored evidence before continuing');
    }
  } finally {
    await pool.end();
  }
}

if (/rehearse-production-bracket\.ts$/.test(process.argv[1] || '')) {
  // Shared browser modules can retain idle client timers. All database work
  // and the pool close are awaited by main before this CLI exits.
  main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
