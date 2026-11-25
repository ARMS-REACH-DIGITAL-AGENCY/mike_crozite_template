import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyAuditLinks, auditHasBlockingFindings } from "./mlb-audit-policy";
import { identityVerdict } from "./player-identity";

test("historical absence of a birthdate and birthplace is unverified, not conflict", () => {
  const verdict = identityVerdict({ borndate: null, place: "Mobile,AL" }, { birthDate: null, birthCity: null });
  assert.equal(verdict, "unverified");
  const result = classifyAuditLinks([{ verdict, status_label: "RETIRED" }]);
  assert.equal(result.unverified.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.otherUnverified.length, 1);
  assert.equal(auditHasBlockingFindings({ apply: false, ...result }), false);
  assert.equal(auditHasBlockingFindings({ apply: true, ...result }), false);
});

test("an unresolved ACTIVE player remains a blocking audit finding even with apply", () => {
  const result = classifyAuditLinks([{ verdict: "unverified", status_label: " active " }]);
  assert.equal(result.activeUnverified.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.equal(auditHasBlockingFindings({ apply: false, ...result }), true);
  assert.equal(auditHasBlockingFindings({ apply: true, ...result }), true);
});

test("genuine conflicting identity stays actionable; ambiguous review does not", () => {
  const conflict = identityVerdict({ borndate: "4/15/2005", place: "Atlanta,GA" },
    { birthDate: "1995-02-03", birthCity: "Boston", birthStateProvince: "MA" });
  const review = identityVerdict({ borndate: "4/15/2005", place: "Atlanta,GA" },
    { birthDate: "2005-04-16", birthCity: "Atlanta", birthStateProvince: "GA" });
  const result = classifyAuditLinks([{ verdict: conflict }, { verdict: review }, { verdict: "confirmed" }]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.review.length, 1);
  assert.equal(result.confirmed.length, 1);
  assert.equal(auditHasBlockingFindings({ apply: false, ...result }), true);
  assert.equal(auditHasBlockingFindings({ apply: true, ...result }), false);
});

test("production audit uses only conflicts for rejection, and joins by YAT ID", () => {
  const script = readFileSync("scripts/audit-mlb-player-links.ts", "utf8");
  assert.match(script, /LEFT JOIN public\.flip_card_front_stage f ON f\.yatid = l\.yatid/);
  assert.match(script, /const rejected = conflicts;/);
  assert.match(script, /for \(const l of rejected\) \{[\s\S]*?yat_reject_link/);
  assert.match(script, /auditHasBlockingFindings\(\{ apply, conflicts, activeUnverified \}\)/);
  assert.doesNotMatch(script, /const rejected = .*unverified/);
});
