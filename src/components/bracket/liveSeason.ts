// Live scoring: the bracket's games scored from real game lines
// (/api/bracket/live) with the bracket engine, in place of the practice
// season's pre-computed files. Each game's week is scored as its days come
// in: innings 1-7 are the days, 8 the week, 9 the alumni's clubs' W-L; a
// week still in progress has no winner yet.
//
// Scoring mode is 'raw' (OPS vs .720, FIP vs 4.20) until the level baselines
// are loaded. The scoreboard shows those on the plus scale (100 = .720 OPS /
// 4.20 FIP), so 100 still reads as league average and higher OPS+ / lower
// FIP- still wins.
import {
  RAW_AVERAGE_FIP, RAW_AVERAGE_OPS, RAW_FIP_CONSTANT, addToBuckets, emptyBat, emptyPit, fipCore, ops, playGame,
  type BatTotals, type GameResult, type PitTotals, type PlayerLines, type SideWeek,
} from '@/lib/bracket/engine';
import type { GameBox, GameRow, Index, PlayerRow, SeriesRow } from './gallery';

type RosterEntry = [id: string, name: string, level: string, pitcher: 0 | 1, club: string];
type Line = [hsid: string, playerid: string, day: number, kind: 'b' | 'p', stats: number[], game: string, club: string];
type Live = { asOf: string; roster: Record<string, RosterEntry[]>; lines: Line[]; clubs: Record<string, [number, string, 0 | 1][]> };

const RULES = { mode: 'raw' as const, absent: 'hold' as const };
const LEVEL = 'PRO';
const DAY = 86400000;

const opsPlus = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round((100 * v) / RAW_AVERAGE_OPS));
const fipMinus = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round((100 * v) / RAW_AVERAGE_FIP));
const bat = (s: number[]): BatTotals => ({ pa: s[0], ab: s[1], h: s[2], d2: s[3], d3: s[4], hr: s[5], bb: s[6], hbp: s[7], sf: s[8] });
const pit = (s: number[]): PitTotals => ({ outs: s[0], hr: s[1], bb: s[2], hbp: s[3], so: s[4] });
const add = (a: number[] | 0, b: number[]) => (a ? a.map((v, i) => v + (b[i] || 0)) : [...b]);
const dayOf = (iso: string, start: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);

// A deterministic commissioner's flip for a finished, level game.
function flip(gameId: number): 'home' | 'away' {
  let x = (gameId * 2654435761) >>> 0;
  x ^= x >>> 16;
  return x % 2 ? 'home' : 'away';
}

// One player's line for a set of days, as the drawer's PlayerRow.
function playerRow(p: RosterEntry, b: number[] | 0, q: number[] | 0, wl: [number, number] | null): PlayerRow {
  const batted = b && b[0] > 0;
  const pitched = q && (q[0] > 0 || q[1] > 0 || q[2] > 0 || q[3] > 0 || q[4] > 0);
  const fip = pitched ? fipCore(pit(q as number[])) + RAW_FIP_CONSTANT : 0;
  // Everyone stays in his usual group with a zero line on a day off.
  const batLine = b || (!q && !p[3] ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : 0);
  const pitLine = q ? [...q, +fip.toFixed(2)] : (!b && p[3] ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : 0);
  return [
    p[0], p[1], p[2], 0, batLine, pitLine,
    batted ? opsPlus(ops(bat(b as number[]))) : batLine ? 0 : null,
    pitched ? fipMinus(fip) : pitLine ? 0 : null,
    wl, 0,
  ];
}

let livePromise: Promise<{ live: Live | null; boxes: Record<string, GameBox> }> | null = null;
let boxesResolve: ((b: Record<string, GameBox>) => void) | null = null;
const boxesPromise = new Promise<Record<string, GameBox>>((res) => { boxesResolve = res; });

// The live boxes, keyed by game id (every round shares one set).
export function liveBoxes() {
  return boxesPromise;
}

