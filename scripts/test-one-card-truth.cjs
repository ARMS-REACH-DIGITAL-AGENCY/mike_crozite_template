// One card truth (Pete, Nov 18 2026): gallery card front, card back and
// player profile keep their copies of flip_card_front_stage for the SAME age,
// and changed cards are cleared every minute by /api/cron/card-cache-sync.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const db = read("src/lib/db.ts");
const profile = read("src/lib/profilePageData.ts");
for (const name of ["SCHOOL_DATA_TTL_SECONDS", "ACTIVE_ROSTER_TTL_SECONDS", "ALL_TIME_ROSTER_TTL_SECONDS"]) {
  assert.match(db, new RegExp(`const ${name} = CARD_DATA_TTL_SECONDS;`), `${name} must use the shared card-data age`);
}
assert.match(profile, /const PROFILE_DATA_TTL_SECONDS = CARD_DATA_TTL_SECONDS;/, "profile must use the shared card-data age");
const route = read("src/app/api/cron/card-cache-sync/route.ts");
for (const tag of ["school-data:${c.hsid}", "player-profile:${c.playerid}", "player-profile:${c.yatid}"]) {
  assert(route.includes(tag), `card-cache-sync must clear ${tag}`);
}
assert.match(db, /tags: \['school-data', `school-data:\$\{key\}`\]/, "school copies must carry the school-data:<hsid> tag");
assert.match(profile, /`player-profile:\$\{args\[0\] \?\? ''\}`/, "profile copies must carry the player-profile:<id> tag");
const vercel = JSON.parse(read("vercel.json"));
assert(vercel.crons.some((c) => c.path === "/api/cron/card-cache-sync" && c.schedule === "* * * * *"), "vercel.json must run card-cache-sync every minute");
console.log("one card truth OK");
