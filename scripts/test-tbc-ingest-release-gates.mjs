import assert from 'node:assert/strict';
import { evaluateTbcPrePromotionGate, evaluateTbcPostPromotionGate } from './lib/tbc-ingest-release-gates.mjs';

const now = new Date('2026-11-04T20:00:00Z');
const fixture = {
  capture: {
    uniqueIds: 208427, sourceRows: 208427, savedRows: 208427,
    uniqueSaved: 208427, quarantinedRows: 3, capturedAt: '2026-11-04T19:00:00Z',
  },
  crosswalk: { unmatched: 848, ambiguous: 715 },
  season: { coverageReviewed: false },
  production: {
    sourceMissingRaw: 83492, sourceMissingCards: 84154,
    cardsWithoutHSID: 2, cardHSIDMismatches: 15,
    cardsWithoutStatus: 350, cardsWithoutLevel: 46932,
  },
};
const failing = evaluateTbcPrePromotionGate(fixture, { now });
assert.equal(failing.ready, false);
assert.ok(failing.blockers.length >= 5);
assert.equal(failing.sideEffects, 'none');
console.log('PASS: present 208K feed is NOT approved for bulk production release');

const verified = evaluateTbcPrePromotionGate({
  ...fixture, crosswalk: { unmatched: 0, ambiguous: 0 },
  capture: { ...fixture.capture, quarantinedRows: 0 },
  season: { coverageReviewed: true },
}, { now, performanceApproved: true, functionalParityApproved: true, rollbackVerified: true });
assert.equal(verified.ready, true);
console.log('PASS: complete, fresh, verified source + approvals satisfies pre-promotion gate');

const incomplete = evaluateTbcPrePromotionGate({
  ...fixture, capture: { ...fixture.capture, uniqueIds: 101081, sourceRows: 101081, savedRows: 101081, uniqueSaved: 101081 },
}, { now, performanceApproved: true, functionalParityApproved: true, rollbackVerified: true, mappingExceptionsApproved: true });
assert.equal(incomplete.ready, false);
assert.ok(incomplete.checks.some(x => x.label === 'complete-source-identities' && !x.passed));
console.log('PASS: 101081-player false success is blocked');

const post = evaluateTbcPostPromotionGate(fixture);
assert.equal(post.ready, false);
const complete = evaluateTbcPostPromotionGate({
  production: {
    sourceMissingRaw: 0, sourceMissingCards: 0, cardsWithoutHSID: 0,
    cardHSIDMismatches: 0, cardsWithoutStatus: 0, cardsWithoutLevel: 0,
  },
});
assert.equal(complete.ready, true);
console.log('PASS: post-promotion card/HSID/status/level completeness verified separately');

for (const key of ['uniqueIds','sourceRows','savedRows','uniqueSaved']) {
  const corrupted = structuredClone(fixture);
  corrupted.capture[key] = null;
  assert.equal(evaluateTbcPrePromotionGate(corrupted, { now }).ready, false);
}
assert.equal(evaluateTbcPostPromotionGate({production:{}}).ready,false);
console.log('PASS: missing metrics never accidentally count as zero or pass');
