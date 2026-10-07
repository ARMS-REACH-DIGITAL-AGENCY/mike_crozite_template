// "In action today" for a school's stat drawer: how many of its alumni have a
// game today and when those games start, from the live schedule. Live scoring
// (when there is any) fills it in; with nothing filled in, nobody is playing.
export type InAction = {
  players: number; // alumni with a game today (or a line from one)
  games: number; // their real games today
  started: number; // ... under way or over
  done: number; // ... over
  first?: number; // earliest first pitch (ms)
  next?: number; // the next first pitch still to come (ms)
  last?: number; // the last game's first pitch (ms)
};

const today = new Map<number, InAction>();
export function setInAction(hsid: number, info: InAction) {
  today.set(hsid, info);
}
export function inActionToday(hsid: number) {
  return today.get(hsid);
}
