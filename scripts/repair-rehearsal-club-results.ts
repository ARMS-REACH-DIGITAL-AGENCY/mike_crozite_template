// TEST-ONLY: correct the current paused rehearsal after a shared club-feed fix.
// Uses the production runSeason/writeSeason path. Never advances the clock,
// unlocks a final, changes a pairing, republishes a Digest, or sends email.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Client, type Pool } from 'pg';
import { runSeason, SQL_ROWS, SQL_SEASONS, type Season } from './master-bracket-results';
import { recordedRequest, normalizedSource, addDays, type Snapshot } from './rehearsal-day';
import { fetchBracketLiveBatches } from '../src/lib/bracket/fetchLiveBatches';
import { stableJson, readFinishedEdition } from '../src/lib/newsletter/finishedPublication';
import type { Live } from '../src/components/bracket/liveSeason';
import type { GameBox, PlayerRow } from '../src/components/bracket/gallery';

const digest = (value: unknown) => createHash('sha256').update(stableJson(JSON.parse(JSON.stringify(value)))).digest('hex');
const arg = (name: string, fallback = '') => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const STORED = `SELECT stage,region,round,series_no,game_no,game_id,week,home_hsid,away_hsid,
  status,innings,home_runs,away_runs,winner_hsid,decided_by,computed_at::text,locked_at::text,box
  FROM master_bracket WHERE season_key=$1 AND computed_at IS NOT NULL
  ORDER BY stage,region,round,series_no,game_no`;
const noClubFields = (live: Live) => {
  const { clubs: _clubs, games: _games, ...rest } = normalizedSource(live);
  return rest;
};
const coreFacts = (facts: Record<string, unknown>) => {
  const { presentation: _presentation, ...rest } = facts;
  return rest;
};
const withoutWl = (row: PlayerRow) => row.filter((_, i) => i !== 8);
export function nonClubBox(box: GameBox) {
  const side = (x: GameBox['h']) => ({ p: x.p.map(withoutWl), days: x.days?.map(d => d.map(withoutWl)) });
  return { ...box, h: side(box.h), a: side(box.a) };
}

/** A recapture may only remove source games, never alter a retained result. */
export function removedClubGames(before: Live, after: Live): string[] {
  if (digest(noClubFields(before)) !== digest(noClubFields(after))) throw new Error('Recapture changed player statistics, rosters, identities or fan facts');
  const removed = new Set<string>();
  for (const field of ['clubs', 'games'] as const) {
    const originals = new Map<string, unknown[]>();
    for (const [club, rows] of Object.entries(before[field] || {})) {
      for (const row of rows) originals.set(club + '\0' + row[1], row);
    }
    const kept = new Set<string>();
    for (const [club, rows] of Object.entries(after[field] || {})) for (const row of rows) {
      const key = club + '\0' + row[1];
      if (digest(originals.get(key) || null) !== digest(row)) throw new Error('Recapture added or changed a retained club game');
      kept.add(key);
    }
    for (const [key, row] of originals) if (!kept.has(key)) removed.add(String(row[1]));
  }
  return [...removed].sort();
}

/** Enclose the real writer's existing transactions in the repair transaction. */
export function repairWriterPool(db: { query(sql: string, values?: unknown[]): Promise<any> }, week: number) {
  let refreshFrozenInput = true;
  const client = {
    query(sql: string, values?: unknown[]) {
      if (sql === 'BEGIN') return db.query('SAVEPOINT rehearsal_results_writer');
      if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT rehearsal_results_writer');
      if (sql === 'ROLLBACK') return db.query('ROLLBACK TO SAVEPOINT rehearsal_results_writer');
      return db.query(sql, values);
    },
    release() {},
  };
  return {
    pool: {
      async query(sql: string, values?: unknown[]) {
        const result = await db.query(sql, values);
        if (sql !== SQL_ROWS || !refreshFrozenInput) return result;
        // The bad test-day snapshot must be recalculated once. Only the
        // explicitly selected unfinished week loses its old freeze marker,
        // in memory; the saved rows remain intact until writeSeason writes.
        return { ...result, rows: result.rows.map((row: any) => row.week === week && !row.locked_at
          ? { ...row, computed_at: null, box_in_progress: null } : row) };
      },
      async connect() { return client; },
    } as unknown as Pool,
    useNormalFrozenInput() { refreshFrozenInput = false; },
  };
}

export function assertClubOnlyRepair(before: any[], after: any[], reportDay: number) {
  if (before.length !== after.length) throw new Error('Repair changed the stored game count');
  for (let i = 0; i < before.length; i++) {
    const { box: was, ...oldResult } = before[i];
    const { box: now, ...newResult } = after[i];
    if (digest(oldResult) !== digest(newResult) || digest(nonClubBox(was)) !== digest(nonClubBox(now))) {
      throw new Error('Repair changed a score, clock, roster or non-club statistic for game ' + before[i].game_id);
    }
    for (const side of ['h', 'a'] as const) {
      if (digest(was[side].days[reportDay]) !== digest(now[side].days[reportDay])) throw new Error('Reported-day publication facts changed');
      const totals = [0, 0];
      for (const [day, players] of (now[side].days as PlayerRow[][]).entries()) for (const player of players) {
        const [w, l] = player[8] || [0, 0];
        if (day > reportDay && (w || l)) throw new Error('A future daily club result entered the repair');
        totals[0] += w; totals[1] += l;
      }
      if (digest(totals) !== digest(now[side].wl)) throw new Error('Weekly W-L differs from its own daily ledger');
    }
  }
}

