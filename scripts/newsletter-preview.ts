// TEST-ONLY connection guard and local archive around the recovered pure
// newsletter reader. No sender, database writes, scoring or automatic advance.
// --date YYYY-MM-DD --email existing@address --out /tmp/proof
// --connection-file /secure/connection.json --expected-branch br-...
// --expected-endpoint ep-....neon.tech [--cadence weekly] [--season 2027]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { readFinishedEdition, renderFinishedEdition, stableJson, type Cadence, type RenderedEdition } from '../src/lib/newsletter/finishedPublication';

type Args = Record<string, string>;
export function previewArguments(argv: string[]): Args {
  const allowed = new Set(['date', 'email', 'out', 'connection-file', 'expected-branch', 'expected-endpoint', 'cadence', 'season', 'region', 'base-url']);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, ''), value = argv[i + 1];
    if (!argv[i].startsWith('--') || !allowed.has(name) || !value || value.startsWith('--') || name in args) throw new Error('Unsupported or incomplete preview argument: ' + argv[i]);
    args[name] = value;
  }
  for (const required of ['date', 'email', 'out', 'expected-branch', 'expected-endpoint']) if (!args[required]) throw new Error('Required preview argument: --' + required);
  if (args.cadence && !['daily', 'weekly'].includes(args.cadence)) throw new Error('Cadence must be daily or weekly');
  if (args.region && !/^[1-9]\d*$/.test(args.region)) throw new Error('Region must be a positive integer');
  return args;
}
export function isolatedPreviewTarget(args: Args, env: { DATABASE_URL?: string; REHEARSAL_NEON_BRANCH?: string }) {
  const config = args['connection-file'] ? JSON.parse(readFileSync(args['connection-file'], 'utf8')) : {};
  const connectionString = config.DATABASE_URL || env.DATABASE_URL;
  const branch = config.branch_id || env.REHEARSAL_NEON_BRANCH;
  if (!connectionString || branch !== args['expected-branch'] || !branch?.startsWith('br-') || branch === 'br-polished-lab-a4i35u5j') throw new Error('An explicitly verified isolated database branch is required');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== args['expected-endpoint']) throw new Error('Connection endpoint differs from the verified isolated target');
  return { connectionString, branch, endpoint: url.hostname };
}
/** Exact immutable local proof; repeat succeeds only when every byte matches. */
export function archiveFinishedEdition(out: string, edition: RenderedEdition, target?: { branch: string; endpoint: string }) {
  const emailPart = String(edition.facts.recipient.email).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const folder = join(resolve(out), edition.facts.ready.cadence, edition.facts.ready.period_start, emailPart);
  const manifest = {
    stage: 'review-copy-not-sent', layoutVersion: edition.layoutVersion, target: target || null,
    recipient: edition.facts.recipient, ready: edition.facts.ready, control: edition.facts.control,
    selection: edition.facts.selection, rowKeys: edition.rowKeys, hashes: edition.hashes, notes: edition.notes,
    files: { html: 'index.html', text: 'edition.txt', facts: 'facts.json', subject: 'subject.txt' },
  };
  const files = { 'index.html': edition.html, 'edition.txt': edition.text, 'facts.json': stableJson(edition.facts) + '\n',
    'subject.txt': edition.subject, 'manifest.json': stableJson(manifest) + '\n' };
  // Check all conflicts before creating any new file.
  for (const [name, content] of Object.entries(files)) if (existsSync(join(folder, name)) && readFileSync(join(folder, name), 'utf8') !== content) throw new Error('An immutable review copy already exists with different content: ' + name);
  mkdirSync(folder, { recursive: true });
  for (const [name, content] of Object.entries(files)) if (!existsSync(join(folder, name))) writeFileSync(join(folder, name), content, { flag: 'wx', mode: 0o600 });
  return { folder, manifest };
}
async function main() {
  const args = previewArguments(process.argv.slice(2));
  const target = isolatedPreviewTarget(args, {
    DATABASE_URL: process.env.DATABASE_URL,
    REHEARSAL_NEON_BRANCH: process.env.REHEARSAL_NEON_BRANCH,
  });
  const db = new Client({ connectionString: target.connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity = (await db.query("SELECT current_setting('neon.endpoint_id', true) AS endpoint")).rows[0]?.endpoint;
    if (identity !== target.endpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Connected Neon endpoint differs from the verified isolated target');
    const facts = await readFinishedEdition(db, { cadence: (args.cadence || 'daily') as Cadence, date: args.date,
      email: args.email, seasonKey: args.season || '2027', region: args.region ? Number(args.region) : undefined });
    await db.query('COMMIT');
    const edition = renderFinishedEdition(facts, { baseUrl: args['base-url'] });
    const result = archiveFinishedEdition(args.out, edition, target);
    console.log(JSON.stringify({ stage: 'review-copy-not-sent', folder: result.folder, hashes: edition.hashes, layoutVersion: edition.layoutVersion }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
if (/newsletter-preview\.ts$/.test(process.argv[1] || '')) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
