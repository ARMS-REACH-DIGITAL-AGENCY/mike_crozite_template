// TEST-ONLY: one day per invocation, followed by a stored Digest and a pause.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { SQL_SEASONS, type Season } from './master-bracket-results';
import { runBracketResultsJob } from '@/lib/bracket/resultsJob';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import { addDays, validateRehearsalDay, type Snapshot } from './rehearsal-day';
import { renderFinishedEdition, stableJson, type FinishedEdition } from '@/lib/newsletter/finishedPublication';
import { newsletterPeriods, publishNewsletterDay, readNewsletterReview } from '@/lib/newsletter/scheduledPublication';
import { runMlbLiveGameLogs } from '@/lib/mlb/liveGameLogs';
import { runLiveScheduleRefresh } from '@/lib/mlb/liveScheduleRefresh';
import { createHistoricalMlbSource, type HistoricalMlbRecord } from './lib/rehearsal-mlb-source';
import { rehearsalResumeMode, runRehearsalStages, type ReadyPeriod, type RehearsalResumeCheckpoint } from './lib/rehearsal-resume';
import { acquireRehearsalCheckpointLock } from './lib/rehearsal-checkpoint-lock';

export { recordedRequest } from './rehearsal-day';
const arg = (name: string, fallback = '') => {
  const at = process.argv.indexOf('--' + name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const digest = (value: unknown) => createHash('sha256').update(stableJson(JSON.parse(JSON.stringify(value)))).digest('hex');
const PRODUCTION_BRANCH = 'br-polished-lab-a4i35u5j';
const PARITY_FILES = [
  'src/app/api/cron/mlb-live-gamelogs/route.ts', 'src/app/api/cron/live-schedule-refresh/route.ts',
  'src/lib/mlb/ingestionContext.ts', 'src/lib/mlb/liveGameLogs.ts', 'src/lib/mlb/liveScheduleRefresh.ts',
  'src/app/api/cron/bracket-results/route.ts', 'src/lib/bracket/resultsJob.ts',
  'scripts/master-bracket-results.ts', 'src/components/bracket/liveSeason.ts',
  'src/lib/bracket/engine.ts', 'src/lib/bracket/fetchLiveBatches.ts',
  'src/lib/bracket/preparedIndex.ts', 'src/lib/bracket/scheduleAuthority.ts',
  'src/app/api/bracket/live/route.ts', 'src/app/api/players/[hsid]/route.ts',
  'scripts/newsletter-publish.ts', 'src/lib/bracket/storedPublication.ts',
  'src/lib/newsletter/finishedPublication.ts', 'src/lib/newsletter/dailyDigestLayout.ts',
  'src/lib/newsletter/scheduledPublication.ts', 'src/app/api/cron/fan-daily-pilot/route.ts',
];

async function main() {
  if (['--from', '--through', '--cadence'].some(x => process.argv.includes(x))) throw new Error('Bulk rehearsal is disabled. Supply one --day and stop for its Digest review.');
  const day = arg('day');
  validateRehearsalDay(day, { report_date: day, phase: '' });
  const config = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file'), 'utf8')) : {
    DATABASE_URL: process.env.DATABASE_URL, PLAYERS_DATABASE_URL: process.env.PLAYERS_DATABASE_URL,
    branch_id: process.env.REHEARSAL_NEON_BRANCH,
  };
  process.env.DATABASE_URL = config.DATABASE_URL;
  process.env.PLAYERS_DATABASE_URL = config.PLAYERS_DATABASE_URL;
  process.env.REHEARSAL_NEON_BRANCH = config.branch_id;
  const expectedBranch = arg('expected-branch'), expectedEndpoint = arg('expected-endpoint');
  if (!expectedBranch || expectedBranch === PRODUCTION_BRANCH || config.branch_id !== expectedBranch || !expectedEndpoint) throw new Error('An explicitly verified isolated branch and endpoint are required');
  if (!config.DATABASE_URL || config.PLAYERS_DATABASE_URL !== config.DATABASE_URL) throw new Error('Both database variables must target the same isolated database');
  const endpoint = new URL(config.DATABASE_URL).hostname;
  if (endpoint !== expectedEndpoint) throw new Error('Connection endpoint differs from the verified isolated target');
  const seasonKey = arg('season', '2027'), email = arg('email');
  if (!email) throw new Error('Name the single recipient for the review copy with --email');
  const base = arg('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
  const publicBase = new URL(arg('public-base'));
  if (!['https:', 'http:'].includes(publicBase.protocol) || publicBase.username || publicBase.password) throw new Error('Supply the review deployment URL without credentials using --public-base');
  const folder = resolve(arg('output', '/tmp/bracket-day-by-day') + '/' + day);
  mkdirSync(folder, { recursive: true });
  const sourceFile = folder + '/production-source.json.gz';
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const productionRef = arg('production-ref');
  if (!productionRef) throw new Error('Supply the freshly fetched production ref with --production-ref');
  const productionCommit = execFileSync('git', ['rev-parse', productionRef], { encoding: 'utf8' }).trim();
  const parityHashes: Record<string, string> = {};
  for (const file of PARITY_FILES) {
    const local = createHash('sha256').update(readFileSync(file)).digest('hex');
    const production = createHash('sha256').update(execFileSync('git', ['show', productionCommit + ':' + file])).digest('hex');
    if (local !== production) throw new Error('Shared production code differs before rehearsal: ' + file);
    parityHashes[file] = local;
  }
  const sourceHashes = Object.fromEntries([
    'scripts/rehearse-production-bracket.ts', 'scripts/rehearsal-day.ts', 'scripts/lib/rehearsal-mlb-source.ts',
    'scripts/lib/rehearsal-resume.ts', 'scripts/lib/rehearsal-checkpoint-lock.ts', 'scripts/master-bracket-results.ts',
    'scripts/newsletter-publish.ts', 'src/lib/bracket/storedPublication.ts', 'src/lib/newsletter/finishedPublication.ts',
    'src/components/bracket/liveSeason.ts', 'src/lib/bracket/engine.ts', 'src/lib/bracket/fetchLiveBatches.ts',
    'src/lib/bracket/preparedIndex.ts', 'src/app/api/bracket/live/route.ts', 'src/lib/bracket/scheduleAuthority.ts',
    'src/app/api/bracket/prepared/route.ts', 'src/lib/bracket/rehearsalClock.ts',
    'src/components/bracket/preparedSeason.ts', 'src/components/bracket/simulationState.ts',
  ].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  const codeHash = digest(sourceHashes), cutoffAt = addDays(day, 1) + 'T11:00:00Z';
  const pool = new Pool({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  let releaseCheckpoint: (() => Promise<void>) | undefined;
  try {
    releaseCheckpoint = await acquireRehearsalCheckpointLock(pool, expectedBranch, seasonKey);
    const { rows: [identity] } = await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
    if (identity?.endpoint !== endpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Actual Neon endpoint differs from the verified target');
    const { rows: [season] } = await pool.query<Season>(SQL_SEASONS, [seasonKey, day]);
    if (!season || season.is_test || season.opening_day !== '2026-03-23' || season.last_day !== '2026-11-15' || season.weeks !== 34 || season.regions !== 8 || season.schools_per_region !== 128) throw new Error('The isolated season must retain production dimensions/rules and the agreed March 23–November 15 calendar');
    const { rows: [future] } = await pool.query('SELECT count(*)::int AS n FROM master_bracket WHERE season_key=$1 AND computed_at>$2::timestamptz', [seasonKey, cutoffAt]);
    if (future.n) throw new Error('This database already contains later results; preserve it and use a fresh isolated branch');
    await pool.query(`CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_days (
      season_key text NOT NULL, report_date date NOT NULL, branch_id text NOT NULL,
      effective_at timestamptz NOT NULL, phase text NOT NULL, evidence jsonb NOT NULL,
      source_snapshot jsonb NOT NULL, stored_results jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (season_key,report_date))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_editions (
      season_key text NOT NULL,cadence text NOT NULL,period_start date NOT NULL,recipient_email text NOT NULL,
      subject text NOT NULL,html text NOT NULL,plain_text text NOT NULL,facts jsonb NOT NULL,
      content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(season_key,cadence,period_start,recipient_email))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_provider_inputs (
      season_key text NOT NULL,report_date date NOT NULL,source_url text NOT NULL,
      provider_hash text NOT NULL,replay_hash text NOT NULL,
      record jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(season_key,report_date,source_url,provider_hash,replay_hash))`);
    const { rows: [previous] } = await pool.query<RehearsalResumeCheckpoint & {
      evidence: Record<string, unknown>; source_snapshot: Snapshot; stored_results: unknown[] | null;
    }>('SELECT report_date::text,branch_id,effective_at::text,phase,evidence,source_snapshot,stored_results FROM bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date DESC LIMIT 1', [seasonKey]);
    validateRehearsalDay(day, previous, arg('reviewed-day'));
    const { rows: field } = await pool.query("SELECT region,series_no,home_hsid,away_hsid,home_seed,away_seed FROM master_bracket WHERE season_key=$1 AND stage='bracket' AND round=1 AND game_no=1 ORDER BY region,series_no", [seasonKey]);
    const hsids = [...new Set(field.flatMap(r => [String(r.home_hsid), String(r.away_hsid)]))].sort((a, b) => Number(a) - Number(b));
    if (field.length !== 512 || hsids.length !== 1024) throw new Error('Incomplete production field');
    const weeks = Math.min(34, Math.floor((Date.parse(addDays(day, 1)) - Date.parse(season.opening_day)) / (7 * 86400000)) + 1);
    const periods = newsletterPeriods(day);
    const { rows: ready } = await pool.query<ReadyPeriod>(
      `SELECT cadence,period_start::text,period_end::text,season_key,cutoff_at::text FROM public.edition_ready
       WHERE (cadence='daily' AND period_start=$1::date) OR (cadence='weekly' AND period_start=$2::date)`,
      [day, periods.find(period => period.cadence === 'weekly')?.date || null]);
    const reportWeek = Math.floor((Date.parse(day) - Date.parse(season.opening_day)) / (7 * 86400000)) + 1;
    const { rows: [boundary] } = await pool.query<{ cutoff_writes: number; missing_boundary: number }>(
      `SELECT count(*) FILTER(WHERE computed_at=$2::timestamptz)::int AS cutoff_writes,
        count(*) FILTER(WHERE week=$3 AND home_hsid IS NOT NULL AND away_hsid IS NOT NULL
          AND stage IN ('bracket','total_runs','season_championship','world_series')
          AND computed_at IS DISTINCT FROM $2::timestamptz)::int AS missing_boundary
       FROM public.master_bracket WHERE season_key=$1`, [seasonKey, cutoffAt, reportWeek]);
    const resume = rehearsalResumeMode({ day, cutoffAt, season: seasonKey, branch: expectedBranch,
      periods, ready, checkpoint: previous, cutoffWrites: Number(boundary.cutoff_writes), missingBoundary: Number(boundary.missing_boundary) });
    if (resume !== 'ingest') {
      const saved = previous?.source_snapshot;
      if (!saved?.live || saved.branch !== expectedBranch || saved.endpoint !== endpoint || saved.start !== season.opening_day
          || saved.fieldHash !== digest(field) || previous.evidence.fieldHash !== saved.fieldHash
          || saved.commit !== previous.evidence.commit || previous.evidence.reportDate !== day
          || Date.parse(String(previous.evidence.cutoffAt)) !== Date.parse(cutoffAt)
          || previous.evidence.sourceHash !== digest(saved.live) || !previous.evidence.ingestion) {
        throw new Error('The persisted cutoff lacks matching historical source and ingestion evidence');
      }
      if (previous.stored_results && previous.evidence.storedHash !== digest(previous.stored_results)) {
        throw new Error('The saved rehearsal result snapshot differs from its hash');
      }
    }
    const evidence: Record<string, unknown> = resume === 'ingest' ? {
      branch: expectedBranch, endpoint, commit, codeHash, sourceHashes,
      productionCommit, parityHashes, fieldHash: digest(field), reportDate: day, cutoffAt,
      sourceDifference: 'Authentic historical provider schedule and boxscore responses enter the same production ingestion workers and database landing triggers. Future provider result records are omitted; original intraday arrival/revision timing and future schedule visibility are not reconstructed.',
      delivery: 'review copy; email approval gate unchanged', publications: [],
    } : { ...previous!.evidence, resumedWith: { mode: resume, commit, codeHash } };
    const passes: unknown[] = resume === 'ingest' ? [] : Array.isArray(evidence.passes) ? [...evidence.passes] : [];
    if (resume !== 'ingest') writeFileSync(sourceFile, gzipSync(JSON.stringify(previous!.source_snapshot)));
    const publication = await runRehearsalStages(resume, {
      ingest: async () => {
        const { rows: recipients } = await pool.query(`SELECT r.firebase_uid,count(f.firebase_uid)::int AS favorites,
          count(f.firebase_uid) FILTER(WHERE coalesce(to_jsonb(f)->>'yatid','') !~ '^YAT[0-9]+$')::int AS invalid
          FROM newsletter_recipients r LEFT JOIN newsletter_favorites f ON f.firebase_uid=r.firebase_uid
          WHERE lower(r.email)=lower($1) GROUP BY r.firebase_uid`, [email]);
        if (recipients.length !== 1 || recipients[0].invalid) throw new Error('The review recipient and every favorite must resolve through the existing canonical YAT view before scoring');
        for (const table of ['player_game_logs', 'stat_lines', 'team_schedules']) {
          const { rows: [later] } = await pool.query('SELECT count(*)::int AS n FROM public.' + table + ' WHERE game_date>$1::date', [day]);
          if (later.n) throw new Error('Future historical inputs remain in ' + table + '; prepare the isolated source tables first');
        }
        const { rows: [errorStart] } = await pool.query('SELECT coalesce(max(id),0)::text AS id FROM public.stat_line_load_errors');
        await pool.query(`INSERT INTO bracket_rehearsal_days(season_key,report_date,branch_id,effective_at,phase,evidence,source_snapshot)
          VALUES($1,$2,$3,$4,'ingesting',$5::jsonb,'{}'::jsonb) ON CONFLICT(season_key,report_date) DO NOTHING`,
          [seasonKey, day, expectedBranch, cutoffAt, JSON.stringify(evidence)]);
        const { rows: captures } = await pool.query<{ record: HistoricalMlbRecord }>(
          'SELECT record FROM bracket_rehearsal_provider_inputs WHERE season_key=$1 AND report_date=$2 ORDER BY source_url', [seasonKey, day]);
        const provider = createHistoricalMlbSource({ reportDate: day, previous: captures.map(row => row.record), save: async record => {
          await pool.query(`INSERT INTO bracket_rehearsal_provider_inputs(season_key,report_date,source_url,provider_hash,replay_hash,record)
            VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`, [seasonKey, day, record.url, record.providerHash, record.replayHash, JSON.stringify(record)]);
          const { rows: [stored] } = await pool.query('SELECT record FROM bracket_rehearsal_provider_inputs WHERE season_key=$1 AND report_date=$2 AND source_url=$3 AND provider_hash=$4 AND replay_hash=$5', [seasonKey, day, record.url, record.providerHash, record.replayHash]);
          if (stored?.record?.providerHash !== record.providerHash || stored.record.replayHash !== record.replayHash) throw new Error('Provider archive differs from replay input');
        } });
        const ingestAt = addDays(day, 1) + 'T06:59:59.000Z'; // 11:59:59 p.m. Arizona on the reporting day.
        const schedule = await runLiveScheduleRefresh(pool, { request: provider.request, effectiveAt: ingestAt });
        if ('skipped' in schedule && schedule.skipped) throw new Error('Production schedule polling gate skipped this replay: ' + schedule.reason);
        if ('warnings' in schedule && schedule.warnings?.length) throw new Error('Incomplete schedule ingestion: ' + schedule.warnings.join('; '));
        const gameLogs = await runMlbLiveGameLogs(pool, { request: provider.request, effectiveAt: ingestAt });
        if (gameLogs.warnings.length) throw new Error('Incomplete player-log ingestion: ' + gameLogs.warnings.join('; '));
        // Pete: every MLB-organization game of 2026 counts (MLB to ROOKIE). The
        // live worker replays MLB (sportId 1); in production the minor-league
        // lines arrive from the 4-hourly per-player sync. Replay that day's
        // downloaded minor-league lines through the same table and landing triggers.
        const minorLeague = await pool.query(`INSERT INTO public.player_game_logs
            SELECT a.* FROM rehearsal_source_archive.player_game_logs a
             WHERE a.game_date = $1::date AND a.raw_payload->'sport'->>'abbreviation' = ANY($2::text[])
               AND NOT EXISTS (SELECT 1 FROM public.player_game_logs p WHERE p.id = a.id)
            ON CONFLICT DO NOTHING`, [day, ['AAA', 'AA', 'A+', 'A', 'ROK']]);
        const minorLeagueLines = minorLeague.rowCount ?? 0;
        const { rows: [landing] } = await pool.query(`SELECT count(*)::int AS logs,
          count(*) FILTER(WHERE s.id IS NOT NULL)::int AS landed,
          count(*) FILTER(WHERE s.hold_reason IS NOT NULL)::int AS held,
          count(*) FILTER(WHERE l.yatid IS NULL)::int AS unresolved
          FROM player_game_logs l LEFT JOIN stat_lines s ON s.source=l.source AND s.source_line_id=l.id::text
          WHERE l.game_date=$1::date`, [day]);
        const { rows: [errors] } = await pool.query('SELECT count(*)::int AS n FROM stat_line_load_errors WHERE id>$1::bigint', [errorStart.id]);
        evidence.ingestion = { ingestAt, schedule, gameLogs, minorLeagueLines, landing, newLandingErrors: errors.n,
          providerRecords: [...provider.records].sort((a,b) => a.url.localeCompare(b.url) || a.providerHash.localeCompare(b.providerHash)).map(({ url, providerHash, replayHash, omittedFutureDates, omittedFutureGameIds }) => ({ url, providerHash, replayHash, omittedFutureDates, omittedFutureGameIds })) };
        await pool.query("UPDATE bracket_rehearsal_days SET evidence=$3::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(evidence)]);
        if (errors.n || landing.logs !== landing.landed || landing.unresolved) throw new Error('Production stat landing is incomplete; inspect the saved ingestion evidence');
        let batch = 0;
        const live = await fetchBracketLiveBatches(base, season.opening_day, weeks, hsids, async (...args) => {
          const response = await fetch(...args);
          console.log(JSON.stringify({ phase: 'capture', batch: ++batch, schools: Math.min(batch * 64, 1024), status: response.status }));
          return response;
        });
        const snapshot: Snapshot = { start: season.opening_day, weeks, capturedAt: new Date().toISOString(), sourceBase: base, branch: expectedBranch, endpoint, commit, fieldHash: digest(field), live };
        const lastDay = Math.round((Date.parse(day) - Date.parse(season.opening_day)) / 86400000);
        if (live.lines.some(line => line[2] > lastDay) || Object.values(live.clubs).some(games => games.some(game => game[0] > lastDay))) {
          throw new Error('The normal input reader returned a future result; stop before scoring');
        }
        evidence.sourceHash = digest(live);
        writeFileSync(sourceFile, gzipSync(JSON.stringify(snapshot)));
        await pool.query("UPDATE bracket_rehearsal_days SET phase='running',source_snapshot=$3::jsonb,evidence=$4::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(snapshot), JSON.stringify(evidence)]);
      },
      prelock: async () => {
        // Real HTTP input reads and the same landing/team checks as the scheduled
        // production job. The shared newsletter boundary performs the 4 a.m. run.
        const prelock = await runBracketResultsJob(pool, { seasonKey, asof: day, base, withBox: true, effectiveAt: addDays(day, 1) + 'T10:59:59Z' });
        passes.push(prelock);
        if (prelock.seasons.some(s => s.passes.some(pass => pass.decisions.length))) throw new Error('Production writer reported a decision; the day remains paused');
      },
      publish: () => publishNewsletterDay(pool, { day, season: seasonKey, base,
        expectedBranch, expectedEndpoint, publicationTarget: 'isolated', historicalReplay: true },
        resume === 'published' ? async () => { throw new Error('A published day cannot reread or rescore historical inputs'); } : runBracketResultsJob),
    });
    if (publication.scoring) passes.push(publication.scoring);
    const { rows: stored } = await pool.query(`SELECT stage,region,round,series_no,game_no,game_id,week,home_hsid,away_hsid,
      status,innings,home_runs,away_runs,winner_hsid,decided_by,computed_at::text,locked_at::text,box
      FROM master_bracket WHERE season_key=$1 AND computed_at IS NOT NULL ORDER BY stage,region,round,series_no,game_no`, [seasonKey]);
    if (resume === 'published' && previous?.stored_results && digest(stored) !== previous.evidence.storedHash) {
      throw new Error('Published bracket results differ from the immutable result checkpoint');
    }
    evidence.passes = passes; evidence.storedHash = digest(stored); evidence.storedGames = stored.length;
    if (previous?.report_date !== day || previous.phase !== 'awaiting_review') {
      await pool.query("UPDATE bracket_rehearsal_days SET phase='scored',evidence=$3::jsonb,stored_results=$4::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(evidence), JSON.stringify(stored)]);
    }
    writeFileSync(folder + '/stored-results.json.gz', gzipSync(JSON.stringify(stored)));
    const publications = [];
    for (const period of periods) {
      const { rows: [archived] } = await pool.query<{
        facts: FinishedEdition; content_hash: string; subject: string; html: string; plain_text: string;
      }>('SELECT facts,content_hash,subject,html,plain_text FROM bracket_rehearsal_editions WHERE season_key=$1 AND cadence=$2 AND period_start=$3 AND recipient_email=$4',
        [seasonKey, period.cadence, period.date, email]);
      let rendered;
      if (archived) {
        // The recipient's original picks and links are facts of this copy too.
        rendered = renderFinishedEdition(archived.facts);
        if (rendered.hashes.content !== archived.content_hash || rendered.html !== archived.html
            || rendered.text !== archived.plain_text || rendered.subject !== archived.subject) {
          throw new Error('Archived review bytes differ; preserve the original copy and inspect its renderer version');
        }
      } else {
        const { rows: [recipient] } = await pool.query('SELECT home_hsid FROM newsletter_recipients WHERE lower(email)=lower($1)', [email]);
        const homeUrl = new URL('/' + recipient.home_hsid, publicBase);
        homeUrl.hash = 'sec-fantasy';
        rendered = await readNewsletterReview(pool, { cadence: period.cadence, date: period.date, email, seasonKey, baseUrl: homeUrl.toString() });
      }
      const hash = rendered.hashes.content;
      await pool.query(`INSERT INTO bracket_rehearsal_editions(season_key,cadence,period_start,recipient_email,subject,html,plain_text,facts,content_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT DO NOTHING`,
        [seasonKey, period.cadence, period.date, email, rendered.subject, rendered.html, rendered.text, JSON.stringify(rendered.facts), hash]);
      const { rows: [saved] } = await pool.query('SELECT content_hash FROM bracket_rehearsal_editions WHERE season_key=$1 AND cadence=$2 AND period_start=$3 AND recipient_email=$4', [seasonKey, period.cadence, period.date, email]);
      if (saved?.content_hash !== hash) throw new Error('Archived edition differs; leave the immutable review copy intact');
      writeFileSync(folder + '/' + period.cadence + '.html', rendered.html);
      writeFileSync(folder + '/' + period.cadence + '.txt', rendered.text);
      writeFileSync(folder + '/' + period.cadence + '-facts.json', JSON.stringify(rendered.facts, null, 2));
      writeFileSync(folder + '/' + period.cadence + '-manifest.json', JSON.stringify({ hashes: rendered.hashes, rowKeys: rendered.rowKeys, layoutVersion: rendered.layoutVersion, notes: rendered.notes }, null, 2));
      publications.push({ ...period, subject: rendered.subject, contentHash: hash, layoutVersion: rendered.layoutVersion, delivery: 'review-copy-only' });
    }
    evidence.publications = publications;
    evidence.publisher = publication.publications;
    await pool.query("UPDATE bracket_rehearsal_days SET phase='awaiting_review',evidence=$3::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(evidence)]);
    writeFileSync(folder + '/checkpoint.json', JSON.stringify({ phase: 'awaiting_review', ...evidence }, null, 2));
    console.log(JSON.stringify({ phase: 'awaiting_review', day, cutoffAt, storedGames: stored.length, publications }));
  } finally {
    try { await releaseCheckpoint?.(); } finally { await pool.end(); }
  }
}
if (/rehearse-production-bracket\.ts$/.test(process.argv[1] || '')) {
  main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
