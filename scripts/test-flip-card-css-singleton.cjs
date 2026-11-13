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
}
console.log("PASS shared CSS hoisted out of all flip-card instances");
