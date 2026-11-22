// TEST-ONLY: one day per invocation, followed by a stored Digest and a pause.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { runSeason, SQL_SEASONS, type Season } from './master-bracket-results';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import { addDays, recordedRequest, normalizedSource, validateRehearsalDay, publicationRequests, type Snapshot } from './rehearsal-day';
import { publishDaily, publishWeekly } from './newsletter-publish';
import { readFinishedEdition, renderFinishedEdition, stableJson } from '@/lib/newsletter/finishedPublication';

export { recordedRequest } from './rehearsal-day';
const arg = (name: string, fallback = '') => {
  const at = process.argv.indexOf('--' + name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const digest = (value: unknown) => createHash('sha256').update(stableJson(JSON.parse(JSON.stringify(value)))).digest('hex');
const PRODUCTION_BRANCH = 'br-polished-lab-a4i35u5j';

async function main() {
  if (['--from', '--through', '--cadence'].some(x => process.argv.includes(x))) throw new Error('Bulk rehearsal is disabled. Supply one --day and stop for its Digest review.');
  const day = arg('day');
  validateRehearsalDay(day, { report_date: day, phase: '' });
  const config = JSON.parse(readFileSync(arg('connection-file'), 'utf8'));
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
  const sourceHashes = Object.fromEntries([
    'scripts/rehearse-production-bracket.ts', 'scripts/rehearsal-day.ts', 'scripts/master-bracket-results.ts',
    'scripts/newsletter-publish.ts', 'src/lib/bracket/storedPublication.ts', 'src/lib/newsletter/finishedPublication.ts',
    'src/components/bracket/liveSeason.ts', 'src/lib/bracket/engine.ts', 'src/lib/bracket/fetchLiveBatches.ts',
    'src/lib/bracket/preparedIndex.ts', 'src/app/api/bracket/live/route.ts', 'src/lib/bracket/scheduleAuthority.ts',
    'src/app/api/bracket/prepared/route.ts', 'src/lib/bracket/rehearsalClock.ts',
    'src/components/bracket/preparedSeason.ts', 'src/components/bracket/simulationState.ts',
  ].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  const codeHash = digest(sourceHashes), cutoffAt = addDays(day, 1) + 'T11:00:00Z';
  const pool = new Pool({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    const { rows: [identity] } = await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
    if (identity?.endpoint !== endpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Actual Neon endpoint differs from the verified target');
    const { rows: [season] } = await pool.query<Season>(SQL_SEASONS, [seasonKey, day]);
    if (!season || season.is_test || season.opening_day !== '2026-03-23' || season.last_day !== '2026-11-15' || season.weeks !== 34 || season.regions !== 8 || season.schools_per_region !== 128) throw new Error('The isolated season must retain production dimensions/rules and the agreed March 23–November 15 calendar');
    const { rows: recipients } = await pool.query(`SELECT r.firebase_uid,count(f.firebase_uid)::int AS favorites,
      count(f.firebase_uid) FILTER(WHERE coalesce(to_jsonb(f)->>'yatid','') !~ '^YAT[0-9]+$')::int AS invalid
      FROM newsletter_recipients r LEFT JOIN newsletter_favorites f ON f.firebase_uid=r.firebase_uid
      WHERE lower(r.email)=lower($1) GROUP BY r.firebase_uid`, [email]);
    if (recipients.length !== 1 || recipients[0].invalid) throw new Error('The review recipient and every favorite must resolve through the existing canonical YAT view before scoring');
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
    const { rows: [previous] } = await pool.query('SELECT report_date::text,phase,evidence,source_snapshot FROM bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date DESC LIMIT 1', [seasonKey]);
    validateRehearsalDay(day, previous, arg('reviewed-day'));
    if (previous?.report_date === day && previous.phase === 'awaiting_review') {
      console.log(JSON.stringify({ phase: 'awaiting_review', day, cutoffAt, evidence: previous.evidence, repeated: true }));
      return;
    }
    const { rows: field } = await pool.query("SELECT region,series_no,home_hsid,away_hsid,home_seed,away_seed FROM master_bracket WHERE season_key=$1 AND stage='bracket' AND round=1 AND game_no=1 ORDER BY region,series_no", [seasonKey]);
    const hsids = [...new Set(field.flatMap(r => [String(r.home_hsid), String(r.away_hsid)]))].sort((a, b) => Number(a) - Number(b));
    if (field.length !== 512 || hsids.length !== 1024) throw new Error('Incomplete production field');
    const weeks = Math.min(34, Math.floor((Date.parse(addDays(day, 1)) - Date.parse(season.opening_day)) / (7 * 86400000)) + 1);
    let snapshot: Snapshot;
    if (previous?.report_date === day) snapshot = previous.source_snapshot;
    else if (existsSync(sourceFile)) snapshot = JSON.parse(gunzipSync(readFileSync(sourceFile)).toString('utf8'));
    else {
      let batch = 0;
      const live = await fetchBracketLiveBatches(base, season.opening_day, weeks, hsids, async (...args) => {
        const response = await fetch(...args);
        console.log(JSON.stringify({ phase: 'capture', batch: ++batch, schools: Math.min(batch * 64, 1024), status: response.status }));
        return response;
      });
      snapshot = { start: season.opening_day, weeks, capturedAt: new Date().toISOString(), sourceBase: base, branch: expectedBranch, endpoint, commit, fieldHash: digest(field), live };
    }
    if (snapshot.branch !== expectedBranch || snapshot.endpoint !== endpoint || snapshot.fieldHash !== digest(field) || snapshot.start !== season.opening_day || snapshot.weeks !== weeks) throw new Error('Source recording belongs to a different checkpoint');
    writeFileSync(sourceFile, gzipSync(JSON.stringify(snapshot)));
    // Compare the original recording with the real production raw-input route.
    if (previous?.report_date !== day) {
      const direct = await fetchBracketLiveBatches(base, season.opening_day, weeks, hsids.slice(0, 64));
      const recorded = await fetchBracketLiveBatches(base, season.opening_day, weeks, hsids.slice(0, 64), recordedRequest(snapshot));
      if (digest(normalizedSource(direct)) !== digest(normalizedSource(recorded))) throw new Error('Recorded source differs from production route');
    }
    const request = recordedRequest(snapshot, day), sourceHash = digest(snapshot.live);
    const masked = await fetchBracketLiveBatches(base, season.opening_day, weeks, hsids, request);
    const evidence: Record<string, unknown> = { branch: expectedBranch, endpoint, commit, codeHash, sourceHashes, sourceHash,
      effectiveInputHash: digest(masked), fieldHash: snapshot.fieldHash, reportDate: day, cutoffAt,
      sourceDifference: 'Existing historical statistics available at capture time, selected through the report date; future results hidden. Original ingestion-time revisions are not reconstructed.',
      delivery: 'review copy; email approval gate unchanged', publications: [] };
    await pool.query(`INSERT INTO bracket_rehearsal_days(season_key,report_date,branch_id,effective_at,phase,evidence,source_snapshot)
      VALUES($1,$2,$3,$4,'running',$5::jsonb,$6::jsonb) ON CONFLICT(season_key,report_date) DO NOTHING`,
      [seasonKey, day, expectedBranch, cutoffAt, JSON.stringify(evidence), JSON.stringify(snapshot)]);
    const passes = [];
    // Close the reported day, then exercise the real 4 a.m. boundary. The
    // second call cannot see any next-day historical statistics.
    for (const [asof, effectiveAt] of [[day, addDays(day, 1) + 'T10:59:59Z'], [addDays(day, 1), cutoffAt]]) {
      const result = await runSeason(pool, season, asof, { base, withBox: true, effectiveAt, request });
      passes.push({ asof, effectiveAt, passes: result });
      console.log(JSON.stringify({ phase: 'scored', asof, effectiveAt, passes: result }));
      if (result.some(pass => pass.decisions.length)) throw new Error('Production writer reported a decision; the day remains paused');
    }
    const { rows: stored } = await pool.query(`SELECT stage,region,round,series_no,game_no,game_id,week,home_hsid,away_hsid,
      status,innings,home_runs,away_runs,winner_hsid,decided_by,computed_at::text,locked_at::text,box
      FROM master_bracket WHERE season_key=$1 AND computed_at IS NOT NULL ORDER BY stage,region,round,series_no,game_no`, [seasonKey]);
    evidence.passes = passes; evidence.storedHash = digest(stored); evidence.storedGames = stored.length;
    await pool.query("UPDATE bracket_rehearsal_days SET phase='scored',evidence=$3::jsonb,stored_results=$4::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(evidence), JSON.stringify(stored)]);
    writeFileSync(folder + '/stored-results.json.gz', gzipSync(JSON.stringify(stored)));
    const publisherOptions = { season: seasonKey, cutoffAt, expectedBranch, expectedEndpoint, historicalReplay: true as const };
    const publicationReports = [];
    const periods: { cadence: 'daily' | 'weekly'; date: string }[] = [];
    for (const period of publicationRequests(day)) {
      if (period.cadence === 'daily') {
        publicationReports.push(await publishDaily(pool, { ...publisherOptions, date: period.date }));
        periods.push({ cadence: 'daily', date: period.date });
      } else {
        publicationReports.push(await publishWeekly(pool, { ...publisherOptions, periodStart: period.periodStart }));
        periods.push({ cadence: 'weekly', date: period.periodStart });
      }
    }
    const publications = [];
    for (const period of periods) {
      const facts = await readFinishedEdition(pool, { cadence: period.cadence, date: period.date, email, seasonKey });
      const homeUrl = new URL('/' + facts.recipient.home_hsid, publicBase);
      homeUrl.hash = 'sec-fantasy';
      const rendered = renderFinishedEdition(facts, { baseUrl: homeUrl.toString() });
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
    evidence.publisher = publicationReports;
    await pool.query("UPDATE bracket_rehearsal_days SET phase='awaiting_review',evidence=$3::jsonb,updated_at=now() WHERE season_key=$1 AND report_date=$2", [seasonKey, day, JSON.stringify(evidence)]);
    writeFileSync(folder + '/checkpoint.json', JSON.stringify({ phase: 'awaiting_review', ...evidence }, null, 2));
    console.log(JSON.stringify({ phase: 'awaiting_review', day, cutoffAt, storedGames: stored.length, publications }));
  } finally { await pool.end(); }
}
if (/rehearse-production-bracket\.ts$/.test(process.argv[1] || '')) {
  main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
