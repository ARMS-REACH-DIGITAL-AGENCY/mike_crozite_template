// Contracts: every microsite installs a correctly-sized same-origin school crest.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = read('src/app/manifest.ts');
const icon = read('src/app/api/icon/school/route.ts');
const layout = read('src/app/[hsid]/layout.tsx');
const page = read('src/app/[hsid]/page.tsx');
assert.match(manifest, /api\/icon\/school\?hsid=/, 'manifest must point to the school-specific same-origin icon endpoint');
assert.match(manifest, /icon\(192, 'any'\)/, 'Android 192px any icon required');
assert.match(manifest, /icon\(512, 'any'\)/, 'Android 512px any icon required');
assert.match(manifest, /icon\(512, 'maskable'\)/, 'Android maskable launcher icon required');
assert.match(icon, /size !== 192 && size !== 512/, 'icon endpoint must validate rendered sizes');
assert.match(icon, /\.resize\(crestSize, crestSize/, 'school crest must be resized to a real square');
assert.match(icon, /Content-Type': 'image\/png'/, 'school icons must be served with the PNG mime type');
assert.match(layout, /crestIcon\(192\)/, 'school metadata should prefer same-origin crest');
assert.doesNotMatch(page, /url: "\/favicon.ico", type: "image\/x-icon"/, 'school page metadata must not prefer the generic Y favicon');
console.log('School Home screen icon contracts pass.');
