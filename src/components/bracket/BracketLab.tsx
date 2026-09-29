'use client';

// src/components/bracket/BracketLab.tsx
// The 2026 National Alumni Bracket as a gallery of flip cards. One card is
// one game (one week): the front is one school's box score, the back the
// other's, both under the same 9-inning line score. A row of three cards is
// a series; rounds stack down the page. Filters: round, region, a school
// search and favorite schools (kept in this browser).
//
// Leaderboards: the 8 regional leaderboards (every school, weeks 1-30, most
// runs then run differential), standings through any week, and each
// school's whole season as flip cards.
//
// Data: /bracket-lab/2026/index.json (every series and line score), lb.json
// (the eliminated schools' weekly regional games) and one box-score file
// per round + region (d-lb-<week>-<region> for leaderboard games), fetched
// when its cards come on screen.

import { useEffect, useMemo, useRef, useState } from 'react';

type SchoolRow = [name: string, region: number, seed: number];
type GameRow = [id: number, week: number, home: number, away: number, decidedBy: string, innings: number[], winner: number | null];
type SeriesRow = [region: number, home: number, away: number, homeSeed: number, awaySeed: number, winner: number, wins: [number, number], games: GameRow[]];
type Round = { r: number; name: string; start: string; end: string; series: SeriesRow[] };
type Index = {
  season: number;
  weeks: [string, string][];
  schools: Record<string, SchoolRow>;
  rounds: Round[];
  lbt: { seeds: [number, number]; game: GameRow }[];
  gf: GameRow[];
  champion: number;
  lbLeaders: number[]; // the Leaderboard 8, seed order
  lbChampion: number;
  grandChampion: number;
};
// A leaderboard game: the same as a GameRow plus the region.
type LbGame = [id: number, week: number, home: number, away: number, decidedBy: string, innings: number[], winner: number | null, region: number];
// [playerid, name, level, simulated, bat [PA AB H 2B 3B HR BB HBP SF] | 0, pit [outs HR BB HBP K] | 0, OPS+, FIP-]
type PlayerRow = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null];
type SideBox = { p: PlayerRow[]; wl: [number, number] };
type GameBox = { d: (number | null)[][]; h: SideBox; a: SideBox };

const BASE = '/bracket-lab/2026';
const FAV_KEY = 'yat-bracket-lab-favs';
const REGIONS: Record<number, string> = {
  1: 'The Giants', 2: 'The Frontier', 3: 'The Heat', 4: 'Rivals', 5: 'Grinders', 6: 'Corridor', 7: 'Prep Elite', 8: 'Talent Factory',
};
const LBT_ROUNDS: Record<number, string> = { 31: 'Quarterfinal', 32: 'Semifinal', 33: 'Final' };
const TIE_NOTE: Record<string, string> = {
  coin: "Tied after 9 · won on the commissioner's coin flip",
};
// 'players-2': the tie went down to each school's #2 hitter and #2 pitcher
function tieNote(decidedBy: string) {
  const m = /^players-(\d+)$/.exec(decidedBy);
  if (!m) return TIE_NOTE[decidedBy];
  return m[1] === '1'
    ? 'Tied after 9 · won on the best hitter (OPS+) and best pitcher (FIP-) matchups'
    : `Tied after 9 · won on the #${m[1]} hitter (OPS+) and #${m[1]} pitcher (FIP-) matchups`;
}

