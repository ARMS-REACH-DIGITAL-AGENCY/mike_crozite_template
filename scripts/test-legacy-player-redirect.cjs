const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = fs.readFileSync(path.join(__dirname, '../src/lib/db.ts'), 'utf8');
const layout = fs.readFileSync(path.join(__dirname, '../src/app/[hsid]/player/[playerId]/layout.tsx'), 'utf8');
const short = fs.readFileSync(path.join(__dirname, '../src/app/[hsid]/p/[playerId]/route.ts'), 'utf8');

assert.match(db, /export async function resolveLegacyPlayerRedirect/);
assert.match(db, /m\.source='yat_legacy'/);
assert.match(db, /m\.is_verified IS TRUE/);
assert.match(db, /JOIN public\.flip_card_front_stage s ON s\.playerid=m\.playerid/);
assert.match(db, /if \(!\/\^YAT\[0-9\]\{6,\}\$\/i\.test\(playerId\)\) return null/);
assert.match(layout, /const legacy = await resolveLegacyPlayerRedirect\(playerId\)/);
assert.match(layout, /redirect\(\`\/\$\{encodeURIComponent\(legacy\.hsid\)\}\/player\/\$\{encodeURIComponent\(legacy\.playerId\)\}/);
assert.ok(layout.indexOf('resolveLegacyPlayerRedirect(playerId)') < layout.indexOf('getPlayerById(playerId)'), 'redirect before profile reads');
assert.match(short, /const canonicalId = legacy\?\.playerId \|\| playerId/);
assert.match(short, /playerId: canonicalId, slug/);
console.log('PASS: verified legacy player ID links redirect to canonical profile and short-link targets');
