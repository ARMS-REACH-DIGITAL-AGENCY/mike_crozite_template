// Fast, dependency-free release guard for browser inline scripts that Next's
// TypeScript compile cannot syntax-check. Runs during every Vercel build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const splash = readFileSync('src/components/yatstats/shell/SchoolSplash.tsx', 'utf8');
const root = readFileSync('src/app/layout.tsx', 'utf8');
const school = readFileSync('src/app/[hsid]/layout.tsx', 'utf8');
const route = readFileSync('src/app/api/splash-sponsor/[hsid]/route.ts', 'utf8');
const sql = readFileSync('migrations/20261021_school_splash_sponsorships.sql', 'utf8');

function templateBody(source, name) {
  const marker = `const ${name} = \``;
  const i = source.indexOf(marker);
  assert.ok(i !== -1, `missing ${name}`);
  const start = i + marker.length, end = source.indexOf('`;', start);
  assert.ok(end > start, `unclosed ${name}`);
  return runInNewContext('`' + source.slice(start, end) + '`');
}
for (const name of ['FIT_WORDS', 'SPONSOR_LOOKUP']) {
  new Script(templateBody(splash, name), { filename: name });
}
new Script(templateBody(root, 'SPLASH_BOOTSTRAP'), { filename: 'SPLASH_BOOTSTRAP' });

const rotate = splash.match(/const ROTATE_SPLASH_PLAYERS = ("(?:\\.|[^"\\])*");/);
assert.ok(rotate, 'missing rotating splash player script');
new Script(runInNewContext(rotate[1]), { filename: 'ROTATE_SPLASH_PLAYERS' });

const css = templateBody(splash, 'SPLASH_CSS');
assert.ok(!css.includes('\\n#yatSplash'), 'splash CSS contains literal escaped newlines');
assert.ok(!/<\/div>\\n\s*<div/.test(splash), 'splash JSX contains accidental escaped newlines');
assert.match(css, /yat-sponsor-reveal/);
assert.match(css, /yat-splash-swoosh-foreground/);
assert.match(splash, /logo\.naturalWidth/);
assert.match(root, /mounted\+5500/);
assert.ok(!root.includes('sponsorTimer='), 'sponsor timer must start from actual splash mount');
assert.match(school, /splashRosterJson/);
assert.match(school, /sortActivePlayers\(\[\.\.\.activeAlumniRows\]\)/, 'splash candidates must follow the Active Alumni gallery sort');
assert.match(school, /featuredSplashIds\.length : 4/, 'non-curated schools must use at most four candidates');
assert.match(school, /const splashOtherIds: string\[\] = \[\]/, 'no full-roster image-probing fallback');
assert.match(school, /missingSplashDetails\.delete\(id\)/, 'send only curated caption data');
const featured = JSON.parse(readFileSync('src/config/splash-featured-players.json', 'utf8'));
assert.deepEqual(featured['5004'], ['320111','317316','180827','213884','225132','233197','284749','YAT000067'], 'Hamilton curated list must stay exactly eight');

assert.match(route, /WHERE s\.hsid = \$1/);
assert.match(sql, /REFERENCES public\.sponsor_orders\(id\)/);
assert.match(sql, /v_school_splash_sponsor_assignments/);
console.log('[splash sponsors] inline JS syntax, reveal timing, CSS and DB mapping verified');
