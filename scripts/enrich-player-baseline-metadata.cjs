#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI uses the installed TypeScript compiler. */
/**
 * Inspect missing player metadata by default; --apply is the only write mode.
 * Examples:
 *   node scripts/enrich-player-baseline-metadata.cjs --report /tmp/player-metadata.json
 *   node scripts/enrich-player-baseline-metadata.cjs --playerids 123,456 --apply --report /tmp/player-metadata.json
 *   node scripts/enrich-player-baseline-metadata.cjs --print-sql
 *
 * Set DATABASE_URL to the intended database branch. No schema migration or
 * destructive refresh function is required. Test on an isolated branch first.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourceFile = path.resolve(__dirname, '../src/lib/playerMetadataEnrichment.ts');
const helper = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: helper, Date }, { filename: sourceFile });

function parseArgs(args) {
  const options = { apply: false, printSql: false, playerIds: undefined, asOf: new Date(), report: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--print-sql') options.printSql = true;
    else if (['--playerids', '--as-of', '--report'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`A value is required for ${arg}`);
      if (arg === '--playerids') {
        options.playerIds = [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))];
        if (!options.playerIds.length) throw new Error('--playerids must contain at least one player ID');
      } else if (arg === '--as-of') {
        options.asOf = new Date(value);
        if (!Number.isFinite(options.asOf.getTime())) throw new Error('--as-of must be a valid date');
      } else options.report = path.resolve(value);
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/enrich-player-baseline-metadata.cjs [--playerids ID,ID] [--as-of ISO_DATE] [--report FILE] [--apply] [--print-sql]');
      return null;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  // Historical assessment is a report-only aid. Applying it would label old
  // season activity as current even though the card is rendered today.
  if (options.apply && args.includes('--as-of')) throw new Error('--as-of is available only in read-only mode');
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (!options) return;
  if (options.printSql) {
    console.log('-- READ ONLY: $1 optional text[] player IDs; $2 assessment year; $3 assessment timestamp.');
    console.log(`${helper.BASELINE_METADATA_EVIDENCE_SQL};`);
    console.log('\n-- READ ONLY: $1 exact recorded team IDs.');
    console.log(`${helper.BASELINE_TEAM_MAPPING_SQL};`);
    console.log('\n-- WRITE, used only with --apply: $1 JSON patches from the reviewed planner.');
    console.log(`${helper.APPLY_BASELINE_METADATA_SQL};`);
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to the intended database branch');
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query(options.apply ? 'BEGIN' : 'BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '120s'");
    const plan = await helper.planBaselineMetadata(client, options);
    const coverage = options.apply ? await helper.applyBaselineMetadata(client, plan) : plan.coverage;
    const report = { mode: options.apply ? 'apply' : 'read_only', assessedAt: options.asOf.toISOString(),
      playerIds: options.playerIds || null, coverage, patches: plan.patches };
    // Write the complete review report before a mutation can be committed. If
    // saving it fails, the transaction is rolled back with no partial backfill.
    if (options.report) fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await client.query(options.apply ? 'COMMIT' : 'ROLLBACK');
    transactionOpen = false;
    console.log(JSON.stringify({ mode: report.mode, assessedAt: report.assessedAt, coverage,
      report: options.report, ...(options.report ? {} : { patches: plan.patches }) }, null, 2));
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

module.exports = { parseArgs, main };
if (require.main === module) main().catch((error) => {
  console.error(String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database url]'));
  process.exitCode = 1;
});
