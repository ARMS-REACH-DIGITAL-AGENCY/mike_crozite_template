// Browser loader for the shared, pure live scorer. The Tribune consumes the
// same scorer directly, so its normalized player lines and innings cannot drift.
import { scoreLiveIndex, type LivePayload } from '@/lib/bracket/scoreLive';
import type { GameBox, Index } from './gallery';
import { setLiveInning } from './schoolSeason';
import { setInAction } from './inAction';

let livePromise: Promise<{ live: LivePayload | null; boxes: Record<string, GameBox> }> | null = null;
let boxesResolve: ((b: Record<string, GameBox>) => void) | null = null;
const boxesPromise = new Promise<Record<string, GameBox>>((res) => { boxesResolve = res; });

// The live boxes, keyed by game id (every round shares one set).
export function liveBoxes() {
  return boxesPromise;
}

// Score every game of the index whose week has started, from live lines.
export function applyLive(idx: Index, asof: string) {
  if (!livePromise) {
    const start = idx.weeks[0][0];
    const hsids = Object.keys(idx.schools);
    const started = idx.weeks.filter(([a]) => a <= asof).length;
    livePromise = (started
      ? fetch(`/api/bracket/live?start=${start}&weeks=${started}&h=${hsids.join(',')}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() as Promise<LivePayload> : null))
        .catch(() => null)
      : Promise.resolve(null))
      .then((live) => {
        const scored = live ? scoreLiveIndex(idx, live, asof, {
          onInning: setLiveInning,
          onInAction: setInAction,
        }) : null;
        // Keep loadIndex's object identity while the pure scorer owns its copy.
        if (scored) Object.assign(idx, scored.index);
        const boxes = scored?.boxes || {};
        boxesResolve?.(boxes);
        return { live, boxes };
      });
  }
  return livePromise.then(() => idx);
}
