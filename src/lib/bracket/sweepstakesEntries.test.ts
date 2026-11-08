import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arizonaDay, roundForDate, sweepstakesEntries, MAX_PER_ROUND } from './sweepstakesEntries';

test('rounds follow the 3-week bracket calendar', () => {
  assert.equal(roundForDate('2027-02-01'), 1);
  assert.equal(roundForDate('2027-02-21'), 1);
  assert.equal(roundForDate('2027-02-22'), 2);
  assert.equal(roundForDate('2027-08-29'), 10);
  assert.equal(roundForDate('2027-08-30'), 0);
  assert.equal(roundForDate('2027-01-31'), 0);
});

test('a Fan from opening day gets 1 a round, 10 total', () => {
  assert.equal(sweepstakesEntries({ registeredAt: '2027-01-15' }).total, 10);
});

test('a Fan who joins in round 10 still gets 1', () => {
  assert.equal(sweepstakesEntries({ registeredAt: '2027-08-20' }).total, 1);
});

test('a full-season Super Fan gets 3 a round, 30 total', () => {
  const weeks = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(sweepstakesEntries({ registeredAt: '2027-01-15', superFanWeeks: weeks }).total, 30);
});

test('a free Fan with 2 approved photos every round matches a Super Fan', () => {
  const photos = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(2027, 1, 1 + i * 21 + 3)).toISOString().slice(0, 10);
    return [d, d];
  }).flat();
  assert.equal(sweepstakesEntries({ registeredAt: '2027-01-15', bonusDates: photos }).total, 30);
});

test('photo bonus is capped at 2 a round', () => {
  const r = sweepstakesEntries({ registeredAt: '2027-01-15', bonusDates: Array(5).fill('2027-02-03') });
  assert.equal(r.rounds[0].bonus, 2);
  assert.equal(r.rounds[0].total, MAX_PER_ROUND);
});

test('paying never beats the free maximum: Super Fan photos add nothing', () => {
  const r = sweepstakesEntries({ registeredAt: '2027-01-15', superFanWeeks: [1, 2, 3], bonusDates: ['2027-02-03', '2027-02-04'] });
  assert.equal(r.rounds[0].total, 3);
});

test('a Super Fan for 1 week of a round can top up with 1 photo', () => {
  const r = sweepstakesEntries({ registeredAt: '2027-01-15', superFanWeeks: [1], bonusDates: ['2027-02-03', '2027-02-04'] });
  assert.equal(r.rounds[0].total, 3);
  assert.equal(r.rounds[0].bonus, 2);
});

test('timestamps use the Arizona date, not the UTC date', () => {
  // 10 PM Arizona, Sunday Feb 21 = 05:00Z Feb 22: still Round 1.
  assert.equal(arizonaDay('2027-02-22T05:00:00Z'), '2027-02-21');
  assert.equal(arizonaDay('2027-02-21T22:00:00-07:00'), '2027-02-21');
  assert.equal(sweepstakesEntries({ registeredAt: '2027-02-22T05:00:00Z' }).rounds[0].total, 1);
  assert.equal(sweepstakesEntries({ registeredAt: '2027-01-15', bonusDates: ['2027-02-22T05:00:00Z'] }).rounds[0].bonus, 1);
});

test('photos before registering or outside the bracket do not count', () => {
  assert.equal(sweepstakesEntries({ registeredAt: '2027-02-10', bonusDates: ['2027-02-02'] }).rounds[0].bonus, 0);
  assert.equal(sweepstakesEntries({ registeredAt: '2027-01-15', bonusDates: ['2027-09-10'] }).total, 10);
});
