// Build gate: the Founding Partner sponsor card shows only on the 1,024
// Fantasy Bracket Tournament schools, and src/lib/fantasyBracketHsids.json
// must be exactly the bracket's field (public/bracket-lab/2027/field.json).
const fs = require('node:fs');
const assert = require('node:assert/strict');
const season = JSON.parse(fs.readFileSync('public/bracket-lab/2027/field.json', 'utf8'));
assert.equal(season.season, 2027, 'Published fantasy field must be the 2027 season');
const field = Object.keys(season.schools).sort((a, b) => a - b);
const slots = new Set(Object.values(season.schools).map((row) => `${row[1]}:${row[2]}`));
assert.equal(slots.size, 1024, 'All region/seed slots must be unique');
for (let r = 1; r <= 8; r++) for (let s = 1; s <= 128; s++) {
  assert.ok(slots.has(`${r}:${s}`), `Missing region ${r} seed ${s}`);
}
const list = JSON.parse(fs.readFileSync('src/lib/fantasyBracketHsids.json', 'utf8'));
assert.equal(list.length, 1024, 'Fantasy bracket list must have 1,024 schools');
assert.deepEqual(list, field, 'src/lib/fantasyBracketHsids.json must match the bracket field in index.json');
const cards = fs.readFileSync('src/lib/sponsorFlipCards.ts', 'utf8');
assert(/schoolIds: 'fantasy-bracket'/.test(cards), 'Founding Partner card must be limited to the fantasy bracket schools');
console.log('PASS sponsor card limited to the 1,024 fantasy bracket schools');
