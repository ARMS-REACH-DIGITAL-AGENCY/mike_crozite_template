import type { IdentityVerdict } from "./player-identity";

type AuditLink = {
  verdict: IdentityVerdict;
  status_label?: string | null;
};

// An incomplete historical source record is not a wrong-person match.
// Keep identityVerdict unchanged: only confirmed links are confirmed.
// In particular, do not feed unverified rows into the rejection/cleanup path.
export function classifyAuditLinks<T extends AuditLink>(links: readonly T[]) {
  const confirmed = links.filter((l) => l.verdict === "confirmed");
  const review = links.filter((l) => l.verdict === "review");
  const conflicts = links.filter((l) => l.verdict === "conflict");
  const unverified = links.filter((l) => l.verdict === "unverified");
  const isActive = (l: T) => (l.status_label ?? "").trim().toUpperCase() === "ACTIVE";
  const activeUnverified = unverified.filter(isActive);
  const otherUnverified = unverified.filter((l) => !isActive(l));
  return { confirmed, review, conflicts, unverified, activeUnverified, otherUnverified };
}

// A real conflict blocks a report-only run. An ACTIVE unresolved identity
// remains blocking even on --apply because that action cannot safely fix it.
// Infrastructure errors are still handled by the caller's exception path.
export function auditHasBlockingFindings({
  apply, conflicts, activeUnverified,
}: { apply: boolean; conflicts: readonly AuditLink[]; activeUnverified: readonly AuditLink[] }): boolean {
  return (!apply && conflicts.length > 0) || activeUnverified.length > 0;
}
