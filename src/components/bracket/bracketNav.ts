// src/components/bracket/bracketNav.ts
// The Fantasy Bracket Tourney tab's controls, shared by row 2 (flip all),
// row 3 (the region tiles and the leaderboard tile) and row 5 (the tab's
// content). Like the News tab's headshots: a tile filters, the same tile
// again shows everything.

import { useSyncExternalStore } from 'react';

export type BracketNav = {
  region: number; // 0 = every region
  boards: boolean; // show the regional leaderboards
  flipAll: boolean; // row 2's flip-all: every card to its back
  flipSeq: number; // bumps on each flip-all, so it overrides single flips
};

let state: BracketNav = { region: 0, boards: false, flipAll: false, flipSeq: 0 };
const listeners = new Set<() => void>();

export function setBracketNav(patch: Partial<BracketNav>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function toggleFlipAll() {
  setBracketNav({ flipAll: !state.flipAll, flipSeq: state.flipSeq + 1 });
}

export function useBracketNav() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
