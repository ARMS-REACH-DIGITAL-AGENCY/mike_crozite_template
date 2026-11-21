// Production optimization contract: live scoring reads only one seven-day
// feed; locked historical games come from master_bracket, not player-game-log replays.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const helperText = read('src/lib/bracket/activeWeekWindow.ts');
const js = ts.transpileModule(helperText, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const calendar = {
  tournamentWeeks(start, count) {
    const first = new Date(start + 'T00:00:00Z').getTime();
    return Array.from({ length: count }, (_, i) => {
      const from = first + i * 7 * 86400000;
      return [new Date(from).toISOString().slice(0, 10), new Date(from + 6 * 86400000).toISOString().slice(0, 10)];
    });
  },
};
const exported = {};
vm.runInNewContext(js, {
  exports: exported,
  require(name) {
    if (name === '@/lib/bracket/tournamentCalendar') return calendar;
    throw Error('Unexpected dependency: ' + name);
  },
  Object, Map, Date, Array,
}, { filename: 'activeWeekWindow.js' });
const { selectScoringWeek, rebaseBracketWeek } = exported;
const locked = (week) => ({ week, home_hsid: 5004, away_hsid: 9655, locked_at: '2027-07-01T00:00:00Z' });
const pending = (week) => ({ ...locked(week), locked_at: null });
const asof = '2027-08-25'; // Week 30 of the actual 2027 calendar.
const rows = Array.from({ length: 30 }, (_, i) => locked(i + 1));
rows[29] = pending(30);
const selected = selectScoringWeek('2027-02-01', 34, asof, rows);
assert.equal(selected.week, 30);
assert.equal(selected.latest, 30);
assert.equal(selected.start, '2027-08-23');
assert.equal(selectScoringWeek('2027-02-01', 34, '2027-01-31', rows), null);
assert.equal(selectScoringWeek('2027-02-01', 34, '2027-02-01', [pending(1)]).week, 1);
assert.equal(selectScoringWeek('2027-02-01', 34, '2027-09-20', rows).week, 30, 'A missed earlier week is recovered first');
const missed = [...rows, pending(27), pending(28)];
assert.equal(selectScoringWeek('2027-02-01', 34, asof, missed).week, 27);
assert.equal(selectScoringWeek('2027-02-01', 34, asof, [locked(27), pending(28), pending(30)]).week, 28);
const empty = { asOf: '', roster: { '5004': [['YAT000001', 'Alum', 'MLB', 0, 'Club']] },
  lines: [['5004', 'YAT000001', 0, 'b', [4, 4, 1, 0, 0, 0, 0, 0, 0], 'g1', 'Club', 1, 'MLB']],
  clubs: { Club: [[0, 'g1', 1, 2]] },
  games: { Club: [[0, 'g1', 1, 1, 123]] },
  fans: { '5004': [17] },
};
const shifted = rebaseBracketWeek(empty, 30);
assert.equal(shifted.lines[0][2], 203, 'Week 30 Monday = original day 203');
assert.equal(shifted.clubs.Club[0][0], 203, 'Club records use the same offset');
assert.equal(shifted.games.Club[0][0], 203, 'Schedules use the same offset');
assert.equal(shifted.fans['5004'][29], 17, 'Week 30 fan count remains week 30');
assert.equal(shifted.fans['5004'][0], 0, 'No invented historical fan counts');
assert.equal(empty.lines[0][2], 0, 'Do not mutate canonical ingestion lines');
assert.equal(rebaseBracketWeek(empty, 34).lines[0][2], 231, 'World Series offset');
assert.throws(() => rebaseBracketWeek(empty, 0), /Invalid scoring week/);
const writer = read('scripts/master-bracket-results.ts');
const scorer = read('src/components/bracket/liveSeason.ts');
assert.ok(writer.includes('selectScoringWeek(season.opening_day, season.weeks, asof, rows)'));
assert.ok(writer.includes('await fetchLive(opts.base, chosen.start, 1, fieldOf(rows))'), 'One-week fetch required');
assert.ok(!writer.includes('await fetchLive(opts.base, season.opening_day, Math.min(weeks, 40)'), 'No full season fetch');
assert.ok(writer.includes('const idx = buildIndex(season, rows, onlyWeek !== undefined)'), 'Locked games seed index');
assert.ok(writer.includes('saved ? (r.innings || []).map(Number) : []'), 'Stored innings never reconstructed');
assert.ok(writer.includes('saved ? r.winner_hsid : null'), 'Historical winner retained');
assert.ok(writer.includes('if (onlyWeek !== undefined && (g[1] !== onlyWeek || row.locked_at)) continue;'), 'Never rewrite locked results');
assert.ok(scorer.includes('if (onlyWeek !== undefined && (week !== onlyWeek || skipGameIds?.has(g[0]))) return;'), 'Engine skips old games');
assert.ok(writer.includes('if (out.results.some((result) => !result.lock)) break;'), 'Never skip an unfinalized backlog');
assert.ok(writer.includes('const { fills, decisions: more } = fillSlots(season, rows, results, clubs)'), 'Pairing still uses stored history');
assert.ok(writer.includes('WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.locked_at IS NULL'), 'DB lock defense retained');
console.log('PASS: bounded 2027 scoring window, week 30, week 34, missed-week recovery, immutable history, full-precision day alignment, locked-result guard.');
