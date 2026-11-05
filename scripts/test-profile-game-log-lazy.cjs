"use strict";
// A dependency-boundary regression test: player initial render must never
// read game logs, stints, or team schedules. Preserve its Stats/News/retired UI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const profile = read("src/app/[hsid]/player/[playerId]/[slug]/page.tsx");
const api = read("src/app/api/player-game-log/route.ts");
const loader = read("src/components/yatstats/ProfileGameLogLoader.tsx");
const builder = read("src/lib/playerGameLogData.ts");

for (const call of ["getPlayerGameLogs(", "getTeamSchedule(", "getPlayerTeamStints(", "getTeamIdMap("]) {
  assert.ok(!profile.includes(call), "Eager profile DB call still present: " + call);
}
assert.match(profile, /<ProfileGameLogLoader[\s\S]*?playerId=\{safePlayerId\}/);
assert.match(profile, /<WhereYatProfilePanel[\s\S]*?playerId=\{safePlayerId\}/);
for (const call of [
  "getPlayerBattingStats(safePlayerId)",
  "getPlayerPitchingStats(safePlayerId)",
  "getPlayerCareerBatting(safePlayerId)",
  "getPlayerCareerPitching(safePlayerId)",
]) assert.ok(profile.includes(call), "Unexpected missing existing Stats work: "+call);
assert.ok(profile.includes('id="ppTab-stats"'), "Stats tab removed");
assert.ok(profile.includes('id="ppTab-news"'), "News tab removed");

assert.match(loader, /window\.addEventListener\("hashchange", check\)/);
assert.match(loader, /window\.getComputedStyle\(panel\)\.display === "none"/);
assert.match(loader, /fetch\("\/api\/player-game-log\?"/);
assert.match(api, /unstable_cache\(/);
assert.match(api, /revalidate:\s*120/);
assert.match(api, /\^\[A-Za-z0-9_-\]\{1,40\}/);

for (const behavior of [
  "getPlayerTeamStints", "getTeamSchedule", "takeGameLog",
  "usedLogs", "logsByGamePk", "logsByDate", "POSTSEASON_TYPES",
  "NO_GAME_LOGS_LEVEL", "stintSchedules", "statHeaders",
  "didNotPlay", "scheduleTableRows.sort",
]) assert.ok(builder.includes(behavior), "Missing Game Log behavior: "+behavior);

console.log("PASS: on-demand Game Log boundary, historical Stats parity guard, and schedule behavior present");
