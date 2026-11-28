'use strict';
// TEST-ONLY: interruption recovery must not re-ingest or rewind a saved day.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsForTest = {};
new Function('exports', ts.transpileModule(fs.readFileSync('scripts/lib/rehearsal-resume.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsForTest);
const { rehearsalResumeMode, runRehearsalStages } = exportsForTest;

function state(day = '2026-03-26') {
  const cutoffAt = new Date(Date.parse(day + 'T11:00:00Z') + 86400000).toISOString();
  const periods = [{ cadence: 'daily', date: day }];
  if (day === '2026-03-29') periods.push({ cadence: 'weekly', date: '2026-03-23' });
  return { day, cutoffAt, season: '2027', branch: 'br-fixture', periods, ready: [],
    cutoffWrites: 0, missingBoundary: 512,
    checkpoint: { report_date: day, branch_id: 'br-fixture', effective_at: cutoffAt, phase: 'ingesting' } };
}
function ready(input, period = input.periods[0]) {
  return { cadence: period.cadence, period_start: period.date, period_end: input.day,
    season_key: input.season, cutoff_at: input.cutoffAt };
}
const prohibited = name => async () => { throw Error('Prohibited retry work: ' + name); };

(async () => {
  const current = state(), calls = [];
  let clock = '2026-03-26T11:00:00.000Z';
  const capturedSource = { providerBody: 'authentic body', hash: 'source hash' };
  let savedSource;
  await assert.rejects(async () => {
    await runRehearsalStages(rehearsalResumeMode(current), {
      ingest: async () => { calls.push('ingest'); savedSource = structuredClone(capturedSource); current.checkpoint.phase = 'running'; },
      prelock: async () => { calls.push('prelock'); clock = '2026-03-27T10:59:59.000Z'; },
      publish: async () => {
        calls.push('cutoff and publish'); clock = current.cutoffAt;
        current.cutoffWrites = 512; current.missingBoundary = 0; current.ready.push(ready(current));
      },
    });
    throw Error('Crash after publication before review archive');
  }, /Crash after publication/);
  assert.deepEqual(calls, ['ingest', 'prelock', 'cutoff and publish']);
  assert.equal(rehearsalResumeMode(current), 'published');
  const restored = await runRehearsalStages(rehearsalResumeMode(current), {
    ingest: prohibited('new provider fetch or raw input reads'),
    prelock: prohibited('10:59:59 write'),
    publish: async () => ({ source: savedSource, cutoff: clock, finishedRows: ['immutable edition'] }),
  });
  assert.equal(restored.cutoff, current.cutoffAt, 'Recovery preserves the actual cutoff timestamp');
  assert.deepEqual(restored.source, capturedSource, 'Recovery retains original source evidence');

  const beforePublication = state();
  beforePublication.checkpoint.phase = 'running';
  beforePublication.cutoffWrites = 512; beforePublication.missingBoundary = 0;
  assert.equal(rehearsalResumeMode(beforePublication), 'cutoff');
  let cutoffRetries = 0;
  await runRehearsalStages(rehearsalResumeMode(beforePublication), {
    ingest: prohibited('ingestion after persisted cutoff'), prelock: prohibited('rewind before publication retry'),
    publish: async () => { cutoffRetries++; beforePublication.ready.push(ready(beforePublication)); },
  });
  assert.equal(cutoffRetries, 1, 'A failed cutoff publication can retry the shared boundary');

  const sunday = state('2026-03-29');
  sunday.checkpoint.phase = 'running'; sunday.cutoffWrites = 512; sunday.missingBoundary = 0;
  sunday.ready.push(ready(sunday)); // Daily committed; weekly publication interrupted.
  assert.equal(rehearsalResumeMode(sunday), 'cutoff');
  await runRehearsalStages(rehearsalResumeMode(sunday), {
    ingest: prohibited('Sunday ingestion'), prelock: prohibited('Sunday rewind'),
    publish: async () => { sunday.ready.push(ready(sunday, sunday.periods[1])); },
  });
  assert.equal(rehearsalResumeMode(sunday), 'published', 'A Sunday retry requires both saved periods');

  for (const patch of [
    { branch_id: 'br-other' }, { effective_at: '2026-03-28T11:00:00Z' }, { phase: 'ingesting' },
  ]) {
    assert.throws(() => rehearsalResumeMode({ ...current, checkpoint: { ...current.checkpoint, ...patch } }), /branch, clock or phase|matching running or scored/);
  }
  assert.throws(() => rehearsalResumeMode({ ...current, missingBoundary: 1 }), /no longer at their saved cutoff/);
  assert.throws(() => rehearsalResumeMode({ ...current, checkpoint: undefined }), /matching running or scored/);
  assert.throws(() => rehearsalResumeMode({ ...current, ready: [{ ...current.ready[0], season_key: '2028' }] }), /does not match/);
  assert.throws(() => rehearsalResumeMode({ ...current, ready: [{ ...current.ready[0], cutoff_at: '2026-03-28T11:00:00Z' }] }), /does not match/);
  const finished = state(); finished.checkpoint.phase = 'scored';
  assert.throws(() => rehearsalResumeMode(finished), /no matching cutoff/);
  console.log('PASS published-day crash recovery, cutoff retry, partial Sunday retry, saved-source reuse and branch/phase/boundary rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
