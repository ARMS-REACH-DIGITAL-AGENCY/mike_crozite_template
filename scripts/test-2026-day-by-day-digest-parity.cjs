// Isolated replay contract. No database, API, or production writes.
// A future replay runner must supply these independently persisted records.
const assert = require('node:assert/strict');

function key(x) { return [x.season, x.date, x.gameId, x.schoolId].join('|'); }
function sameScore(a, b) {
  return a.runs === b.runs && a.status === b.status && a.revision === b.revision;
}
function reconcileDay({date, ledger, scoreboard, digest, drawers}) {
  const sources = {ledger, scoreboard, digest, drawers};
  for (const [name, rows] of Object.entries(sources)) {
    assert.ok(Array.isArray(rows), name + ' missing');
    assert.ok(rows.every(x => x.date === date), name + ' contains another day');
    assert.equal(new Set(rows.map(key)).size, rows.length, name + ' has duplicate game/school rows');
  }
  const authoritative = new Map(ledger.map(x => [key(x), x]));
  const failures = [];
  for (const [name, rows] of Object.entries({scoreboard, digest, drawers})) {
    const found = new Map(rows.map(x => [key(x), x]));
    for (const [k, row] of authoritative) {
      if (!found.has(k)) failures.push(name + ': missing ' + k);
      else if (!sameScore(row, found.get(k))) failures.push(name + ': mismatch ' + k);
    }
    for (const k of found.keys()) if (!authoritative.has(k)) failures.push(name + ': extra ' + k);
  }
  return {ok: failures.length === 0, failures, rows: authoritative.size};
}
function reconcileSeason(days, expectedDays) {
  assert.equal(days.length, expectedDays, 'Incomplete day-by-day replay');
  const dates = days.map(x => x.date);
  assert.equal(new Set(dates).size, dates.length, 'Duplicate replay date');
  assert.deepEqual(dates, [...dates].sort(), 'Replay dates not chronological');
  const results = days.map(reconcileDay);
  return {ok: results.every(x => x.ok), days: results.length,
    failures: results.flatMap((x, i) => x.failures.map(f => dates[i] + ': ' + f))};
}
module.exports = {reconcileDay, reconcileSeason};

if (require.main === module) {
  const row = {season:'2026', date:'2026-03-25', gameId:1, schoolId:2076,
    runs:1, status:'provisional', revision:1};
  const day = {date:row.date, ledger:[row], scoreboard:[{...row}],
    digest:[{...row}], drawers:[{...row}]};
  assert.equal(reconcileSeason([day],1).ok,true);
  assert.equal(reconcileDay({...day, digest:[{...row, runs:0}]}).ok,false,
    'Digest mismatch must fail');
  assert.equal(reconcileDay({...day, drawers:[]}).ok,false,
    'Missing stats drawer row must fail');
  assert.equal(reconcileDay({...day, ledger:[row,row]}).ok,false);
  assert.throws(() => reconcileSeason([day],2), /Incomplete/);
  assert.throws(() => reconcileSeason([day,day],2), /Duplicate/);
  console.log('PASS: daily ledger, scoreboard, drawer, digest parity contract');
}
