// src/components/bracket/bracketNav.ts
// The Fantasy Bracket Tourney tab's filters, shared by row 3 (the round and
// region tiles, in the shell) and row 5 (the tab's content). Like the News
// tab's headshots: a tile filters, the same tile again shows everything.

import { useSyncExternalStore } from 'react';
import type { Stage } from './gallery';

export type BracketNav = {
  stage: Stage | null; // null = every round
  region: number; // 0 = every region
  current: Stage | null; // the stage in progress on the preview date
  currentWeek: number; // the week in progress (later stages are locked)
};

let state: BracketNav = { stage: null, region: 0, current: null, currentWeek: 0 };
const listeners = new Set<() => void>();

export function setBracketNav(patch: Partial<BracketNav>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useBracketNav() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
