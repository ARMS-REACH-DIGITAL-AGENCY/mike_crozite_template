// A source game missing from a date-window query may have been rescheduled.
// Check its schedule key before treating it as a genuinely off-schedule game.
export type ScheduleFact = { game: string; day: number; status: string | null; game_type?: string | null };
export type ScheduleState = { done: boolean; final: boolean; inWindow: boolean; eligible: boolean };
const text = (value: unknown) => String(value ?? '').trim();
export const isBracketGameDone = (status: unknown) =>
  /^(final|game over|completed|postponed|cancelled|canceled|suspended|not necessary)/i.test(text(status));
export const isBracketGameFinal = (status: unknown) => /^(final|game over|completed)/i.test(text(status));
// The schedule includes spring training, exhibitions, intrasquad and All-Star
// games; the player game-log feed excludes them. Apply the same distinction
// to club results and completion checks. A missing type is still allowed for
// older records and non-MLB sources that do not use MLB's gameType codes.
const NON_TOURNAMENT_TYPES = ['S', 'E', 'I', 'A'] as const;
export const isBracketGameType = (gameType: unknown) =>
  !NON_TOURNAMENT_TYPES.some(type => type === text(gameType).toUpperCase());

/** Same policy for canonical publication SQL. Only call with a trusted,
 * static SQL column expression; never interpolate a user value here. */
export const bracketGameTypeSql = (column: string) =>
  `coalesce(${column}, '') !~* '^[[:space:]]*(${NON_TOURNAMENT_TYPES.join('|')})[[:space:]]*

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
`;

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