async function main() {
  const day = arg('day'), seasonKey = arg('season', '2027');
  const branch = arg('expected-branch'), endpoint = arg('expected-endpoint');
  const expectedSourceHash = arg('expected-source-hash'), expectedStoredHash = arg('expected-stored-hash');
  if (process.env.VERCEL_ENV === 'production' || branch !== 'br-flat-sun-a4ekggjz' ||
      endpoint !== 'ep-noisy-silence-a44roryg.us-east-1.aws.neon.tech' || day !== '2026-03-25' || seasonKey !== '2027') {
    throw new Error('This correction is restricted to the identified, paused first-day QA checkpoint');
  }
  if (![expectedSourceHash, expectedStoredHash].every(x => /^[a-f0-9]{64}$/.test(x))) throw new Error('Explicit original source and stored-result hashes are required');
  const config = JSON.parse(readFileSync(arg('connection-file'), 'utf8'));
  if (config.branch_id !== branch || config.DATABASE_URL !== config.PLAYERS_DATABASE_URL || new URL(config.DATABASE_URL).hostname !== endpoint) throw new Error('Connection does not match the verified QA target');
  const base = arg('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const folder = resolve(arg('out', '/tmp/rehearsal-club-correction'));
  mkdirSync(folder, { recursive: true });
  const db = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await db.query("SET LOCAL lock_timeout = '10s'");
    const identity = (await db.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
    if (identity.endpoint !== endpoint.split('.')[0]) throw new Error('Actual connected Neon endpoint is different');
    const checkpoints = (await db.query('SELECT *, report_date::text AS report_date,effective_at::text AS effective_at FROM bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date FOR UPDATE', [seasonKey])).rows;
    const checkpoint = checkpoints[0];
    if (checkpoints.length !== 1 || checkpoint.report_date !== day || checkpoint.branch_id !== branch || checkpoint.phase !== 'awaiting_review') throw new Error('Only the existing first-day review checkpoint may be repaired');
    if (checkpoint.evidence.sourceHash !== expectedSourceHash || checkpoint.evidence.storedHash !== expectedStoredHash || digest(checkpoint.source_snapshot.live) !== expectedSourceHash) throw new Error('Original checkpoint changed since review');
    const cutoffAt = addDays(day, 1) + 'T11:00:00Z';
    if (Date.parse(checkpoint.effective_at) !== Date.parse(cutoffAt)) throw new Error('Unexpected paused clock');
    const season = (await db.query<Season>(SQL_SEASONS, [seasonKey, day])).rows[0];
    if (!season || season.is_test || season.opening_day !== '2026-03-23' || season.weeks !== 34 || season.regions !== 8 || season.schools_per_region !== 128) throw new Error('Rehearsal calendar or production field dimensions changed');
    await db.query('SELECT game_id FROM master_bracket WHERE season_key=$1 FOR UPDATE', [seasonKey]);
    const before = (await db.query(STORED, [seasonKey])).rows;
    if (before.length !== 512 || before.some(r => r.week !== 1 || r.locked_at || r.status !== 'in_progress' || Date.parse(r.computed_at) !== Date.parse(cutoffAt)) || digest(before) !== expectedStoredHash) throw new Error('Stored first-day results changed or include a final/later week');
    const field = (await db.query("SELECT region,series_no,home_hsid,away_hsid,home_seed,away_seed FROM master_bracket WHERE season_key=$1 AND stage='bracket' AND round=1 AND game_no=1 ORDER BY region,series_no", [seasonKey])).rows;
    const hsids = [...new Set(field.flatMap(r => [String(r.home_hsid), String(r.away_hsid)]))].sort((a, b) => Number(a) - Number(b));
    if (field.length !== 512 || hsids.length !== 1024 || digest(field) !== checkpoint.source_snapshot.fieldHash) throw new Error('The field differs from the original rehearsal');
    let batch = 0;
    const live = await fetchBracketLiveBatches(base, season.opening_day, 1, hsids, async (...args) => {
      const response = await fetch(...args);
      console.log(JSON.stringify({ phase: 'recapture', batch: ++batch, status: response.status }));
      return response;
    });
    const removed = removedClubGames(checkpoint.source_snapshot.live, live);
    if (!removed.length || removed.some(id => !/^\d+$/.test(id))) throw new Error('No verifiable excluded source games were removed');
    const exclusions = (await db.query('SELECT game_pk::text AS game,game_type FROM team_schedules WHERE game_pk=ANY($1::bigint[])', [removed])).rows;
    if (exclusions.length !== removed.length || exclusions.some(r => !/^(S|E|I|A)$/i.test(String(r.game_type)))) throw new Error('A removed game was not explicitly excluded by the source game type');
    const snapshot: Snapshot = { ...checkpoint.source_snapshot, live, capturedAt: new Date().toISOString(), sourceBase: base, commit };
    const request = recordedRequest(snapshot, day);
    const masked = await fetchBracketLiveBatches(base, season.opening_day, 1, hsids, request);
    const reportDay = 2;
    if (Object.values(masked.clubs).flat().some(g => g[0] < reportDay || g[0] > reportDay)) throw new Error('The first report still contains a Monday/Tuesday or future club result');
    const sourceHashes = Object.fromEntries([...new Set([...Object.keys(checkpoint.evidence.sourceHashes || {}), 'scripts/repair-rehearsal-club-results.ts'])].sort().map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
    const correction = digest({ expectedSourceHash, expectedStoredHash, sourceHash: digest(live), commit });
    await db.query(`CREATE TABLE IF NOT EXISTS bracket_rehearsal_corrections (
      correction_hash text PRIMARY KEY,season_key text NOT NULL,report_date date NOT NULL,
      reason text NOT NULL,previous_checkpoint jsonb NOT NULL,previous_results jsonb NOT NULL,
      corrected_evidence jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    await db.query(`INSERT INTO bracket_rehearsal_corrections(correction_hash,season_key,report_date,reason,previous_checkpoint,previous_results)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [correction, seasonKey, day, 'Exclude source-identified preseason/exhibition club results using the corrected shared pipeline', JSON.stringify(checkpoint), JSON.stringify(before)]);
    const adapter = repairWriterPool(db, 1);
    const passes = [];
    for (const [asof, effectiveAt] of [[day, addDays(day, 1) + 'T10:59:59Z'], [addDays(day, 1), cutoffAt]]) {
      const result = await runSeason(adapter.pool, season, asof, { base, withBox: true, effectiveAt, request });
      if (result.length !== 1 || result.some(r => r.results !== 512 || r.final || r.fills || r.boxFills || r.decisions.length)) throw new Error('Repair attempted finalization, advancement or a decision');
      adapter.useNormalFrozenInput();
      passes.push({ asof, effectiveAt, passes: result });
      console.log(JSON.stringify({ phase: 'rescored', asof, result }));
    }
    const after = (await db.query(STORED, [seasonKey])).rows;
    assertClubOnlyRepair(before, after, reportDay);
    const archives = (await db.query("SELECT recipient_email,facts,content_hash FROM bracket_rehearsal_editions WHERE season_key=$1 AND cadence='daily' AND period_start=$2", [seasonKey, day])).rows;
    if (archives.length !== 1) throw new Error('Expected one immutable first-day review edition');
    const freshFacts = await readFinishedEdition(db, { cadence: 'daily', date: day, email: archives[0].recipient_email, seasonKey });
    if (digest(coreFacts(freshFacts)) !== digest(coreFacts(archives[0].facts))) throw new Error('Prepared Daily Digest facts differ from its archive');
    const evidence = { ...checkpoint.evidence, commit, sourceHashes, codeHash: digest(sourceHashes), sourceHash: digest(live),
      effectiveInputHash: digest(masked), storedHash: digest(after), passes,
      correction: { hash: correction, reason: 'Shared source-game eligibility correction', previousSourceHash: expectedSourceHash,
        previousStoredHash: expectedStoredHash, excludedGames: exclusions, publicationUnchanged: true,
        archiveContentHash: archives[0].content_hash, clockUnchanged: true, finishedGamesReopened: 0 } };
    await db.query(`UPDATE bracket_rehearsal_days SET source_snapshot=$3::jsonb,stored_results=$4::jsonb,evidence=$5::jsonb,updated_at=clock_timestamp()
      WHERE season_key=$1 AND report_date=$2 AND phase='awaiting_review'`, [seasonKey, day, JSON.stringify(snapshot), JSON.stringify(after), JSON.stringify(evidence)]);
    await db.query('UPDATE bracket_rehearsal_corrections SET corrected_evidence=$2::jsonb WHERE correction_hash=$1', [correction, JSON.stringify(evidence)]);
    await db.query('COMMIT');
    writeFileSync(resolve(folder, 'corrected-source.json.gz'), gzipSync(JSON.stringify(snapshot)));
    writeFileSync(resolve(folder, 'corrected-stored-results.json.gz'), gzipSync(JSON.stringify(after)));
    writeFileSync(resolve(folder, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ phase: 'awaiting_review', reportDate: day, cutoffAt, correction, storedGames: after.length,
      removedSourceGames: exclusions.length, sourceHash: evidence.sourceHash, storedHash: evidence.storedHash,
      publicationUnchanged: true, emailSent: false }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await db.end(); }
}
if (/repair-rehearsal-club-results\.ts$/.test(process.argv[1] || '')) main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
});
