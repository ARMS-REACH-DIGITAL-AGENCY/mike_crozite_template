// The bracket pages' data, prepared on the server (/api/bracket/prepared,
// lib/bracket/preparedIndex.ts): the Index exactly as the pages draw it, the
// stat drawers' boxes, the knocked-out schools' games and where each week in
// progress stands. The browser only shows it - it scores nothing (this
// replaces the static index.json plus live scoring in liveSeason.ts).
import type { GameBox, Index, LbGame } from './gallery';
import type { Prepared } from '@/lib/bracket/preparedIndex';
import { setLiveInning } from './schoolSeason';

let resolveExtras: ((v: { boxes: Record<string, GameBox>; lb: LbGame[] }) => void) | null = null;
const extras = new Promise<{ boxes: Record<string, GameBox>; lb: LbGame[] }>((res) => { resolveExtras = res; });
export const preparedBoxes = () => extras.then((x) => x.boxes);
export const preparedLb = () => extras.then((x) => x.lb);

export function loadPreparedIndex(season: string, region: number): Promise<Index> {
  return fetch(`/api/bracket/prepared?season=${encodeURIComponent(season)}&region=${region}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() as Promise<Prepared> : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((p) => {
      for (const [gameId, day, phase] of p.live) setLiveInning(gameId, day, phase);
      resolveExtras?.({ boxes: p.boxes, lb: p.lb });
      return p.index;
    });
}
