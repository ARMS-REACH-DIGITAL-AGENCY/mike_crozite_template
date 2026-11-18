// Pete, Nov 18 2026: Vercel Cron starts our GitHub workflows on time
// (src/app/api/cron/github-jobs). This build check keeps the schedule list in
// src/lib/githubJobSchedule.ts identical to every workflow's own `cron:`
// lines, makes sure each listed workflow can be started by hand
// (workflow_dispatch), and checks the slot logic on known times.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const lib = fs.readFileSync(path.join(root, "src/lib/githubJobSchedule.ts"), "utf8");
const listed = new Map();
for (const m of lib.matchAll(/workflow:\s*"([^"]+)",\s*cron:\s*\[([^\]]*)\]/g)) {
  listed.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort());
}
const dir = path.join(root, ".github/workflows");
const fromFiles = new Map();
for (const f of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  const crons = [...text.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)].map((m) => m[1]).sort();
  if (crons.length) {
    fromFiles.set(f, crons);
    assert(/workflow_dispatch/.test(text), `${f} has a schedule but no workflow_dispatch, so Vercel cannot start it`);
  }
}
for (const [f, crons] of fromFiles) {
  assert(listed.has(f), `${f} has a schedule but is missing from src/lib/githubJobSchedule.ts`);
  assert.deepStrictEqual(listed.get(f), crons, `${f}: schedule differs from src/lib/githubJobSchedule.ts`);
}
for (const f of listed.keys()) assert(fromFiles.has(f), `${f} is listed in githubJobSchedule.ts but has no schedule in its workflow file`);

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert(vercel.crons.some((c) => c.path === "/api/cron/github-jobs" && c.schedule === "*/5 * * * *"), "vercel.json must call /api/cron/github-jobs every 5 minutes");

// Slot logic: compile the module with the repo's TypeScript compiler.
const ts = require("typescript");
const out = ts.transpileModule(lib, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { dueJobs, cronMatches } = mod.exports;
const at = (s) => new Date(`2026-11-18T${s}:00Z`);
const has = (s, wf) => dueJobs(at(s)).includes(wf);
assert(has("05:00", "mlb-transactions-sync.yml"), "05:00 slot starts transactions");
assert(!has("05:05", "mlb-transactions-sync.yml"), "05:05 slot does not");
assert(has("05:16", "mlb-transactions-sync.yml"), "05:15-05:19 slot starts transactions");
assert(has("05:09", "hourly-player-image-cutouts.yml"), "minute 7 falls in the 05:05 slot");
assert(!has("05:10", "hourly-player-image-cutouts.yml"), "minute 7 only once");
assert(has("06:00", "mlb_roster-sync.yml") && !has("07:00", "mlb_roster-sync.yml"), "roster every 3 hours");
assert(has("10:43", "hourly-player-image-cutouts.yml"), "daily sweep 10:41");
assert(cronMatches("40 10 * * 1", new Date("2026-11-16T10:40:00Z")) && !cronMatches("40 10 * * 1", new Date("2026-11-17T10:40:00Z")), "Monday-only job");
console.log(`github job schedule OK: ${fromFiles.size} scheduled workflows match`);
