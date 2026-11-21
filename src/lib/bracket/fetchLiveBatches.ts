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
  for (let i = 0; i < hsids.length; i += BRACKET_LIVE_BATCH_SIZE) {
    const batch = hsids.slice(i, i + BRACKET_LIVE_BATCH_SIZE);
    const params = new URLSearchParams({ start, weeks: String(weeks), h: batch.join(',') });
    const url = `${base}/api/bracket/live?${params}`;
    const response = await request(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Bracket live batch ${i / BRACKET_LIVE_BATCH_SIZE + 1}: HTTP ${response.status}`);

    const part = await response.json() as Live;
    if (!part || !part.roster || !Array.isArray(part.lines) || !part.clubs) {
      throw new Error(`Bracket live batch ${i / BRACKET_LIVE_BATCH_SIZE + 1}: invalid response`);
    }
    // The server explicitly returns [] for schools with no active alumni.
    // Checking every requested key means missing/truncated schools fail loudly.
    const missing = batch.filter((id) => !Object.prototype.hasOwnProperty.call(part.roster, id));
    if (missing.length) {
      throw new Error(`Bracket live batch ${i / BRACKET_LIVE_BATCH_SIZE + 1}: missing school IDs ${missing.join(',')}`);
    }
    mergeBracketLive(combined, part);
  }
  if (Object.keys(combined.roster).length !== hsids.length) {
    throw new Error(`Incomplete bracket roster coverage: ${Object.keys(combined.roster).length}/${hsids.length}`);
  }
  return combined;
}
