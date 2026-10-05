// Live scoring for the 6 October test brackets (src/lib/bracket/testBrackets.ts).
// Real game lines only: player_game_logs (the 10-minute MLB feed, which also
// carries the Arizona Fall League), scored with the bracket engine. Round 1,
// Game 1 = Mon Oct 5 - Sun Oct 11, 2026; innings 1-7 are the days, 8 the
// week, 9 the alumni's real clubs' W-L (isWin on each game line).
//
// Scoring mode: 'raw' (OPS vs .720, FIP vs 4.20) until the level baselines
// are loaded; the engine call is the same either way.
import 'server-only';
import { query } from '@/lib/db';
import {
  addToBuckets, bracketOrder, emptyBat, emptyPit, playGame,
  type BatTotals, type GameResult, type PitTotals, type PlayerLines, type SideWeek,
} from '@/lib/bracket/engine';
import { TEST_BRACKETS } from '@/lib/bracket/testBrackets';

export const TEST_WEEK = { start: '2026-10-05', end: '2026-10-11', label: 'Round 1 · Game 1' };
const RULES = { mode: 'raw' as const, absent: 'hold' as const };
const LEVEL = 'PRO';

type Row = { playerid: string; hsid: string; name: string; stat_type: string; day: number; stats: Record<string, unknown>; is_win: boolean | null; game: string; team: string | null };

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
function outsFromIp(ip: unknown) {
  const [w, f] = String(ip ?? '0').split('.');
  return n(w) * 3 + n(f);
}
const batOf = (s: Record<string, unknown>): BatTotals => ({
  pa: n(s.plateAppearances), ab: n(s.atBats), h: n(s.hits), d2: n(s.doubles), d3: n(s.triples),
  hr: n(s.homeRuns), bb: n(s.baseOnBalls), hbp: n(s.hitByPitch), sf: n(s.sacFlies),
});
const pitOf = (s: Record<string, unknown>): PitTotals => ({
  outs: outsFromIp(s.inningsPitched), hr: n(s.homeRuns), bb: n(s.baseOnBalls), hbp: n(s.hitByPitch), so: n(s.strikeOuts),
});

export type PlayerDay = { name: string; team: string | null; line: string; day: number; type: string };
export type Matchup = { home: [number, string, number]; away: [number, string, number]; result: GameResult; players: Record<number, PlayerDay[]> };

export async function loadTestBrackets(): Promise<{ brackets: Matchup[][]; lines: number; asOf: string }> {
  const hsids = Array.from(new Set(TEST_BRACKETS.flat().map(([h]) => String(h))));
  const { rows } = await query<Row>(
    `SELECT DISTINCT ON (gl.playerid, gl.source_game_id, gl.stat_type)
            gl.playerid::text AS playerid, f.hsid::text AS hsid, f.display_name AS name, gl.stat_type,
            (gl.game_date::date - $2::date) AS day, gl.stats, (gl.raw_payload->>'isWin')::boolean AS is_win,
            gl.source_game_id::text AS game, gl.team_name AS team
       FROM player_game_logs gl
       JOIN flip_card_front_stage f ON f.playerid::text = gl.playerid::text
      WHERE f.hsid::text = ANY($1) AND gl.game_date BETWEEN $2::date AND $3::date
      ORDER BY gl.playerid, gl.source_game_id, gl.stat_type, gl.updated_at DESC`,
    [hsids, TEST_WEEK.start, TEST_WEEK.end]
  );

  // Per school: 7 days of player lines, W-L, and who played.
  const days = new Map<string, PlayerLines[]>();
  const wl = new Map<string, { w: number; l: number; seen: Set<string> }>();
  const who = new Map<string, PlayerDay[]>();
  for (const r of rows) {
    const d = Number(r.day);
    if (d < 0 || d > 6) continue;
    const week = days.get(r.hsid) || Array.from({ length: 7 }, () => new Map());
    days.set(r.hsid, week);
    const buckets = week[d].get(r.playerid) || new Map();
    week[d].set(r.playerid, buckets);
    if (r.stat_type === 'batting') addToBuckets(buckets, LEVEL, batOf(r.stats), emptyPit());
    else if (r.stat_type === 'pitching') addToBuckets(buckets, LEVEL, emptyBat(), pitOf(r.stats));
    const rec = wl.get(r.hsid) || { w: 0, l: 0, seen: new Set<string>() };
    wl.set(r.hsid, rec);
    const key = `${r.playerid}:${r.game}`;
    if (r.is_win !== null && !rec.seen.has(key)) { rec.seen.add(key); if (r.is_win) rec.w++; else rec.l++; }
    const list = who.get(r.hsid) || [];
    who.set(r.hsid, list);
    list.push({ name: r.name, team: r.team, line: String((r.stats as Record<string, unknown>).summary ?? ''), day: d, type: r.stat_type });
  }
  const side = (h: number): SideWeek => {
    const rec = wl.get(String(h));
    return { days: days.get(String(h)) || Array.from({ length: 7 }, () => new Map()), wins: rec?.w || 0, losses: rec?.l || 0 };
  };

  const order = bracketOrder(16);
  const brackets = TEST_BRACKETS.map((field) => {
    const games: Matchup[] = [];
    for (let i = 0; i < order.length; i += 2) {
      const [hs, as] = [order[i], order[i + 1]];
      const [hh, hn] = field[hs - 1];
      const [ah, an] = field[as - 1];
      // Week not over: no coin flip yet, a tie stays a tie.
      const result = playGame(side(hh), side(ah), new Map(), RULES, true);
      games.push({ home: [hh, hn, hs], away: [ah, an, as], result, players: { [hh]: who.get(String(hh)) || [], [ah]: who.get(String(ah)) || [] } });
    }
    return games;
  });
  return { brackets, lines: rows.length, asOf: new Date().toISOString() };
}
