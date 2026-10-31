const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const box = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/lib/socialScoutHealth.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }
}).outputText, { exports: box.exports, Date, Number, Math, console });
const { scoutHealthStatus, autoStoryCount } = box.exports;
const time = Date.parse('2026-10-31T09:27:42Z');
const health = {scans:4, post_checks:91, ai_reviewed:22, failures:0, ai_unavailable:0,
  last_run_at:'2026-10-31T09:27:28Z', active_roster:47, decisions:22, ignored:22, published:0};
assert.equal(scoutHealthStatus(health, time), 'RUNNING');
assert.equal(scoutHealthStatus({ ...health, scans:0 }, time), 'NO SCANS LOGGED');
assert.equal(scoutHealthStatus({ ...health, last_run_at:null }, time), 'NO SCANS LOGGED');
assert.equal(scoutHealthStatus({ ...health, last_run_at:'2026-10-31T08:20:00Z' }, time), 'LATE');
assert.equal(scoutHealthStatus({ ...health, failures:1 }, time), 'ERRORS');
assert.equal(scoutHealthStatus({ ...health, ai_unavailable:1 }, time), 'ERRORS');
assert.equal(autoStoryCount(1,1), 0, 'Manual historical test is not automated success');
assert.equal(autoStoryCount(5,1), 4);
const digest = read('src/app/api/cron/social-news-digest/route.ts');
assert.match(digest, /social_news_scout_run/);
assert.match(digest, /social_news_scout_evaluated/);
assert.match(digest, /now\(\)-interval '24 hours'/);
assert.match(digest, /manual_verified_backfill/);
assert.match(digest, /emailHtml\(day,totals,stories\.rows,schoolOrigins,health\)/);
assert.match(digest, /scoutHealthStatus\(health\)/);
assert.match(digest, /pete@yatstats\.com/);
console.log('PASS Scout daily report shows 24h scans, decisions, errors, and separates manual historical examples.');
