const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/fantasyCountdown.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported, Date, Math });
const { FANTASY_COUNTDOWN_START_MS: target, getFantasyCountdown } = exported;
assert.equal(target, Date.parse('2027-02-01T19:00:00Z'), 'Noon Arizona is 19:00 UTC, not midnight or browser-local noon.');
assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hour12: false }).format(target), '12');
function check(offset, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(getFantasyCountdown(target + offset))), expected);
}
check(-(2 * 86400000 + 3 * 3600000 + 4 * 60000 + 15000), { days: 2, hours: 3, minutes: 4, complete: false });
check(-86400000, { days: 1, hours: 0, minutes: 0, complete: false });
check(-86399000, { days: 0, hours: 23, minutes: 59, complete: false });
check(-3600000, { days: 0, hours: 1, minutes: 0, complete: false });
check(-3599000, { days: 0, hours: 0, minutes: 59, complete: false });
check(-60000, { days: 0, hours: 0, minutes: 1, complete: false });
check(-59999, { days: 0, hours: 0, minutes: 0, complete: false });
check(-1, { days: 0, hours: 0, minutes: 0, complete: false });
check(0, { days: 0, hours: 0, minutes: 0, complete: true });
check(86400000, { days: 0, hours: 0, minutes: 0, complete: true });
const component = fs.readFileSync(path.join(root, 'src/components/yatstats/FantasyNavCountdown.tsx'), 'utf8');
assert.match(component, /useState<Countdown \| null>\(null\)/, 'Hydration must begin from the same placeholders.');
assert.match(component, /getFantasyCountdown\(Date\.now\(\)\)/, 'Use a real-time deadline, not hard-coded reference numbers.');
assert.match(component, /setInterval\(update, 1000\)/);
assert.match(component, /clearInterval\(timer\)/);
assert.match(component, /removeEventListener\('visibilitychange', update\)/);
assert.ok(!component.includes('aria-live'), 'Do not announce a changing timer every second.');
assert.ok(!component.includes('fetch('), 'No server or database requests needed for a client countdown.');
assert.ok(component.includes('Starts February 1st, 2027'), 'Show the full requested date heading.');
assert.equal(exported.FANTASY_COUNTDOWN_START_LABEL, 'February 1st, 2027', 'Do not display the time in tooltips or accessible wording.');
assert.ok(!component.toLowerCase().includes('noon'), 'No noon wording on the graphic.');
const styles = fs.readFileSync(path.join(root, 'src/components/yatstats/DrawerLayoutOverrides.tsx'), 'utf8');
assert.match(styles, /yat-fantasy-countdown-date \{[^}]*Caveat[^}]*text-transform: none;/, 'Use the already-loaded handwritten font, not condensed scoreboard lettering.');
console.log('PASS: Arizona noon target, live calculations, day/hour/minute boundaries, expiry clamp, hydration placeholders, cleanup and accessibility.');
