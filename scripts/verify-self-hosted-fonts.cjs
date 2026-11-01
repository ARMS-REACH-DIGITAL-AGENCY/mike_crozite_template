// Builds must never download fonts from Google: a failed download fails the
// whole Vercel build (Nov 1, 2026: two scroll-fix builds failed on Doto).
const fs = require('fs'); const path = require('path'); const assert = require('assert/strict');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const offenders = walk('src').filter((f) => /\.(t|j)sx?$/.test(f) && /from ['"]next\/font\/google['"]/.test(fs.readFileSync(f, 'utf8')));
assert.deepEqual(offenders, [], 'no next/font/google imports: ' + offenders.join(', '));
for (const f of ['doto-latin-700-normal', 'doto-latin-900-normal', 'roboto-condensed-latin-400-normal', 'roboto-condensed-latin-500-normal', 'roboto-condensed-latin-700-normal'])
  assert(fs.existsSync(`src/fonts/${f}.woff2`), f + ' is shipped with the site');
console.log('PASS fonts are self-hosted; builds do not depend on Google Fonts');
