const fs = require("node:fs");
const assert = require("node:assert/strict");
const Module = require("node:module");
const ts = require("typescript");

const file = "src/lib/flipCardStatSelection.ts";
const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
});
const runtime = new Module(file, module);
runtime.filename = file;
runtime.paths = module.paths;
runtime._compile(compiled.outputText, file);
const { familyEvidence, primaryStatFamily, orderByPrimaryStatFamily } = runtime.exports;

const bat = (g, ab) => [{ type: "batting", stats: { g, ab } }];
const pit = (g, ip) => [{ type: "pitching", stats: { pg: g, ip } }];
const family = (position, b, p, legacyIsPitcher = false) => primaryStatFamily({
  position, battingGames: b, pitchingGames: p, legacyIsPitcher,
});

// Real-world regression shape: 232 batting games, 1 pitching game.
assert.equal(family("2B-3B", 232, 1, true), "batting");
// Never allow a stale P label to hide substantial batting usage.
assert.equal(family("P", 180, 1, true), "batting");
assert.equal(family("2B", 1, 180, false), "pitching");
assert.equal(family("P", 50, 45, true), "pitching");
assert.equal(family("OF", 50, 45, true), "batting");
assert.equal(family("", 50, 45), "batting");
assert.equal(family("", 45, 50), "pitching");
assert.equal(family("", 0, 100), "pitching");
assert.equal(family("", 100, 0), "batting");
assert.equal(family("", 0, 0, true), "pitching");
assert.equal(family("", 0, 0, false), "batting");

assert.deepEqual(familyEvidence(bat(20, 70), "batting"), { present: true, games: 20 });
assert.deepEqual(familyEvidence(pit(1, 2.1), "pitching"), { present: true, games: 1 });
assert.equal(familyEvidence([], "batting", { games: 0, appearances: 0 }).present, false);
assert.equal(familyEvidence([], "pitching", { games: 1 }).present, true);
assert.equal(familyEvidence([{ type: "batting", stats: { g: 5 } }], "pitching").present, false);

const buckets = [
  { family: "pitching", label: "MiLB CAREER" },
  { family: "batting", label: "MiLB CAREER" },
  { family: "batting", label: "College CAREER" },
  { family: "pitching", label: "College CAREER" },
];
assert.deepEqual(orderByPrimaryStatFamily(buckets, "batting").map(x => x.family),
  ["batting", "batting", "pitching", "pitching"]);
assert.equal(orderByPrimaryStatFamily(buckets, "pitching")[0].family, "pitching");
// Verify the global renderer offers both tabs; never add a player-specific exemption.
const card = fs.readFileSync("src/components/yatstats/PlayerCardBack.tsx", "utf8");
const zone = fs.readFileSync("src/components/yatstats/FunZone.tsx", "utf8");
assert(card.includes('orderByPrimaryStatFamily([...battingTabs, ...pitchingTabs], primaryFamily)'));
assert(zone.includes('aria-label="Batting or pitching statistics"'));
assert(zone.includes('{family === "batting" ? "HITTING" : "PITCHING"}'));
assert(!card.includes("215409"));
assert(!zone.includes("215409"));
console.log("PASS platform-wide flip-card batting/pitching tabs and primary-role regressions");
