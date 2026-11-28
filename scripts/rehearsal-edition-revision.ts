// TEST-ONLY: append a corrected Daily Digest layout from archived facts.
// This command cannot score, publish source statistics, advance a day or send mail.
// --connection-file /secure/db.json --expected-branch br-... --expected-endpoint ep-...
// --day YYYY-MM-DD --email existing@address --parent-hash <original content SHA-256>
// --out /tmp/review [--season 2027] [--presentation-file /tmp/presentation.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { renderFinishedEdition, stableJson, type FinishedEdition, type RenderedEdition, type ReadDatabase } from '../src/lib/newsletter/finishedPublication';
import { archiveFinishedEdition, isolatedPreviewTarget } from './newsletter-preview';

type Args = Record<string, string>;
export type RevisionOptions = {
  season: string; day: string; email: string; parentHash: string;
  expectedBranch: string; expectedEndpoint: string;
  presentation?: Record<string, unknown>;
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const coreFacts = (facts: FinishedEdition) => {
  const { presentation: _presentation, ...core } = facts;
  return stableJson(core);
};

export function revisionArguments(argv: string[]): Args {
  const allowed = new Set(['connection-file', 'expected-branch', 'expected-endpoint', 'day', 'email', 'parent-hash', 'out', 'season', 'presentation-file']);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, ''), value = argv[i + 1];
    if (!argv[i].startsWith('--') || !allowed.has(name) || !value || value.startsWith('--') || name in args) throw new Error('Unsupported or incomplete revision argument: ' + argv[i]);
    args[name] = value;
  }
  for (const name of ['connection-file', 'expected-branch', 'expected-endpoint', 'day', 'email', 'parent-hash', 'out']) {
    if (!args[name]) throw new Error('Required revision argument: --' + name);
  }
  return args;
}

function validateOptions(opts: RevisionOptions) {
  if (!opts.expectedBranch?.startsWith('br-') || opts.expectedBranch === 'br-polished-lab-a4i35u5j' || process.env.VERCEL_ENV === 'production') throw new Error('A verified isolated database branch is required');
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+$/.test(opts.expectedEndpoint) || opts.expectedEndpoint.split('.')[0].endsWith('-pooler')) throw new Error('An explicitly verified direct Neon endpoint is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.day) || !Number.isFinite(Date.parse(opts.day + 'T00:00:00Z')) || new Date(opts.day + 'T00:00:00Z').toISOString().slice(0, 10) !== opts.day) throw new Error('A valid explicit report day is required');
  if (!opts.season || !opts.email.trim() || !/^[a-f0-9]{64}$/.test(opts.parentHash)) throw new Error('Season, recipient and original content hash are required');
  if (opts.presentation !== undefined && (!opts.presentation || typeof opts.presentation !== 'object' || Array.isArray(opts.presentation))) throw new Error('Presentation context must be a JSON object');
}

function verifyRendered(source: FinishedEdition, rendered: RenderedEdition) {
  if (coreFacts(source) !== coreFacts(rendered.facts)) throw new Error('A layout revision cannot change archived facts');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(rendered.layoutVersion)) throw new Error('Invalid layout version');
  const expected = {
    facts: sha(stableJson(rendered.facts)), subject: sha(rendered.subject),
    html: sha(rendered.html), text: sha(rendered.text), content: '',
  };
  expected.content = sha(stableJson({ facts: expected.facts, subject: expected.subject, html: expected.html, text: expected.text, layout: rendered.layoutVersion }));
  if (stableJson(rendered.hashes) !== stableJson(expected)) throw new Error('Rendered revision hashes do not match its bytes');
}

