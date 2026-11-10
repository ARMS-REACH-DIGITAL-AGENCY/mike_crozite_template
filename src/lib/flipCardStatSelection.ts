// Shared, data-driven stat-family selection for every player flip card.
// This never changes stored player roles, statuses, affiliations or statistics.
export type FlipCardStatFamily = "batting" | "pitching";

export interface StatSourceBucket {
  type?: unknown;
  stats?: Record<string, unknown> | null;
}

function positive(value: unknown): number {
  if (value == null || String(value).trim() === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function familyEvidence(
  buckets: StatSourceBucket[],
  family: FlipCardStatFamily,
  fallback: { games?: unknown; appearances?: unknown } = {}
): { present: boolean; games: number } {
  let present = false;
  let games = 0;
  for (const bucket of buckets) {
    if (bucket.type && String(bucket.type).toLowerCase() !== family) continue;
    const row = bucket.stats;
    if (!row) continue;
    if (family === "batting") {
      const g = positive(row.g);
      const ab = positive(row.ab);
      const h = positive(row.h);
      present ||= g > 0 || ab > 0 || h > 0;
      games += g || (ab > 0 ? Math.max(1, ab / 4) : 0);
    } else {
      const g = positive(row.pg ?? row.g);
      const ip = positive(row.ip);
      const outs = positive(row.outs);
      present ||= g > 0 || ip > 0 || outs > 0 || positive(row.ko) > 0;
      games += g || (outs > 0 ? Math.max(1, outs / 9) : ip > 0 ? Math.max(1, ip / 3) : 0);
    }
  }
  // The flat row is used only where the structured buckets are missing.
  if (!buckets.length) {
    const g = positive(fallback.games);
    const other = positive(fallback.appearances);
    present ||= g > 0 || other > 0;
    games = g || (other > 0 ? Math.max(1, other / (family === "batting" ? 4 : 3)) : 0);
  }
  return { present, games };
}

export function primaryStatFamily(input: {
  position?: unknown;
  legacyIsPitcher?: boolean;
  battingGames: number;
  pitchingGames: number;
}): FlipCardStatFamily {
  const battingGames = positive(input.battingGames);
  const pitchingGames = positive(input.pitchingGames);
  if (pitchingGames <= 0 && battingGames > 0) return "batting";
  if (battingGames <= 0 && pitchingGames > 0) return "pitching";

  // A handful of games in a secondary role must not displace a player's
  // established role, even if a stale position or last-year flag says P.
  if (battingGames >= pitchingGames * 3 && battingGames - pitchingGames >= 5) return "batting";
  if (pitchingGames >= battingGames * 3 && pitchingGames - battingGames >= 5) return "pitching";

  const pos = String(input.position ?? "").toUpperCase().trim();
  const pitcher = /(?:^|[^A-Z])(?:P|SP|RP|LHP|RHP|PITCHER)(?:$|[^A-Z])/.test(pos);
  const hitter = /(?:^|[^A-Z])(?:C|1B|2B|3B|SS|IF|OF|LF|CF|RF|DH)(?:$|[^A-Z])/.test(pos);
  if (hitter && !pitcher) return "batting";
  if (pitcher && !hitter) return "pitching";
  if (battingGames !== pitchingGames) return battingGames > pitchingGames ? "batting" : "pitching";
  return input.legacyIsPitcher ? "pitching" : "batting";
}

export function orderByPrimaryStatFamily<T extends { family: FlipCardStatFamily }>(
  buckets: T[],
  primary: FlipCardStatFamily
): T[] {
  return [
    ...buckets.filter((bucket) => bucket.family === primary),
    ...buckets.filter((bucket) => bucket.family !== primary),
  ];
}