// Score every game of the index whose week has started, from live lines.
export function applyLive(idx: Index, asof: string) {
  if (!livePromise) {
    const start = idx.weeks[0][0];
    const hsids = Object.keys(idx.schools);
    const started = idx.weeks.filter(([a]) => a <= asof).length;
    livePromise = (started
      ? fetch(`/api/bracket/live?start=${start}&weeks=${started}&h=${hsids.join(',')}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() as Promise<Live> : null))
        .catch(() => null)
      : Promise.resolve(null))
      .then((live) => {
        const boxes = live ? score(idx, live, asof) : {};
        boxesResolve?.(boxes);
        return { live, boxes };
      });
  }
  return livePromise.then(() => idx);
}

function score(idx: Index, live: Live, asof: string) {
  const start = idx.weeks[0][0];
  const today = dayOf(asof, start);
  const roster = new Map(Object.entries(live.roster));
  // Lines by school -> player -> day.
  const lines = new Map<string, Map<string, Map<number, { b: number[] | 0; p: number[] | 0; club: string }>>>();
  for (const [h, pid, day, kind, stats, , club] of live.lines) {
    const school = lines.get(h) || new Map();
    lines.set(h, school);
    const days = school.get(pid) || new Map();
    school.set(pid, days);
    const cur = days.get(day) || { b: 0, p: 0, club: '' };
    if (kind === 'b') cur.b = add(cur.b, stats); else cur.p = add(cur.p, stats);
    cur.club = club || cur.club;
    days.set(day, cur);
  }
  // A club's W-L over days [from, to].
  const clubWl = (club: string, from: number, to: number): [number, number] => {
    const games = (live.clubs[club] || []).filter(([d]) => d >= from && d <= to);
    const w = games.filter((g) => g[2]).length;
    return [w, games.length - w];
  };

  const boxes: Record<string, GameBox> = {};
  const scoreGame = (g: GameRow) => {
    const week = g[1];
    const [ws, we] = idx.weeks[week - 1] || [];
    if (!ws || ws > asof || !g[2] || !g[3]) return;
    const from = dayOf(ws, start);
    const final = we < asof;
    const side = (h: number) => {
      const players = roster.get(String(h)) || [];
      const mine = lines.get(String(h)) || new Map();
      const days: PlayerLines[] = Array.from({ length: 7 }, () => new Map());
      const dayRows: PlayerRow[][] = Array.from({ length: 7 }, () => []);
      const weekRows: PlayerRow[] = [];
      let wins = 0, losses = 0;
      for (const p of players) {
        const byDay = mine.get(p[0]);
        let wb: number[] | 0 = 0, wp: number[] | 0 = 0, club = p[4];
        for (let d = 0; d < 7; d++) {
          const x = byDay?.get(from + d);
          if (x?.club) club = x.club;
          if (x && (x.b || x.p)) {
            const buckets = new Map();
            if (x.b) addToBuckets(buckets, LEVEL, bat(x.b), emptyPit());
            if (x.p) addToBuckets(buckets, LEVEL, emptyBat(), pit(x.p));
            days[d].set(p[0], buckets);
            if (x.b) wb = add(wb, x.b);
            if (x.p) wp = add(wp, x.p);
          }
          dayRows[d].push(playerRow(p, x?.b || 0, x?.p || 0, null));
        }
        const wl = clubWl(club, from, Math.min(from + 6, today));
        wins += wl[0]; losses += wl[1];
        weekRows.push(playerRow(p, wb, wp, wl));
      }
      return { week: { days, wins, losses } as SideWeek, weekRows, dayRows };
    };
    const home = side(g[2]), away = side(g[3]);
    const result: GameResult = playGame(home.week, away.week, new Map(), RULES, !final, final ? () => flip(g[0]) : undefined);
    g[5] = result.innings.flatMap((i) => [i.home, i.away]);
    g[6] = final && result.winner ? (result.winner === 'home' ? g[2] : g[3]) : null;
    g[4] = !final ? '' : result.decidedBy === 'players' ? `players-${result.tieRank}` : result.decidedBy;
    boxes[String(g[0])] = {
      d: result.innings.slice(0, 8).map((i) => [opsPlus(i.homeOffense), opsPlus(i.awayOffense), fipMinus(i.homePitching), fipMinus(i.awayPitching)]),
      h: { p: home.weekRows, wl: [home.week.wins, home.week.losses], days: home.dayRows },
      a: { p: away.weekRows, wl: [away.week.wins, away.week.losses], days: away.dayRows },
    };
  };

  for (const round of idx.rounds) {
    for (const s of round.series as SeriesRow[]) {
      s[7].forEach(scoreGame);
      // A series is decided once a school has 2 wins.
      const wins: [number, number] = [s[7].filter((g) => g[6] === s[1]).length, s[7].filter((g) => g[6] === s[2]).length];
      s[6] = wins;
      s[5] = wins[0] >= 2 ? s[1] : wins[1] >= 2 ? s[2] : 0;
    }
  }
  return boxes;
}
