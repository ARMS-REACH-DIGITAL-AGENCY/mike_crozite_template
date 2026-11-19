// PIPELINE: which real team a player was on, day by day, for the W-L inning
// (Pete, Nov 19 2026).
//
// A player's W-L is his real team's record, credited whether he played or
// not, day by day: each day counts for the team he was on THAT day. The
// latest real evidence on or before that day wins (Pete: the newest MLB
// evidence replaces an older one; released Oct 1, signed Oct 30 = the new
// team from Oct 30). Evidence, never a guess:
//   - a game line that day or before (the team on the line);
//   - MLB's daily roster check (player_team_days): the team he plays for;
//   - an MLB transaction (player_transactions): a move to a team, or a
//     release / free agency / retirement (no team, so the day counts 0-0).
//     An injured-list, return-from-rehab, number-change or DFA entry says he
//     is on that team; the All-Star Game entry is never a team.
// On the same day: a game line, then a transaction, then the roster check.
// With nothing on or before the day: his first move after it says where he
// came from (a trade from the Brewers = a Brewer before it), else the first
// line or roster check after it; with no evidence at all, his listed team.
// A day's result is only ever MLB's final score for that team (the live
// route), never made up: a team with no final that day counts 0-0.

// [day, from, to]: day counted from the bracket's start (negative = before
// it). to = '' when he left with no new team.
export type Move = [number, string, string];
// [day, team]: MLB's roster check that day.
export type Seen = [number, string];

// MLB transaction types (player_transactions.transaction_type) after which
// the player has no team. MLB lists the old team as "to" on these, so they
// must not be read as a move to that team.
const LEAVES = new Set(['released', 'declared free agency', 'retired']);
// Types that keep him on the listed team: they are evidence of his team, not a
// move between teams (a return from a rehab assignment is a Status Change).
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
  // The All-Star Game is logged as a move to "American League All-Stars": his
  // team doesn't change (his stats from the game count; Pete, Nov 19 2026).
  if (!dest || /all-stars?\b/i.test(dest)) return null;
  if (STAYS.has(t)) return [day, dest, dest];
  return [day, f, dest];
}

type Evidence = { day: number; club: string; rank: number; from?: string };

/** The team he was on that day ('' = none). */
export function clubOnDay(day: number, lineClubs: Map<number, string>, moves: Move[], listedClub: string, seen: Seen[] = []): string {
  const ev: Evidence[] = [];
  for (const [d, club] of lineClubs) if (club) ev.push({ day: d, club, rank: 3 });
  moves.forEach(([d, from, to]) => ev.push({ day: d, club: to, rank: 2, from }));
  for (const [d, club] of seen) if (club) ev.push({ day: d, club, rank: 1 });
  // Latest on or before the day; same day: higher rank, then the later move.
  let best: Evidence | null = null;
  for (const e of ev) {
    if (e.day > day) continue;
    if (!best || e.day > best.day || (e.day === best.day && e.rank >= best.rank)) best = e;
  }
  if (best) return best.club;
  // Nothing before it: the first evidence after it (a move says where he
  // came from; on the same day a move comes first, and the first move counts).
  let next: Evidence | null = null;
  for (const e of ev) {
    if (e.day <= day) continue;
    if (!next || e.day < next.day || (e.day === next.day && e.rank === 2 && next.rank !== 2)) next = e;
  }
  if (next) return next.rank === 2 ? next.from || '' : next.club;
  return listedClub;
}
