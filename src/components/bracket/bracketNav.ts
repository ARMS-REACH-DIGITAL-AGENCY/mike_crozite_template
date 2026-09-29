// src/components/bracket/bracketNav.ts
// The Fantasy Bracket Tourney tab's filters, shared by row 3 (the region
// tiles and the leaderboard tile, in the shell) and row 5 (the tab's
// content). Like the News tab's headshots: a tile filters, the same tile
// again shows everything.

import { useSyncExternalStore } from 'react';

export type BracketNav = {
  region: number; // 0 = every region
  boards: boolean; // show the regional leaderboards
};

let state: BracketNav = { region: 0, boards: false };
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
