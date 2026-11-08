// src/lib/bracket/sweepstakesEntries.ts
// Fall Classic Tickets Sweepstakes: how many entries a registered fan of the
// Bracket Champion has. Counted once, after entries close (11:59 PM Arizona,
// Sep 26, 2027), from data we already keep:
//   - registeredAt: when the fan registered (Fan or Super Fan)
//   - superFanWeeks: tournament weeks (1-30) the paid Super Fan plan was active
//   - bonusDates: dates of the fan's approved high school player photos
//     (media_upload, status 'approved') and any free mail-in requests
//
// Rule (Nov 2026, pending the lawyer's review of the Official Rules): every
// fan can reach the same 3 entries a round. Paying is a shortcut, never better
// odds. Per bracket round:
//   - a registered Fan gets 1 entry
//   - each approved photo or mail-in request adds 1, at most 2 a round
//   - a Super Fan week counts 1, and a round never exceeds 3 entries
// Lucky Fan nominations (1 entry each) are added separately.
import { TOURNAMENT_2027, TOURNAMENT_2027_WEEKS, bracketRoundWeeks } from './tournamentCalendar';

export const ROUNDS = 10;
export const BASE_PER_ROUND = 1;
export const BONUS_CAP_PER_ROUND = 2;
export const MAX_PER_ROUND = BASE_PER_ROUND + BONUS_CAP_PER_ROUND;
export const ENTRIES_CLOSE = `${TOURNAMENT_2027.end}T23:59:59-07:00`; // Arizona, no DST

export type FanEntryInput = {
  registeredAt: string;          // ISO date or timestamp
  superFanWeeks?: number[];      // tournament weeks 1-30
  bonusDates?: string[];         // approved photo / mail-in dates (ISO)
};

export type RoundEntries = { round: number; base: number; superFan: number; bonus: number; total: number };

const day = (iso: string) => String(iso).slice(0, 10);

/** The bracket round (1-10) a date falls in, or 0 outside the bracket weeks. */
export function roundForDate(iso: string): number {
  const d = day(iso);
  for (let r = 1; r <= ROUNDS; r++) {
    const [first, last] = bracketRoundWeeks(r);
    if (d >= TOURNAMENT_2027_WEEKS[first - 1][0] && d <= TOURNAMENT_2027_WEEKS[last - 1][1]) return r;
  }
  return 0;
}

export function sweepstakesEntries(input: FanEntryInput): { rounds: RoundEntries[]; total: number } {
  const registered = day(input.registeredAt);
  const weeks = new Set((input.superFanWeeks || []).filter((w) => Number.isInteger(w)));
  const bonusByRound = new Map<number, number>();
  for (const d of input.bonusDates || []) {
    if (`${day(d)}` < registered) continue; // only after registering
    const r = roundForDate(d);
    if (r) bonusByRound.set(r, (bonusByRound.get(r) || 0) + 1);
  }

  const rounds: RoundEntries[] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const [first, last] = bracketRoundWeeks(r);
    const roundEnd = TOURNAMENT_2027_WEEKS[last - 1][1];
    if (registered > roundEnd) { rounds.push({ round: r, base: 0, superFan: 0, bonus: 0, total: 0 }); continue; }
    let superFan = 0;
    for (let w = first; w <= last; w++) if (weeks.has(w)) superFan++;
    // A Super Fan week replaces the Fan entry; it is never added on top of it.
    const paid = Math.max(BASE_PER_ROUND, superFan);
    const base = paid === superFan && superFan > 0 ? 0 : BASE_PER_ROUND;
    const room = MAX_PER_ROUND - paid;
    const bonus = Math.min(BONUS_CAP_PER_ROUND, room, bonusByRound.get(r) || 0);
    rounds.push({ round: r, base, superFan: base ? 0 : superFan, bonus, total: paid + bonus });
  }
  return { rounds, total: rounds.reduce((n, x) => n + x.total, 0) };
}
