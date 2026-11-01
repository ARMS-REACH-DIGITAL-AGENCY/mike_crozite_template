'use client';

/**
 * Player season statistics are also required by the visible career timeline.
 * Share its actual response with the Stats tab instead of issuing a second
 * historical query when the fan opens Stats. No invented rows or transforms.
 *
 * A short client-side cache is intentionally per browser session, not a
 * substitute for the approved database staging refresh.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_PLAYERS = 64;

async function fetchPlayerSeasonStats(playerId: string) {
  const response = await fetch(
    `/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`,
    { cache: 'no-store' }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Player season stats unavailable: ${response.status}`);
  }
  return data;
}

type SeasonRequest = {
  createdAt: number;
  promise: ReturnType<typeof fetchPlayerSeasonStats>;
};

const requests = new Map<string, SeasonRequest>();

export function getSharedPlayerSeasonStats(playerId: string) {
  const now = Date.now();
  const current = requests.get(playerId);
  if (current && now - current.createdAt < TTL_MS) return current.promise;

  const promise = fetchPlayerSeasonStats(playerId);
  requests.set(playerId, { createdAt: now, promise });

  // A failed request must not poison retries. Never manufacture an empty
  // season response on failure; let each consumer display its actual error.
  void promise.catch(() => {
    if (requests.get(playerId)?.promise === promise) requests.delete(playerId);
  });

  if (requests.size > MAX_PLAYERS) {
    const oldest = requests.keys().next().value;
    if (oldest && oldest !== playerId) requests.delete(oldest);
  }
  return promise;
}