// Box scores are shared by every card of a round + region: one fetch each.
const boxCache = new Map<string, Promise<Record<string, GameBox>>>();
function loadBoxes(file: string) {
  if (!boxCache.has(file)) {
    boxCache.set(file, fetch(`${BASE}/${file}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return boxCache.get(file)!;
}

const shortName = (name: string) => name.split(' (')[0];
const LEVEL: Record<string, string> = {
  MLB: 'MLB', 'TRIPLE-A': 'AAA', 'DOUBLE-A': 'AA', 'HIGH-A': 'A+', 'LOW-A': 'A', ROOKIE: 'RK', SPRING: 'ST',
  'NCAA-D1': 'D1', 'NCAA-D2': 'D2', 'NCAA-D3': 'D3', NAIA: 'NAIA', JUCO: 'JUCO',
};
const lvl = (l: string) => l.split('/').map((x) => LEVEL[x] || x).join('/');
const place = (name: string) => (name.includes(' (') ? name.split(' (')[1].replace(/\)$/, '').replace(',', ', ') : '');
function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
const fmtRange = (a: string, b: string) => `${fmtDate(a)} – ${fmtDate(b)}`;
const LAST_WEEK = 30; // the bracket and the leaderboards end with week 30
const ROUND_SHORT = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'Regional Final', 'Elite 8', 'Final 4', 'Championship'];
const runsOf = (inn: number[]) => {
  let h = 0, a = 0;
  inn.forEach((v, i) => { if (i % 2 === 0) h += v; else a += v; });
  return [h, a];
};

// Leaderboard standings through a week: every school's runs for and
// against, W-L-T and games, from its bracket games and leaderboard games.
type Stand = { h: number; rf: number; ra: number; w: number; l: number; t: number; g: number };
function standings(index: Index, lb: LbGame[], week: number) {
  const st = new Map<number, Stand>();
  for (const k of Object.keys(index.schools)) st.set(Number(k), { h: Number(k), rf: 0, ra: 0, w: 0, l: 0, t: 0, g: 0 });
  const add = (g: GameRow | LbGame) => {
    if (g[1] > week) return;
    const [hr, ar] = runsOf(g[5]);
    for (const [h, rf, ra] of [[g[2], hr, ar], [g[3], ar, hr]]) {
      const s = st.get(h);
      if (!s) continue;
      s.g++; s.rf += rf; s.ra += ra;
      if (g[6] === h) s.w++; else if (g[6] === null) s.t++; else s.l++;
    }
  };
  for (const r of index.rounds) for (const s of r.series) for (const g of s[7]) add(g);
  for (const g of lb) add(g);
  return st;
}
// Most runs, then run differential, wins, seed (same order as the simulator).
function rankRegion(index: Index, st: Map<number, Stand>, region: number) {
  const seed = (h: number) => index.schools[h]?.[2] ?? 999;
  return [...st.values()]
    .filter((s) => index.schools[s.h]?.[1] === region)
    .sort((x, y) => y.rf - x.rf || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || seed(x.h) - seed(y.h));
}
// When each school went out of the bracket (round, week of its last game).
function eliminations(index: Index) {
  const out = new Map<number, { round: number; week: number }>();
  for (const r of index.rounds) {
    for (const s of r.series) {
      const loser = s[5] === s[1] ? s[2] : s[1];
      out.set(loser, { round: r.r, week: s[7][s[7].length - 1][1] });
    }
  }
  return out;
}
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
const rate = (v: number) => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));

function useFavorites() {
  const [favs, setFavs] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return new Set<number>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<number>();
    }
  });
  const toggle = (h: number) => {
    setFavs((cur) => {
      const next = new Set(cur);
      if (next.has(h)) next.delete(h); else next.add(h);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  return { favs, toggle };
}

// Rows that appear as the page scrolls (Round 1 alone is 512 rows).
function useReveal(total: number, step = 12) {
  // A new list (other round or filter) starts again from the top.
  const [state, setState] = useState({ total, shown: step });
  const shown = state.total === total ? state.shown : step;
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState((s) => ({ total, shown: Math.min(total, (s.total === total ? s.shown : step) + step) }));
      }
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [total, step, shown]);
  return { shown, sentinel: ref };
}

type View = { kind: 'round'; r: number } | { kind: 'lbt' } | { kind: 'gf' } | { kind: 'season' } | { kind: 'boards' } | { kind: 'school'; h: number };

// One row in the gallery: a series (three cards), a single game, or up to
// three of one school's leaderboard games ('plain': no single opponent).
type Row = {
  key: string;
  roundLabel: string;
  title: string;
  plain?: boolean;
  week: number;
  region: number;
  home: number;
  away: number;
  homeSeed: number;
  awaySeed: number;
  result: string;
  files: string[]; // the box-score file of each game
  games: GameRow[];
  gameLabels: string[];
  // On a school's page every card opens on that school's box score.
  school?: number;
};

export default function BracketLab() {
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>({ kind: 'round', r: 1 });
  const [region, setRegion] = useState(0);
  const [query, setQuery] = useState('');
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [week, setWeek] = useState(LAST_WEEK);
  const [lb, setLb] = useState<LbGame[] | null>(null);
  const { favs, toggle } = useFavorites();

  useEffect(() => {
    fetch(`${BASE}/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setIndex)
      .catch((e) => setError(String(e)));
  }, []);

  // The leaderboard games load the first time the leaderboards or a school's
  // season are opened.
  const needLb = view.kind === 'boards' || view.kind === 'school';
  useEffect(() => {
    if (!needLb || lb) return;
    fetch(`${BASE}/lb.json`)
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((d: { games: LbGame[] }) => setLb(d.games))
      .catch(() => setLb([]));
  }, [needLb, lb]);

  const rows = useMemo<Row[]>(() => {
    if (!index) return [];
    const S = index.schools;
    const name = (h: number) => S[h]?.[0] || String(h);
    const out: Row[] = [];
    const seriesRow = (round: Round, s: SeriesRow): Row => {
      const [reg, home, away, hs, as, winner, wins, games] = s;
      const w = winner === home ? home : away;
      const wWins = winner === home ? wins[0] : wins[1];
      const lWins = winner === home ? wins[1] : wins[0];
      return {
        key: `r${round.r}-${home}-${away}`,
        roundLabel: `${round.name}${reg ? ` · Region ${reg}` : ''}`,
        title: `#${hs} ${shortName(name(home))} vs #${as} ${shortName(name(away))}`,
        week: games[0][1],
        region: reg,
        home, away, homeSeed: hs, awaySeed: as,
        result: `${shortName(name(w))} wins the series ${wWins}–${lWins}`,
        files: games.map(() => `d-${round.r}-${reg}`),
        games,
        gameLabels: games.map((_, i) => `Game ${i + 1}`),
      };
    };
    const lbtRow = ({ seeds, game }: Index['lbt'][number]): Row => {
      const [, wk, home, away, , , winner] = game;
      return {
        key: `lbt-${game[0]}`,
        roundLabel: `Leaderboard Tournament · ${LBT_ROUNDS[wk] || ''}`,
        title: `#${seeds[0]} ${shortName(name(home))} vs #${seeds[1]} ${shortName(name(away))}`,
        week: wk,
        region: 0,
        home, away, homeSeed: seeds[0], awaySeed: seeds[1],
        result: `${shortName(name(winner!))} advances`,
        files: ['d-lbt'],
        games: [game],
        gameLabels: [LBT_ROUNDS[wk] || 'Game'],
      };
    };
    const gfRow = (game: GameRow): Row => {
      const [, wk, home, away, , , winner] = game;
      return {
        key: `gf-${game[0]}`,
        roundLabel: 'Grand Final',
        title: `${shortName(name(home))} (bracket champion) vs ${shortName(name(away))} (leaderboard champion)`,
        week: wk,
        region: 0,
        home, away, homeSeed: 1, awaySeed: 2,
        result: `${shortName(name(winner!))} wins the Grand Final`,
        files: ['d-gf'],
        games: [game],
        gameLabels: ['Grand Final'],
      };
    };

    // One school's whole season: its bracket series, its leaderboard games
    // (three weeks to a row), then the tournament and the Grand Final.
    if (view.kind === 'school') {
      const h = view.h;
      for (const round of index.rounds) for (const s of round.series) if (s[1] === h || s[2] === h) out.push(seriesRow(round, s));
      const mine = (lb || []).filter((g) => g[2] === h || g[3] === h).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < mine.length; i += 3) {
        const chunk = mine.slice(i, i + 3);
        let runs = 0, w = 0, l = 0, t = 0;
        for (const g of chunk) {
          const [hr, ar] = runsOf(g[5]);
          runs += g[2] === h ? hr : ar;
          if (g[6] === h) w++; else if (g[6] === null) t++; else l++;
        }
        const reg = chunk[0][7];
        const first = chunk[0][1], last = chunk[chunk.length - 1][1];
        out.push({
          key: `lb-${h}-${chunk[0][0]}`,
          roundLabel: `Region ${reg} leaderboard · ${first === last ? `week ${first}` : `weeks ${first}–${last}`}`,
          title: `${shortName(name(h))}'s leaderboard games`,
          plain: true,
          week: first,
          region: reg,
          home: h, away: h, homeSeed: 0, awaySeed: 0,
          result: `${runs} runs · ${w}–${l}${t ? `–${t}` : ''}`,
          files: chunk.map((g) => `d-lb-${g[1]}-${g[7]}`),
          games: chunk.map((g) => g.slice(0, 7) as GameRow),
          gameLabels: chunk.map((g) => `vs ${shortName(name(g[2] === h ? g[3] : g[2]))}`),
        });
      }
      for (const x of index.lbt) if (x.game[2] === h || x.game[3] === h) out.push(lbtRow(x));
      for (const g of index.gf) if (g[2] === h || g[3] === h) out.push(gfRow(g));
      return out.map((r) => ({ ...r, school: h })).sort((a, b) => a.week - b.week);
    }

    if (view.kind === 'round') for (const s of index.rounds[view.r - 1].series) out.push(seriesRow(index.rounds[view.r - 1], s));
    if (view.kind === 'season') for (const round of index.rounds) for (const s of round.series) out.push(seriesRow(round, s));
    if (view.kind === 'lbt' || view.kind === 'season') for (const x of index.lbt) out.push(lbtRow(x));
    if (view.kind === 'gf' || view.kind === 'season') for (const g of index.gf) out.push(gfRow(g));
    const q = query.trim().toLowerCase();
    return out.filter((row) => {
      if (region && row.region && row.region !== region) return false;
      if (region && !row.region) return false;
      if (onlyFavs && !favs.has(row.home) && !favs.has(row.away)) return false;
      if (q && !name(row.home).toLowerCase().includes(q) && !name(row.away).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [index, view, region, query, onlyFavs, favs, lb]);

  const { shown, sentinel } = useReveal(rows.length);

  if (error) return <main className="bl"><p className="bl-empty">Could not load the bracket ({error}).</p><Styles /></main>;
  if (!index) return <main className="bl"><p className="bl-empty">Loading the 2026 bracket…</p><Styles /></main>;

  const S = index.schools;
  const nm = (h: number) => shortName(S[h]?.[0] || String(h));
  const viewKey = view.kind === 'round' ? `r${view.r}` : view.kind;
  const pick = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };
  const openSchool = (h: number) => pick({ kind: 'school', h });
  const gallery = view.kind !== 'boards';

  return (
    <main className="bl">
      <header className="bl-head">
        <div className="bl-kick">YAT?STATS National Alumni Bracket · 2026 · simulation · private preview</div>
        <h1>The 2026 season, game by game</h1>
        <p className="bl-sum">
          Bracket champion <b>{nm(index.champion)}</b> · Leaderboard champion <b>{nm(index.lbChampion)}</b> · Grand Final <b>{nm(index.grandChampion)}</b>
        </p>
      </header>

      <nav className="bl-nav" aria-label="Rounds">
        <div className="bl-pills">
          <button type="button" className={viewKey === 'boards' || viewKey === 'school' ? 'on' : ''} onClick={() => pick({ kind: 'boards' })}>
            <b>Leaderboards</b><span>8 regions · most runs</span>
          </button>
          {index.rounds.map((r) => (
            <button key={r.r} type="button" className={viewKey === `r${r.r}` ? 'on' : ''} onClick={() => pick({ kind: 'round', r: r.r })}>
              <b>{r.r <= 6 ? `R${r.r}` : r.name}</b>
              <span>{fmtRange(r.start, r.end)}</span>
            </button>
          ))}
          <button type="button" className={viewKey === 'lbt' ? 'on' : ''} onClick={() => pick({ kind: 'lbt' })}>
            <b>Leaderboard 8</b><span>Aug 31 – Sep 20</span>
          </button>
          <button type="button" className={viewKey === 'gf' ? 'on' : ''} onClick={() => pick({ kind: 'gf' })}>
            <b>Grand Final</b><span>Sep 21 – 27</span>
          </button>
          <button type="button" className={viewKey === 'season' ? 'on' : ''} onClick={() => pick({ kind: 'season' })}>
            <b>Whole season</b><span>every game</span>
          </button>
        </div>
        <div className="bl-filters">
          <label className="bl-search">
            <span className="sr">Find a school</span>
            <input id="bl-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a school (e.g. Hamilton)" />
          </label>
          <select id="bl-region" value={region} onChange={(e) => setRegion(Number(e.target.value))} aria-label="Region">
            <option value={0}>All regions</option>
            {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>Region {k} · {v}</option>)}
          </select>
          <button type="button" className={`bl-favbtn${onlyFavs ? ' on' : ''}`} onClick={() => setOnlyFavs((v) => !v)} aria-pressed={onlyFavs}>
            ★ My teams{favs.size ? ` (${favs.size})` : ''}
          </button>
        </div>
        {gallery && (
          <div className="bl-count">
            {view.kind === 'school' ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}` : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'matchup' : 'matchups'}`} · tap a card to flip it · tap a school to see its season
          </div>
        )}
      </nav>

      {view.kind === 'boards' && (
        lb
          ? <Leaderboards index={index} lb={lb} week={week} setWeek={setWeek} region={region} query={query} onlyFavs={onlyFavs} favs={favs} onFav={toggle} onOpen={openSchool} />
          : <p className="bl-empty">Loading the leaderboards…</p>
      )}

      {view.kind === 'school' && (
        lb
          ? <SchoolHead index={index} lb={lb} h={view.h} favs={favs} onFav={toggle} onBack={() => pick({ kind: 'boards' })} />
          : <p className="bl-empty">Loading the season…</p>
      )}

      {gallery && (view.kind !== 'school' || lb) && (
        <section className="bl-rows">
          {rows.slice(0, shown).map((row) => (
            <SeriesRowView key={row.key} row={row} index={index} favs={favs} onFav={toggle} onOpen={openSchool} />
          ))}
          {rows.length === 0 && <p className="bl-empty">{onlyFavs && !favs.size ? 'Star a school on any matchup to follow it here.' : 'No matchups match these filters.'}</p>}
          <div ref={sentinel} className="bl-sentinel" aria-hidden="true" />
        </section>
      )}
      <footer className="bl-foot">
        Simulated on 2026 stats: pros are real box scores (spring training included); college lines marked * are simulated from each player&apos;s 2026 season totals.
        OPS+ and FIP- compare every player with the average at his own level (100 = average).
      </footer>
      <Styles />
    </main>
  );
}

