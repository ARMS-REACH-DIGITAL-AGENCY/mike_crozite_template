// Shared 2027 tournament live-data transport. Keep the API's 64-school query
// budget, but never silently omit schools from a 1,024-school field request.
// Used by both the public scoreboard and the authoritative results job.
import type { Live } from '@/components/bracket/liveSeason';

export const BRACKET_LIVE_BATCH_SIZE = 64;

function mergeGameLists(
  target: Record<string, [number, string, 0 | 1, number?][]>
    | Record<string, [number, string, 0 | 1, (0 | 1)?, number?][]>,
  source: Record<string, unknown[][]>,
) {
  for (const [club, rows] of Object.entries(source)) {
    const prior = (target as Record<string, unknown[][]>)[club] || [];
    const seen = new Set(prior.map((row) => String(row[1])));
    for (const row of rows) {
      if (seen.has(String(row[1]))) continue;
      prior.push(row);
      seen.add(String(row[1]));
    }
    (target as Record<string, unknown[][]>)[club] = prior;
  }
}

export function mergeBracketLive(into: Live, part: Live): void {
  into.asOf ||= part.asOf;
  Object.assign(into.roster, part.roster);
  into.lines.push(...part.lines);
  Object.assign(into.fans ||= {}, part.fans || {});
  mergeGameLists(into.clubs, part.clubs || {});
  mergeGameLists(into.games ||= {}, part.games || {});
}

export async function fetchBracketLiveBatches(
  base: string,
  start: string,
  weeks: number,
  schoolIds: readonly (string | number)[],
  request: typeof fetch = fetch,
): Promise<Live> {
  const hsids = [...new Set(schoolIds.map(String))];
  if (!hsids.length) throw new Error('Cannot request bracket live data without schools');

  const combined: Live = {
    asOf: '', roster: {}, lines: [], clubs: {}, games: {}, fans: {},
  };
  // Bounded requests and bounded concurrency keep a slow provider from
  // hanging a full 1,024-school simulation. Preserve merge order.
  const batches: string[][] = [];
  for (let i = 0; i < hsids.length; i += BRACKET_LIVE_BATCH_SIZE) {
    batches.push(hsids.slice(i, i + BRACKET_LIVE_BATCH_SIZE));
  }
  const results: Live[] = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      const batch = batches[i];
      const params = new URLSearchParams({ start, weeks: String(weeks), h: batch.join(',') });
      const url = `${base}/api/bracket/live?${params}`;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await request(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const part = await response.json() as Live;
          if (!part || !part.roster || !Array.isArray(part.lines) || !part.clubs) {
            throw new Error('invalid live-data response');
          }
          const missing = batch.filter((id) => !Object.prototype.hasOwnProperty.call(part.roster, id));
          if (missing.length) throw new Error(`missing school IDs ${missing.join(',')}`);
          results[i] = part;
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        throw new Error(`Bracket live batch ${i + 1}/${batches.length} failed after 2 tries: ${String(lastError)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
  for (const part of results) mergeBracketLive(combined, part);
  if (Object.keys(combined.roster).length !== hsids.length) {
    throw new Error(`Incomplete bracket roster coverage: ${Object.keys(combined.roster).length}/${hsids.length}`);
  }
  return combined;
}
