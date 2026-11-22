// YAT ID key transition, step 4, news (docs/yat-key-transition.md): a
// school's feed shows stories about every player who has a card there (one
// person, many schools), and a tag on any card of a person counts for each
// of his schools. The profile's news already reads by YAT ID (step 4 profile).
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const db = fs.readFileSync(path.join(__dirname, "..", "src/lib/db.ts"), "utf8");
assert.match(db, /SELECT yatid FROM public\.yat_school_links WHERE hsid::text = \$1/, "school feed includes every school of a person after card consolidation");
assert.match(db, /JOIN school_people school_person ON school_person\.yatid = na_person\.yatid/, "school feed includes every alumnus's stories by YAT ID");
assert.match(db, /ON tagged_player\.yatid = public\.yat_id_for\(activity\.details->>'playerId'\)/, "news tags count by person");
assert.match(db, /SELECT na0\.uuid FROM news_articles na0, person p WHERE na0\.yatid = p\.yatid/, "profile news reads by YAT ID");
console.log("yat step 4 news OK");
