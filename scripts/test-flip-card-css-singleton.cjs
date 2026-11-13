// Enforce that repeated card styling ships as one cached stylesheet per component.
// Otherwise a 150-card school gallery repeats 30KB of CSS in every card,
// creating multi-megabyte HTML/RSC responses and stalling mobile browsers.
const fs = require("node:fs");
const assert = require("node:assert/strict");
for (const [name, expected, selectors] of [
  ["FunZone", 19000, [".fz-root", ".fz-stats-shell", ".fz-tab-strip", ".fz-story-upload"]],
  ["PlayerCardFront", 9000, [".yat-front-cq", ".yat-front-name", ".yat-front-flip-button"]],
  ["PlayerCardBack", 2500, [".yat-back-cq", ".yat-back-hero", ".yat-back-texture", ".ybm-name"]],
]) {
  const base = "src/components/yatstats/" + name;
  const tsx = fs.readFileSync(base + ".tsx", "utf8");
  const css = fs.readFileSync(base + ".css", "utf8");
  assert(tsx.includes('import "./' + name + '.css";'), name + " must import its shared style once");
  assert(!tsx.includes("<style>{\x60"), name + " cannot embed style in every card");
  assert(css.length >= expected, name + " CSS should not be lost");
  for (const selector of selectors) assert(css.includes(selector), name + " missing " + selector);
  assert(!css.includes("${"), name + " CSS must be resolved at build time");
  // Imported CSS loads before YatStyles' inline rules, which the old inline
  // card <style> used to follow. Every card selector carries one extra class
  // (:not(.yat-css-k)) so it still wins those ties (Nov 13: name printed over
  // the YAT?STATS mark). Run scripts/css-specificity-bump.py after edits.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{};]+\{/g)
    .map((s) => s.slice(0, -1).trim()).filter((s) => s && !s.startsWith("@") && !/^(from|to|\d+%)/.test(s))
    .flatMap((s) => s.split(",")).filter((s) => !s.includes(":not(.yat-css-k)"));
  assert.deepEqual(bare, [], name + " selectors missing the specificity bump");
}
console.log("PASS shared CSS hoisted out of all flip-card instances");