/** Only the append-only layout archive is written; original facts stay intact. */
export async function reviseRehearsalEdition(
  db: ReadDatabase, opts: RevisionOptions,
  render: (facts: FinishedEdition) => RenderedEdition = renderFinishedEdition,
) {
  validateOptions(opts);
  await db.query('BEGIN');
  try {
    const identity = (await db.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint")).rows[0]?.endpoint;
    if (identity !== opts.expectedEndpoint.split('.')[0]) throw new Error('Connected Neon endpoint differs from the verified target');
    const checkpoint = (await db.query(`SELECT report_date::text,phase FROM public.bracket_rehearsal_days
      WHERE season_key=$1 ORDER BY report_date DESC LIMIT 1 FOR SHARE`, [opts.season])).rows[0];
    if (checkpoint?.report_date !== opts.day || checkpoint.phase !== 'awaiting_review') throw new Error('Revise only the current paused report day');
    const email = opts.email.trim().toLowerCase();
    const originalRows = (await db.query(`SELECT recipient_email,content_hash,facts FROM public.bracket_rehearsal_editions
      WHERE season_key=$1 AND cadence='daily' AND period_start=$2 AND lower(recipient_email)=$3 FOR UPDATE`, [opts.season, opts.day, email])).rows;
    if (originalRows.length !== 1 || originalRows[0].content_hash !== opts.parentHash) throw new Error('Original archived edition differs from the expected parent');
    const storedEmail = originalRows[0].recipient_email;
    const source: FinishedEdition = clone(originalRows[0].facts);
    if (source.ready.cadence !== 'daily' || source.ready.period_start !== opts.day || source.selection.seasonKey !== opts.season || source.recipient.email.toLowerCase() !== email) throw new Error('Archived facts do not match the selected edition');
    const input = clone(source);
    if (opts.presentation !== undefined) input.presentation = { ...input.presentation, ...clone(opts.presentation) } as FinishedEdition['presentation'];
    const rendered = render(input);
    verifyRendered(source, rendered);
    const sourceFactsHash = sha(stableJson(source));
    await db.query(`CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_edition_revisions (
      season_key text NOT NULL,cadence text NOT NULL,period_start date NOT NULL,recipient_email text NOT NULL,
      parent_content_hash text NOT NULL,source_facts_hash text NOT NULL,layout_version text NOT NULL,
      subject text NOT NULL,html text NOT NULL,plain_text text NOT NULL,facts jsonb NOT NULL,content_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(season_key,cadence,period_start,recipient_email,content_hash),
      FOREIGN KEY(season_key,cadence,period_start,recipient_email)
        REFERENCES public.bracket_rehearsal_editions(season_key,cadence,period_start,recipient_email))`);
    const inserted = (await db.query(`INSERT INTO public.bracket_rehearsal_edition_revisions
      (season_key,cadence,period_start,recipient_email,parent_content_hash,source_facts_hash,layout_version,subject,html,plain_text,facts,content_hash)
      VALUES($1,'daily',$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      ON CONFLICT DO NOTHING RETURNING content_hash`, [opts.season, opts.day, storedEmail, opts.parentHash, sourceFactsHash,
      rendered.layoutVersion, rendered.subject, rendered.html, rendered.text, JSON.stringify(rendered.facts), rendered.hashes.content])).rows.length > 0;
    const saved = (await db.query(`SELECT parent_content_hash,source_facts_hash,layout_version,subject,html,plain_text,facts,content_hash
      FROM public.bracket_rehearsal_edition_revisions WHERE season_key=$1 AND cadence='daily' AND period_start=$2 AND recipient_email=$3 AND content_hash=$4`,
      [opts.season, opts.day, storedEmail, rendered.hashes.content])).rows[0];
    const expected = { parent_content_hash: opts.parentHash, source_facts_hash: sourceFactsHash, layout_version: rendered.layoutVersion,
      subject: rendered.subject, html: rendered.html, plain_text: rendered.text, facts: rendered.facts, content_hash: rendered.hashes.content };
    if (!saved || stableJson(saved) !== stableJson(expected)) throw new Error('Saved layout revision differs from the rendered bytes');
    await db.query('COMMIT');
    return { rendered, created: inserted, parentHash: opts.parentHash, sourceFactsHash };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const args = revisionArguments(process.argv.slice(2));
  const target = isolatedPreviewTarget(args, {});
  const opts: RevisionOptions = {
    season: args.season || '2027', day: args.day, email: args.email, parentHash: args['parent-hash'],
    expectedBranch: target.branch, expectedEndpoint: target.endpoint,
    ...(args['presentation-file'] ? { presentation: JSON.parse(readFileSync(args['presentation-file'], 'utf8')) } : {}),
  };
  validateOptions(opts);
  const db = new Client({ connectionString: target.connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const result = await reviseRehearsalEdition(db, opts);
    const archived = archiveFinishedEdition(join(args.out, 'revisions', result.rendered.layoutVersion, result.rendered.hashes.content), result.rendered, target);
    console.log(JSON.stringify({ phase: 'awaiting_review', day: opts.day, created: result.created, parentHash: result.parentHash,
      sourceFactsHash: result.sourceFactsHash, hashes: result.rendered.hashes, layoutVersion: result.rendered.layoutVersion, folder: archived.folder, delivery: 'review-copy-only' }));
  } finally { await db.end(); }
}
if (/rehearsal-edition-revision\.ts$/.test(process.argv[1] || '')) main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
});
