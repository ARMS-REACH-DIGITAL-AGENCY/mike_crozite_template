// src/components/bracket/bracketNav.ts
// The Fantasy Bracket Tourney tab's filters, shared by row 3 (the Round and
// Region chips, in the shell) and row 5 (the tab's content). A tiny store:
// row 3 writes the picks, row 5 publishes the school's defaults.

import { useSyncExternalStore } from 'react';
import type { Stage } from './gallery';

export type BracketNav = {
  stage: Stage | null; // null = the current stage
  region: number | null; // null = the school's region; 0 = all regions
  current: Stage | null; // the stage in progress on the preview date
  currentWeek: number; // the week in progress (stages after it are locked)
  homeRegion: number;
};

let state: BracketNav = { stage: null, region: null, current: null, currentWeek: 0, homeRegion: 0 };
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