function Star({ h, index, favs, onFav }: { h: number; index: Index; favs: Set<number>; onFav: (h: number) => void }) {
  const on = favs.has(h);
  return (
    <button type="button" className={`bl-star${on ? ' on' : ''}`} onClick={() => onFav(h)} aria-pressed={on} aria-label={`${on ? 'Unfollow' : 'Follow'} ${index.schools[h]?.[0]}`}>
      {on ? '★' : '☆'}
    </button>
  );
}

// The 8 regional leaderboards through a chosen week: every school, most runs
// first, then run differential. After week 30 each region's leader is in the
// Leaderboard 8 (the bracket champion sits out; its region sends the next).
function Leaderboards({ index, lb, week, setWeek, region, query, onlyFavs, favs, onFav, onOpen }: {
  index: Index; lb: LbGame[]; week: number; setWeek: (w: number) => void; region: number; query: string;
  onlyFavs: boolean; favs: Set<number>; onFav: (h: number) => void; onOpen: (h: number) => void;
}) {
  const st = useMemo(() => standings(index, lb, week), [index, lb, week]);
  const elim = useMemo(() => eliminations(index), [index]);
  const final = week >= LAST_WEEK;
  const [ws, we] = index.weeks[week - 1] || ['', ''];
  const regions = region ? [region] : [1, 2, 3, 4, 5, 6, 7, 8];
  const status = (h: number) => {
    if (final && h === index.champion) return { text: 'Bracket champion', cls: 'champ' };
    const e = elim.get(h);
    if (e && e.week <= week) return { text: `Out · ${ROUND_SHORT[e.round - 1]}`, cls: 'out' };
    return { text: 'In the bracket', cls: 'alive' };
  };
  const name = (h: number) => index.schools[h]?.[0] || String(h);
  const lbSeed = new Map(index.lbLeaders.map((h, i) => [h, i + 1]));

  return (
    <section className="bl-boards">
      <div className="bl-weekbar">
        <button type="button" onClick={() => setWeek(Math.max(1, week - 1))} disabled={week <= 1} aria-label="Previous week">‹</button>
        <input type="range" min={1} max={LAST_WEEK} value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Standings through week" />
        <button type="button" onClick={() => setWeek(Math.min(LAST_WEEK, week + 1))} disabled={week >= LAST_WEEK} aria-label="Next week">›</button>
        <div className="bl-weeklabel">Standings through <b>Week {week}</b>{ws ? ` · ${fmtRange(ws, we)}` : ''}{final ? ' · final' : ''}</div>
      </div>

      {final && (
        <div className="bl-announce">
          <div className="bl-announce-t">The Leaderboard 8 · announced before Week 31</div>
          <p>Each region&apos;s leader in total runs (run differential breaks ties) plays a single-game tournament, {fmtRange(index.weeks[LAST_WEEK][0], index.weeks[LAST_WEEK + 2][1])}. The winner meets bracket champion <b>{shortName(name(index.champion))}</b> in the Grand Final, which sits out until then.</p>
          <ol>
            {index.lbLeaders.map((h) => {
              const s = st.get(h)!;
              return (
                <li key={h}>
                  <span className="seed">#{lbSeed.get(h)}</span>
                  <button type="button" className="bl-link" onClick={() => onOpen(h)}><b>{shortName(name(h))}</b></button>
                  <i>Region {index.schools[h][1]} · {REGIONS[index.schools[h][1]]}</i>
                  <span className="runs">{s.rf} R</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="bl-grid">
        {regions.map((r) => (
          <RegionBoard key={r} region={r} ranked={rankRegion(index, st, r)} index={index} final={final} query={query}
            onlyFavs={onlyFavs} favs={favs} onFav={onFav} onOpen={onOpen} status={status} />
        ))}
      </div>
    </section>
  );
}

function RegionBoard({ region, ranked, index, final, query, onlyFavs, favs, onFav, onOpen, status }: {
  region: number; ranked: Stand[]; index: Index; final: boolean; query: string; onlyFavs: boolean;
  favs: Set<number>; onFav: (h: number) => void; onOpen: (h: number) => void; status: (h: number) => { text: string; cls: string };
}) {
  const [all, setAll] = useState(false);
  const TOP = 10;
  const name = (h: number) => index.schools[h]?.[0] || String(h);
  // The region's spot in the Leaderboard 8: its leader, or the next school
  // when the leader is the bracket champion.
  const qualifier = ranked.find((s) => !final || s.h !== index.champion)?.h;
  const q = query.trim().toLowerCase();
  const rows = ranked
    .map((s, i) => ({ s, rank: i + 1 }))
    .filter(({ s, rank }) => {
      if (q) return name(s.h).toLowerCase().includes(q);
      if (onlyFavs) return favs.has(s.h);
      return all || rank <= TOP || favs.has(s.h);
    });

  return (
    <div className="bl-board">
      <div className="bl-board-h">
        <b>Region {region}</b> <span>{REGIONS[region]}</span>
      </div>
      <table>
        <thead>
          <tr><th className="rk">#</th><th className="nm">School</th><th>R</th><th>Diff</th><th>W-L</th><th className="st">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(({ s, rank }) => {
            const diff = s.rf - s.ra;
            const st = status(s.h);
            const isQ = s.h === qualifier;
            return (
              <tr key={s.h} className={`${isQ ? 'lead' : ''}${rank > TOP && !all ? ' extra' : ''}`}>
                <td className="rk">{rank}</td>
                <td className="nm">
                  <Star h={s.h} index={index} favs={favs} onFav={onFav} />
                  <button type="button" className="bl-link" onClick={() => onOpen(s.h)}>{shortName(name(s.h))}</button>
                  {isQ && <em className="q">{final ? 'Qualified' : 'Leads'}</em>}
                </td>
                <td className="r">{s.rf}</td>
                <td className={diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}>{diff > 0 ? `+${diff}` : diff}</td>
                <td>{s.w}–{s.l}{s.t ? `–${s.t}` : ''}</td>
                <td className={`st ${st.cls}`}>{st.text}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="none">{q ? 'No school matches.' : 'No followed schools in this region.'}</td></tr>}
        </tbody>
      </table>
      {!q && !onlyFavs && (
        <button type="button" className="bl-more" onClick={() => setAll((v) => !v)}>
          {all ? `Top ${TOP} only` : `All ${ranked.length} schools`}
        </button>
      )}
    </div>
  );
}

// The top of a school's season page: where it stands on its leaderboard
// and how its bracket run ended.
function SchoolHead({ index, lb, h, favs, onFav, onBack }: { index: Index; lb: LbGame[]; h: number; favs: Set<number>; onFav: (h: number) => void; onBack: () => void }) {
  const st = useMemo(() => standings(index, lb, LAST_WEEK), [index, lb]);
  const elim = useMemo(() => eliminations(index), [index]);
  const [nm, region, seed] = index.schools[h] || [String(h), 0, 0];
  const ranked = rankRegion(index, st, region);
  const rank = ranked.findIndex((s) => s.h === h) + 1;
  const s = st.get(h)!;
  const e = elim.get(h);
  const bracket = h === index.champion ? 'Won the bracket' : e ? `Out of the bracket in ${ROUND_SHORT[e.round - 1]} (week ${e.week})` : '';
  const extra = [
    index.lbLeaders.includes(h) ? 'In the Leaderboard 8' : '',
    h === index.lbChampion ? 'won the Leaderboard 8' : '',
    h === index.grandChampion ? 'won the Grand Final' : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="bl-school">
      <button type="button" className="bl-backlink" onClick={onBack}>‹ Leaderboards</button>
      <div className="bl-school-t">
        <Star h={h} index={index} favs={favs} onFav={onFav} />
        <b>{shortName(nm)}</b> <i>{place(nm)}</i>
      </div>
      <div className="bl-school-s">
        Region {region} · {REGIONS[region]} · #{seed} seed · <b>{rank}{ordinal(rank)}</b> on the leaderboard with <b>{s.rf} runs</b> ({s.rf - s.ra >= 0 ? '+' : ''}{s.rf - s.ra}) · {s.w}–{s.l}{s.t ? `–${s.t}` : ''} in {s.g} games
      </div>
      <div className="bl-school-s">{bracket}{extra ? ` · ${extra}` : ''}</div>
    </div>
  );
}

function ordinal(n: number) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}

function SeriesRowView({ row, index, favs, onFav, onOpen }: { row: Row; index: Index; favs: Set<number>; onFav: (h: number) => void; onOpen: (h: number) => void }) {
  const S = index.schools;
  const [boxes, setBoxes] = useState<Record<string, GameBox> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const filesKey = [...new Set(row.files)].join('|');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        Promise.all(filesKey.split('|').map(loadBoxes)).then((list) => {
          if (!cancelled) setBoxes(Object.assign({}, ...list));
        });
      }
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [filesKey]);

  const team = (h: number, seed: number) => (
    <span>
      {seed ? `#${seed} ` : ''}
      <button type="button" className="bl-link" onClick={() => onOpen(h)}><b>{shortName(S[h]?.[0] || '')}</b></button> <i>{place(S[h]?.[0] || '')}</i>
    </span>
  );

  return (
    <div className="bl-row" ref={ref}>
      <div className="bl-rowhead">
        <div className="bl-round">{row.roundLabel}</div>
        <div className="bl-title">
          {row.plain ? (
            <><Star h={row.home} index={index} favs={favs} onFav={onFav} />{team(row.home, 0)}<span className="bl-vs">weekly regional games</span></>
          ) : (
            <>
              <Star h={row.home} index={index} favs={favs} onFav={onFav} />{team(row.home, row.homeSeed)}
              <span className="bl-vs">vs</span>
              <Star h={row.away} index={index} favs={favs} onFav={onFav} />{team(row.away, row.awaySeed)}
            </>
          )}
        </div>
        <div className="bl-result">{row.result}</div>
      </div>
      <div className={`bl-cards n${row.games.length}`}>
        {row.games.map((g, i) => (
          <FlipCard key={g[0]} game={g} label={row.gameLabels[i]} index={index} box={boxes ? boxes[String(g[0])] : undefined} loading={!boxes}
            front={row.school !== undefined && g[3] === row.school ? 'a' : 'h'} />
        ))}
      </div>
    </div>
  );
}

function FlipCard({ game, label, index, box, loading, front = 'h' }: { game: GameRow; label: string; index: Index; box?: GameBox; loading: boolean; front?: 'h' | 'a' }) {
  const [flipped, setFlipped] = useState(false);
  const [id, week, home, away, decidedBy, innings, winner] = game;
  const S = index.schools;
  const [ws, we] = index.weeks[week - 1] || ['', ''];
  const hr = innings.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const ar = innings.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
  const face = (side: 'h' | 'a') => (
    <Face
      side={side}
      label={label}
      week={week}
      dates={ws ? fmtRange(ws, we) : ''}
      home={home}
      away={away}
      names={[shortName(S[home]?.[0] || ''), shortName(S[away]?.[0] || '')]}
      score={[hr, ar]}
      innings={innings}
      winner={winner}
      decidedBy={decidedBy}
      box={box}
      loading={loading}
      onFlip={() => setFlipped((f) => !f)}
    />
  );
  return (
    <div className={`bl-card${flipped ? ' flipped' : ''}`} data-game={id}>
      <div className="bl-inner">
        <div className="bl-face bl-front">{face(front)}</div>
        <div className="bl-face bl-back">{face(front === 'h' ? 'a' : 'h')}</div>
      </div>
    </div>
  );
}

function Face({ side, label, week, dates, home, away, names, score, innings, winner, decidedBy, box, loading, onFlip }: {
  side: 'h' | 'a'; label: string; week: number; dates: string; home: number; away: number; names: [string, string];
  score: [number, number]; innings: number[]; winner: number | null; decidedBy: string; box?: GameBox; loading: boolean; onFlip: () => void;
}) {
  const me = side === 'h' ? 0 : 1;
  const them = 1 - me;
  const mine = box ? box[side] : undefined;
  const theirs = box ? box[side === 'h' ? 'a' : 'h'] : undefined;
  const weekVals = box?.d?.[7];
  const myName = names[me];
  const wonBy = winner === null ? 'tie' : winner === (me === 0 ? home : away) ? 'me' : 'them';

  const batters = (mine?.p || []).filter((p) => p[4]).sort((a, b) => (b[4] as number[])[0] - (a[4] as number[])[0]);
  const pitchers = (mine?.p || []).filter((p) => p[5]).sort((a, b) => (b[5] as number[])[0] - (a[5] as number[])[0]);
  const teamBat = batters.reduce((t, p) => (p[4] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const teamPit = pitchers.reduce((t, p) => (p[5] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const obpSlg = (b: number[]) => {
    const [, ab, h, d2, d3, hr, bb, hbp, sf] = b;
    const den = ab + bb + hbp + sf;
    const tb = h + d2 + 2 * d3 + 3 * hr;
    return (den ? (h + bb + hbp) / den : 0) + (ab ? tb / ab : 0);
  };
  const wl = mine?.wl || [0, 0];
  const owl = theirs?.wl || [0, 0];
  const pct = (w: number, l: number) => (w + l ? rate(w / (w + l)) : '—');
  const sim = (mine?.p || []).some((p) => p[3]);

  return (
    <div className="bl-f">
      <button type="button" className="bl-top" onClick={onFlip} aria-label={`Flip to ${names[them]}`}>
        <div className="bl-meta"><span>{label} · Week {week}</span><span>{dates}</span></div>
        <div className="bl-score">
          <div className={`bl-team${me === 0 ? ' me' : ''}`}><b>{names[0]}</b></div>
          <div className="bl-runs">{score[0]}</div>
          <div className="bl-final">FINAL</div>
          <div className="bl-runs">{score[1]}</div>
          <div className={`bl-team r${me === 1 ? ' me' : ''}`}><b>{names[1]}</b></div>
        </div>
      </button>

      <div className="bl-scroll">
        <table className="bl-ls">
          <thead>
            <tr><th />{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <th key={n}>{n}</th>)}<th className="sep">R</th><th>OPS+</th><th>FIP-</th></tr>
          </thead>
          <tbody>
            {[0, 1].map((s) => (
              <tr key={s} className={s === me ? 'me' : ''}>
                <th>{abbr(names[s])}</th>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                  const v = innings[i * 2 + s];
                  return <td key={i} className={v ? 'hit' : ''}>{v}</td>;
                })}
                <td className="sep r">{score[s]}</td>
                <td>{weekVals ? fmtStat(weekVals[s]) : ''}</td>
                <td>{weekVals ? fmtStat(weekVals[2 + s]) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tieNote(decidedBy) && <div className="bl-note">{tieNote(decidedBy)}</div>}
      {decidedBy === 'tie' && <div className="bl-note">Tie · half a win each</div>}

      <div className="bl-tabs">
        <span className="on">{myName}</span>
        <button type="button" onClick={onFlip}>{names[them]} ⟳</button>
        <em className={wonBy}>{wonBy === 'me' ? 'W' : wonBy === 'them' ? 'L' : 'T'}</em>
      </div>

      {loading && <div className="bl-muted">Loading box score…</div>}
      {!loading && !mine && <div className="bl-muted">No box score.</div>}
      {mine && (
        <>
          <div className="bl-scroll">
            <table className="bl-box">
              <thead>
                <tr><th className="nm">Batters</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>HBP</th><th>SF</th><th>OPS</th><th>OPS+</th></tr>
              </thead>
              <tbody>
                {batters.length === 0 && <tr><td className="nm none" colSpan={11}>No hitters played this week</td></tr>}
                {batters.map((p) => {
                  const b = p[4] as number[];
                  return (
                    <tr key={p[0]}>
                      <td className="nm">{p[1]}{p[3] ? '*' : ''} <small>{lvl(p[2])}</small></td>
                      {b.slice(1).map((v, i) => <td key={i}>{v}</td>)}
                      <td>{rate(obpSlg(b))}</td>
                      <td className="plus">{p[6] ?? '—'}</td>
                    </tr>
                  );
                })}
                {batters.length > 0 && (
                  <tr className="tot">
                    <td className="nm">Team</td>
                    {teamBat.slice(1).map((v, i) => <td key={i}>{v}</td>)}
                    <td>{rate(obpSlg(teamBat))}</td>
                    <td className="plus">{weekVals ? fmtStat(weekVals[me]) : '—'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bl-scroll">
            <table className="bl-box">
              <thead>
                <tr><th className="nm">Pitchers</th><th>IP</th><th>K</th><th>BB</th><th>HBP</th><th>HR</th><th>FIP-</th></tr>
              </thead>
              <tbody>
                {pitchers.length === 0 && <tr><td className="nm none" colSpan={7}>No pitchers pitched this week</td></tr>}
                {pitchers.map((p) => {
                  const [outs, hr, bb, hbp, so] = p[5] as number[];
                  return (
                    <tr key={p[0]}>
                      <td className="nm">{p[1]}{p[3] ? '*' : ''} <small>{lvl(p[2])}</small></td>
                      <td>{ip(outs)}</td><td>{so}</td><td>{bb}</td><td>{hbp}</td><td>{hr}</td>
                      <td className="plus">{p[7] ?? '—'}</td>
                    </tr>
                  );
                })}
                {pitchers.length > 0 && (
                  <tr className="tot">
                    <td className="nm">Team</td>
                    <td>{ip(teamPit[0])}</td><td>{teamPit[4]}</td><td>{teamPit[2]}</td><td>{teamPit[3]}</td><td>{teamPit[1]}</td>
                    <td className="plus">{weekVals ? fmtStat(weekVals[2 + me]) : '—'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bl-how">
            <div className="bl-howt">How the runs were scored</div>
            <div className="bl-scroll">
              <table className="bl-days">
                <thead><tr><th /><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th><th>S</th><th>Wk</th></tr></thead>
                <tbody>
                  <tr><th>OPS+</th>{box!.d.map((d, i) => <td key={i} className={wonCell(d[me], d[them], true)}>{fmtStat(d[me])}</td>)}</tr>
                  <tr className="opp"><th>vs</th>{box!.d.map((d, i) => <td key={i}>{fmtStat(d[them])}</td>)}</tr>
                  <tr><th>FIP-</th>{box!.d.map((d, i) => <td key={i} className={wonCell(d[2 + me], d[2 + them], false)}>{fmtStat(d[2 + me])}</td>)}</tr>
                  <tr className="opp"><th>vs</th>{box!.d.map((d, i) => <td key={i}>{fmtStat(d[2 + them])}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <div className="bl-wl">
              Inning 9 · alumni clubs&apos; W-L this week: <b>{wl[0]}–{wl[1]}</b> ({pct(wl[0], wl[1])}) vs {owl[0]}–{owl[1]} ({pct(owl[0], owl[1])})
              {innings[16 + me] ? <em> · 1 run</em> : null}
            </div>
            <div className="bl-legend">Gold = this school won that run. A run goes to the better OPS+ or FIP- (lower is better), and only for beating league average (100) when the other school had nobody play.</div>
          </div>
          {sim && <div className="bl-muted small">* simulated from his 2026 college season totals</div>}
        </>
      )}
    </div>
  );
}

function fmtStat(v: number | null | undefined) {
  return v === null || v === undefined ? '–' : String(v);
}

// A day cell is gold when this school won that run: the better value
// against the other school, or - when the other school had nobody play -
// beating league average (100). Same rule as the engine ('hold').
function wonCell(mine: number | null | undefined, theirs: number | null | undefined, higher: boolean) {
  if (mine === null || mine === undefined) return '';
  const other = theirs ?? 100;
  return (higher ? mine > other : mine < other) ? 'won' : '';
}

function abbr(name: string) {
  const words = name.replace(/[^A-Za-z .'-]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

function Styles() {
  return (
    <style jsx global>{`
      body { background: #0b0d10; }
      .bl { --bg:#0b0d10; --panel:#141820; --panel2:#1b2029; --line:#262c37; --text:#e9ecf1; --muted:#8b93a1; --gold:#ffd24a; --win:#7fd18b; --loss:#e2786a;
        min-height:100vh; background:var(--bg); color:var(--text); font:400 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding:24px 16px 80px; }
      .bl * { box-sizing:border-box; }
      .bl-head { max-width:1180px; margin:0 auto 16px; display:flex; flex-direction:column; gap:6px; }
      .bl-kick { font:500 11px/1.3 Oswald, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); }
      .bl-head h1 { margin:0; font:400 clamp(34px,6vw,56px)/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; }
      .bl-sum { margin:0; color:var(--muted); }
      .bl-sum b { color:var(--text); }
      .bl-nav { position:sticky; top:0; z-index:5; background:rgba(11,13,16,.96); backdrop-filter:blur(6px); margin:0 -16px 16px; padding:10px 16px; border-bottom:1px solid var(--line); }
      .bl-nav > * { max-width:1180px; margin-left:auto; margin-right:auto; }
      .bl-pills { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin; }
      .bl-pills button { flex:none; display:flex; flex-direction:column; align-items:flex-start; gap:1px; padding:6px 10px; border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--text); cursor:pointer; }
      .bl-pills button b { font:500 13px/1.1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-pills button span { font-size:11px; color:var(--muted); white-space:nowrap; }
      .bl-pills button.on { border-color:var(--gold); background:#2a2412; }
      .bl-pills button.on b { color:var(--gold); }
      .bl-filters { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
      .bl-search { flex:1 1 220px; }
      .bl-search input, .bl-filters select { width:100%; height:38px; padding:0 12px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font-size:15px; }
      .bl-filters select { width:auto; flex:0 1 230px; }
      .bl-favbtn { height:38px; padding:0 14px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font:500 14px/1 Oswald, sans-serif; letter-spacing:.04em; cursor:pointer; }
      .bl-favbtn.on { border-color:var(--gold); color:var(--gold); }
      .bl-count { margin-top:6px; color:var(--muted); font-size:12.5px; }
      .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
      .bl-rows { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:26px; }
      .bl-row { display:flex; flex-direction:column; gap:10px; min-width:0; }
      .bl-rowhead { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; }
      .bl-round { font:500 11.5px/1.3 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); width:100%; }
      .bl-title { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; font-size:15.5px; }
      .bl-title i { font-style:normal; color:var(--muted); font-size:12.5px; }
      .bl-vs { color:var(--muted); font-size:12px; }
      .bl-result { color:var(--win); font:500 13px/1.3 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-star { border:0; background:none; color:var(--muted); font-size:18px; line-height:1; cursor:pointer; padding:0 2px; }
      .bl-star.on { color:var(--gold); }
      .bl-cards { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
      .bl-cards.n1 { grid-template-columns:minmax(0, 380px); }
      @media (max-width:1000px) {
        .bl-cards { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap:10px; padding-bottom:6px; margin:0 -16px; padding-left:16px; padding-right:16px; }
        .bl-cards > * { flex:0 0 min(360px, 88vw); scroll-snap-align:start; }
      }
      .bl-card { perspective:1600px; min-width:0; }
      .bl-inner { display:grid; transition:transform .55s cubic-bezier(.2,.7,.2,1); transform-style:preserve-3d; }
      .bl-card.flipped .bl-inner { transform:rotateY(180deg); }
      .bl-face { grid-area:1/1; backface-visibility:hidden; -webkit-backface-visibility:hidden; background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; min-width:0; }
      .bl-back { transform:rotateY(180deg); }
      @media (prefers-reduced-motion: reduce) { .bl-inner { transition:none; } }
      .bl-f { display:flex; flex-direction:column; min-width:0; }
      .bl-top { display:block; width:100%; border:0; padding:10px 12px 12px; background:var(--panel2); color:inherit; text-align:left; cursor:pointer; }
      .bl-meta { display:flex; justify-content:space-between; gap:8px; color:var(--muted); font:500 11px/1.2 Oswald, sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bl-score { display:grid; grid-template-columns:1fr auto auto auto 1fr; align-items:center; gap:10px; margin-top:8px; }
      .bl-team { min-width:0; font-size:13.5px; line-height:1.15; color:var(--muted); overflow-wrap:anywhere; }
      .bl-team.r { text-align:right; }
      .bl-team.me { color:var(--text); }
      .bl-team.me b { color:var(--gold); }
      .bl-runs { font:400 40px/1 "Bebas Neue", Oswald, sans-serif; }
      .bl-final { font:600 11px/1 Oswald, sans-serif; letter-spacing:.12em; color:var(--muted); }
      .bl-scroll { overflow-x:auto; }
      .bl-ls { width:100%; border-collapse:collapse; font:500 13px/1 Oswald, sans-serif; font-variant-numeric:tabular-nums; }
      .bl-ls th, .bl-ls td { padding:7px 3px; text-align:center; border-bottom:1px solid var(--line); }
      .bl-ls thead th { color:var(--muted); font-weight:400; font-size:11.5px; }
      .bl-ls tbody th { text-align:left; padding-left:12px; font-weight:500; color:var(--muted); }
      .bl-ls tr.me th { color:var(--gold); }
      .bl-ls td { color:#5d6573; }
      .bl-ls td.hit { color:var(--text); }
      .bl-ls .sep { border-left:1px solid var(--line); }
      .bl-ls td.r { color:var(--text); font-size:15px; }
      .bl-note { padding:6px 12px; color:var(--gold); font-size:12px; border-bottom:1px solid var(--line); }
      .bl-tabs { display:flex; align-items:center; gap:14px; padding:10px 12px 6px; }
      .bl-tabs span.on { font:500 16px/1.1 Oswald, sans-serif; letter-spacing:.03em; }
      .bl-tabs button { border:0; background:none; color:var(--muted); font:500 13px/1.1 Oswald, sans-serif; cursor:pointer; padding:0; }
      .bl-tabs em { margin-left:auto; font-style:normal; font:600 13px/1 Oswald, sans-serif; padding:3px 7px; border-radius:4px; }
      .bl-tabs em.me { background:rgba(127,209,139,.15); color:var(--win); }
      .bl-tabs em.them { background:rgba(226,120,106,.15); color:var(--loss); }
      .bl-tabs em.tie { background:rgba(255,255,255,.08); color:var(--muted); }
      .bl-box { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
      .bl-box th, .bl-box td { padding:5px 3px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
      .bl-box thead th { color:var(--muted); font:500 11px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-box .nm { text-align:left; padding-left:10px; max-width:118px; overflow:hidden; text-overflow:ellipsis; }
      .bl-box .nm small { color:var(--muted); font-size:10px; }
      .bl-box .none { color:var(--muted); font-style:italic; }
      .bl-box .plus { color:var(--gold); font-weight:600; padding-right:10px; }
      .bl-box tr.tot td { font-weight:700; border-bottom:0; }
      .bl-how { margin:10px 12px 12px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.02); }
      .bl-howt { font:500 11px/1.2 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
      .bl-days { width:100%; border-collapse:collapse; font-size:11.5px; font-variant-numeric:tabular-nums; }
      .bl-days th, .bl-days td { padding:3px 2px; text-align:center; }
      .bl-days thead th { color:var(--muted); font-weight:500; }
      .bl-days tbody th { text-align:left; color:var(--muted); font-weight:500; }
      .bl-days tr.opp td { color:var(--muted); }
      .bl-days td.won { color:#000; background:var(--gold); border-radius:4px; font-weight:700; }
      .bl-wl { margin-top:6px; font-size:12px; color:var(--muted); }
      .bl-wl b { color:var(--text); }
      .bl-wl em { color:var(--gold); font-style:normal; }
      .bl-legend { margin-top:4px; font-size:11px; color:#6a7280; }
      .bl-muted { padding:10px 12px; color:var(--muted); font-size:13px; }
      .bl-muted.small { padding-top:0; font-size:11.5px; }
      .bl-empty { max-width:1180px; margin:40px auto; color:var(--muted); }
      .bl-sentinel { height:1px; }
      .bl-link { border:0; background:none; padding:0; color:inherit; font:inherit; cursor:pointer; text-align:left; }
      .bl-link:hover b, .bl-link:hover { text-decoration:underline; text-underline-offset:3px; }
      .bl-boards { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
      .bl-weekbar { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px 10px; }
      .bl-weekbar button { width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font-size:20px; line-height:1; cursor:pointer; }
      .bl-weekbar button:disabled { opacity:.35; cursor:default; }
      .bl-weekbar input { width:100%; accent-color:var(--gold); }
      .bl-weeklabel { grid-column:1 / -1; color:var(--muted); font-size:13.5px; }
      .bl-weeklabel b { color:var(--gold); font:500 15px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-announce { border:1px solid var(--gold); border-radius:12px; background:linear-gradient(180deg, #2a2412, var(--panel)); padding:14px 16px; }
      .bl-announce-t { font:500 13px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); }
      .bl-announce p { margin:6px 0 10px; color:var(--muted); font-size:13.5px; }
      .bl-announce p b { color:var(--text); }
      .bl-announce ol { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:6px 16px; }
      .bl-announce li { display:flex; align-items:baseline; gap:8px; min-width:0; }
      .bl-announce li .seed { color:var(--gold); font:500 14px/1 Oswald, sans-serif; width:24px; flex:none; }
      .bl-announce li i { color:var(--muted); font-style:normal; font-size:12px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bl-announce li .runs { font:500 13px/1 Oswald, sans-serif; flex:none; }
      .bl-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; align-items:start; }
      @media (max-width:900px) { .bl-grid { grid-template-columns:minmax(0, 1fr); } }
      .bl-board { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; min-width:0; }
      .bl-board-h { padding:10px 12px; background:var(--panel2); border-bottom:1px solid var(--line); font:500 15px/1.2 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-board-h span { color:var(--muted); font-size:13px; margin-left:6px; }
      .bl-board table { width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
      .bl-board th, .bl-board td { padding:6px 6px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; }
      .bl-board thead th { color:var(--muted); font:500 11px/1 Oswald, sans-serif; letter-spacing:.05em; }
      .bl-board .rk { width:28px; text-align:right; color:var(--muted); }
      .bl-board .nm { text-align:left; max-width:0; width:100%; overflow:hidden; text-overflow:ellipsis; }
      .bl-board .nm .bl-star { font-size:15px; margin-right:2px; }
      .bl-board td.r { color:var(--text); font-weight:700; }
      .bl-board td.pos { color:var(--win); }
      .bl-board td.neg { color:var(--loss); }
      .bl-board .st { text-align:left; font-size:11.5px; }
      .bl-board td.st.alive { color:var(--text); }
      .bl-board td.st.out { color:var(--muted); }
      .bl-board td.st.champ { color:var(--gold); }
      .bl-board tr.lead td { background:rgba(255,210,74,.08); }
      .bl-board tr.lead .nm .bl-link { color:var(--gold); font-weight:600; }
      .bl-board tr.extra td { border-top:1px dashed var(--line); }
      .bl-board em.q { margin-left:6px; font-style:normal; font:600 10px/1 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#000; background:var(--gold); padding:2px 5px; border-radius:3px; }
      .bl-board td.none { text-align:left; color:var(--muted); font-style:italic; }
      @media (max-width:520px) { .bl-board .st { display:none; } }
      .bl-more { display:block; width:100%; padding:9px; border:0; background:none; color:var(--gold); font:500 13px/1 Oswald, sans-serif; letter-spacing:.05em; cursor:pointer; }
      .bl-school { max-width:1180px; margin:0 auto 18px; display:flex; flex-direction:column; gap:6px; }
      .bl-backlink { align-self:flex-start; border:0; background:none; color:var(--gold); font:500 13px/1 Oswald, sans-serif; letter-spacing:.05em; cursor:pointer; padding:0; }
      .bl-school-t { font:400 clamp(28px,5vw,40px)/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
      .bl-school-t i { font:400 14px/1 system-ui, sans-serif; color:var(--muted); font-style:normal; }
      .bl-school-t .bl-star { font-size:22px; }
      .bl-school-s { color:var(--muted); font-size:13.5px; }
      .bl-school-s b { color:var(--text); }
      .bl-foot { max-width:1180px; margin:32px auto 0; color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); padding-top:12px; }
    `}</style>
  );
}
