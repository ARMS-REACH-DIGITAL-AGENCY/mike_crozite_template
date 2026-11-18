// YAT ID key transition, step 4, player profile (docs/yat-key-transition.md):
// a person's career (stats, game logs, team stints, news) reads by his YAT ID,
// so every card of one person shows the same career.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/[hsid]/player/[playerId]/[slug]/page.tsx"), "utf8");
const db = fs.readFileSync(path.join(root, "src/lib/db.ts"), "utf8");
assert.match(page, /const personId = String\(yatId \|\| playerId\);/, "profile must derive the person's YAT ID");
for (const loader of ["keptBattingStats", "keptPitchingStats", "keptCareerBatting", "keptCareerPitching", "keptGameLogs", "keptTeamStints"]) {
  assert.match(page, new RegExp(`${loader}\\(personId\\)`), `${loader} must read by the person's YAT ID`);
}
const body = (name) => {
  const start = db.indexOf(`export async function ${name}(`);
  assert(start >= 0, `${name} missing`);
  return db.slice(start, db.indexOf("\nexport ", start + 10));
};
assert.match(body("getPlayerTeamStints"), /WHERE yatid = public\.yat_id_for\(\$1\)/, "team stints read by YAT ID");
assert.match(body("getPlayerGameLogs"), /WHERE yatid = public\.yat_id_for\(\$1\)/, "game logs read by YAT ID");
assert.match(body("getNewsByPlayer"), /na0\.yatid = p\.yatid/, "news read by YAT ID");
console.log("yat step 4 profile OK");
