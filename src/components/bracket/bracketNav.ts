// src/components/bracket/bracketNav.ts
// The Fantasy Bracket Tourney tab's controls, shared by row 2 (flip all),
// row 3 (this school's tile, the leaderboard and rules tiles, the region tiles) and row 5 (the tab's
// content). Like the News tab's headshots: a tile filters, the same tile
// again shows everything.

import { useSyncExternalStore } from 'react';

export const FANTASY_STAGE_KEYS = ['r1','r2','r3','r4','r5','r6','r7','r8','r9','r10','c1','c2','cg','yws'] as const;
export type FantasyStageKey = typeof FANTASY_STAGE_KEYS[number];

export function stageKeyForWeek(week:number):FantasyStageKey {
  const w=Math.max(1,Math.min(34,Math.floor(week||1)));
  if(w<=30)return `r${Math.ceil(w/3)}` as FantasyStageKey;
  if(w===31)return 'c1';
  if(w===32)return 'c2';
  if(w===33)return 'cg';
  return 'yws';
}

export type BracketNav = {
  team: boolean; // show this school's current round only
  region: number; // 0 = every region
  boards: boolean; // show the regional leaderboards
  rules: boolean; // show the rules and how everything is figured
  flipAll: boolean; // row 2's flip-all: every card to its back
  flipSeq: number; // bumps on each flip-all, so it overrides single flips
  // A school's fantasy page: row 3's timeline slide picks a week, row 5
  // scrolls to its card (focusSeq bumps so the same week can be picked again).
  focusWeek: number;
  focusSeq: number;
  // ... and row 5's round buttons slide row 3's timeline to a week.
  slideWeek: number;
  slideSeq: number;
  // Canonical Fantasy stage selection. Row 3 hero, Row 5 cards and the
  // bottom dock all subscribe to this single value so they can never drift.
  stageKey: string; // r1-r10, c1, c2, cg, yws
  stageSeq: number;
};

let state: BracketNav = { team: false, region: 0, boards: false, rules: false, flipAll: false, flipSeq: 0, focusWeek: 0, focusSeq: 0, slideWeek: 0, slideSeq: 0, stageKey: '', stageSeq: 0 };
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

export function focusWeek(week: number) {
  setBracketNav({ focusWeek: week, focusSeq: state.focusSeq + 1 });
}

export function slideToWeek(week: number) {
  setBracketNav({ slideWeek: week, slideSeq: state.slideSeq + 1 });
}

export function selectStage(stageKey: string) {
  if (!stageKey) return;
  setBracketNav({ stageKey, stageSeq: state.stageSeq + 1 });
}

export function useBracketNav() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
