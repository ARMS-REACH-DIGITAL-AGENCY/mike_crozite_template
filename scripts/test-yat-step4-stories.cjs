// YAT ID key transition, step 4, stories (docs/yat-key-transition.md): a
// person's stories, "Where Yat Now?" life story, tagged memories and connect
// video record show on every card of that person.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
assert.match(read("src/app/api/stories/route.ts"), /me\.yatid = public\.yat_id_for\(\$1::text\)/, "Stories tab reads by person");
const page = read("src/app/[hsid]/player/[playerId]/[slug]/page.tsx");
assert.match(page, /me\.yatid = public\.yat_id_for\(\$2::text\)/, "shared story preview reads by person");
assert.equal((page.match(/alumni_where_yat_now[\s\S]{0,80}WHERE yatid=public\.yat_id_for\(\$1::text\)/g) || []).length, 2, "both Where Yat Now share previews read by person");
assert.match(read("src/components/yatstats/WhereYatProfilePanel.tsx"), /WHERE yatid=public\.yat_id_for\(\$1::text\) AND status='approved'/, "Where Yat Now panel reads by person");
assert.match(read("src/components/yatstats/WhereYatTaggedMemories.tsx"), /t\.yatid=public\.yat_id_for\(\$1::text\)/, "tagged memories read by person");
assert.match(read("src/lib/connectVideoRequests.ts"), /WHERE yatid = public\.yat_id_for\(\$1::text\)/, "connect video record reads by person");
console.log("yat step 4 stories OK");
