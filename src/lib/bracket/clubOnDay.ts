// PIPELINE: which real team a player was on, day by day, for the W-L inning
// (Pete, Nov 19 2026).
//
// A player's W-L is his real team's record, credited whether he played or
// not, day by day: each day counts for the team he was on THAT day. A
// player traded on Wednesday gets his old team's Monday and Tuesday and his
// new team's Wednesday on. Only real evidence decides the team, never a
// guess:
//   1. he has a game line that day: the team on that line;
//   2. else his latest evidence on or before that day: a game line, or an MLB
//      transaction (released, free agency or retirement: no team, so that day
//      counts 0-0);
//   3. else his first evidence after that day: a move's "from" team (a trade
//      from the Brewers means he was a Brewer before it), or a game line's
//      team;
//   4. else his listed team (the card's, set from MLB's own roster).
// A day's result is only ever MLB's final score for that team (the live
// route), never made up: a team with no final that day counts 0-0.

// [day, from, to]: day counted from the bracket's start (negative = before
// it). to = '' when he left with no new team.
export type Move = [number, string, string];

// MLB transaction types (player_transactions.transaction_type) after which
// the player has no team. MLB lists the old team as "to" on these, so they
// must not be read as a move to that team.
const LEAVES = new Set(['released', 'declared free agency', 'retired']);
// Types that never change the team: the player stays where he was.
const STAYS = new Set(['status change', 'number change', 'designated for assignment', 'suspension']);

/**
 * A transaction as a move, or null when it doesn't change the team.
 * Every other type (assigned, optioned, recalled, selected, outrighted,
 * trade, claimed, signed, acquired, returned, ...) moves him to "to".
 */
export function moveOf(day: number, type: string, from: string | null, to: string | null): Move | null {
  const t = String(type || '').trim().toLowerCase();
  const f = String(from || '').trim();
  const dest = String(to || '').trim();
  if (LEAVES.has(t)) return [day, dest || f, ''];
  if (STAYS.has(t)) return dest ? [day, dest, dest] : null;
  if (!dest) return null;
  return [day, f, dest];
}

/** The team he was on that day ('' = none). */
export function clubOnDay(day: number, lineClubs: Map<number, string>, moves: Move[], listedClub: string): string {
  const played = lineClubs.get(day);
  if (played) return played;
  // Evidence before or on the day; a game line beats a move on the same day.
  let best: { day: number; club: string; line: boolean } | null = null;
  for (const [d, club] of lineClubs) {
    if (d < day && club && (!best || d > best.day || (d === best.day && !best.line))) best = { day: d, club, line: true };
  }
  for (const [d, , to] of moves) {
    if (d <= day && (!best || d > best.day || (d === best.day && !best.line))) best = { day: d, club: to, line: false };
  }
  if (best) return best.club;
  // Nothing before it: where his first move says he came from.
  // (On the same day a move beats a game line, and the first move counts.)
  let next: { day: number; club: string; move: boolean } | null = null;
  for (const [d, club] of lineClubs) if (d > day && club && (!next || d < next.day)) next = { day: d, club, move: false };
  for (const [d, from] of moves) {
    if (d > day && (!next || d < next.day || (d === next.day && !next.move))) next = { day: d, club: from, move: true };
  }
  if (next) return next.club;
  return listedClub;
}
