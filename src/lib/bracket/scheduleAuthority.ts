// A source game missing from a date-window query may have been rescheduled.
// Check its schedule key before treating it as a genuinely off-schedule game.
export type ScheduleFact = { game: string; day: number; status: string | null; game_type?: string | null };
export type ScheduleState = { done: boolean; final: boolean; inWindow: boolean; eligible: boolean };
const text = (value: unknown) => String(value ?? '').trim();
export const isBracketGameDone = (status: unknown) =>
  /^(final|game over|completed|postponed|cancelled|canceled|suspended|not necessary)/i.test(text(status));
export const isBracketGameFinal = (status: unknown) => /^(final|game over|completed)/i.test(text(status));
// Fantasy rule (Pete, Nov 27 2026): spring training (S) and exhibition
// games (E) count inside the tournament calendar, including actual club
// outcomes and batting/pitching. This is NOT the official career or
// regular-season statistics filter. Intrasquad and All-Star remain excluded.
// Missing types remain supported for older and non-MLB sources.
export const isBracketGameType = (gameType: unknown) => !/^(I|A)$/i.test(text(gameType));

export function missingScheduleGameIds(sourceIds: readonly string[], scheduleIds: readonly string[]): string[] {
  const known = new Set(scheduleIds);
  // team_schedules uses MLB's numeric game_pk. Preserve other source keys
  // as off-schedule inputs; never cast them into the indexed bigint lookup.
  return [...new Set(sourceIds)].filter(id => /^\d+$/.test(id) && !known.has(id));
}

export function scheduleAuthority(rows: readonly ScheduleFact[], days: number): Map<string, ScheduleState> {
  return new Map(rows.map(row => [row.game, {
    done: isBracketGameDone(row.status), final: isBracketGameFinal(row.status),
    inWindow: Number(row.day) >= 0 && Number(row.day) < days,
    eligible: isBracketGameType(row.game_type),
  }]));
}

export function allowClubResultFallback(state: ScheduleState | undefined): boolean {
  return !state || (state.eligible && state.inWindow && state.final);
}
