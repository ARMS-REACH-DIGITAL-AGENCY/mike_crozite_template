'use client';

// src/components/bracket/BracketLab.tsx
// The 2026 National Alumni Bracket as a gallery of flip cards. One card is
// one game (one week): the front is one school's box score, the back the
// other's, both under the same 9-inning line score. A row of three cards is
// a series; rounds stack down the page. Filters: round, region, a school
// search and favorite schools (kept in this browser).
//
// Data: /bracket-lab/2026/index.json (every series and line score) and one
// box-score file per round + region, fetched when its cards come on screen.

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
  lbChampion: number;
  grandChampion: number;
};
// [playerid, name, level, simulated, bat [PA AB H 2B 3B HR BB HBP SF] | 0, pit [outs HR BB HBP K] | 0, OPS+, FIP-]
type PlayerRow = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null];
type SideBox = { p: PlayerRow[]; wl: [number, number] };
type GameBox = { d: (number | null)[][]; h: SideBox; a: SideBox };

const BASE = '/bracket-lab/2026';
const FAV_KEY = 'yat-bracket-lab-favs';
const REGIONS: Record<number, string> = {
  1: 'The Giants', 2: 'The Frontier', 3: 'The Heat', 4: 'Rivals', 5: 'Grinders', 6: 'Corridor', 7: 'Prep Elite', 8: 'Talent Factory',
};
const LBT_ROUNDS: Record<number, string> = { 28: 'Quarterfinal', 29: 'Semifinal', 30: 'Final' };
const TIE_NOTE: Record<string, string> = {
  ops: "Tied after 9 · won on the week's OPS+",
  fip: "Tied after 9 · won on the week's FIP-",
  wl: 'Tied after 9 · won on W-L%',
  seed: 'Tied after 9 · won on seed',
};

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

type View = { kind: 'round'; r: number } | { kind: 'lbt' } | { kind: 'gf' } | { kind: 'season' };

// One row in the gallery: a series (three cards) or a single game.
type Row = {
  key: string;
  roundLabel: string;
  title: string;
  region: number;
  home: number;
  away: number;
  homeSeed: number;
  awaySeed: number;
  result: string;
  file: string;
  games: GameRow[];
  gameLabels: string[];
};

export default function BracketLab() {
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>({ kind: 'round', r: 1 });
  const [region, setRegion] = useState(0);
  const [query, setQuery] = useState('');
  const [onlyFavs, setOnlyFavs] = useState(false);
  const { favs, toggle } = useFavorites();

  useEffect(() => {
    fetch(`${BASE}/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setIndex)
      .catch((e) => setError(String(e)));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!index) return [];
    const S = index.schools;
    const name = (h: number) => S[h]?.[0] || String(h);
    const out: Row[] = [];
    const addRound = (round: Round) => {
      for (const s of round.series) {
        const [reg, home, away, hs, as, winner, wins, games] = s;
        const w = winner === home ? home : away;
        const wWins = winner === home ? wins[0] : wins[1];
        const lWins = winner === home ? wins[1] : wins[0];
        out.push({
          key: `r${round.r}-${home}-${away}`,
          roundLabel: `${round.name}${reg ? ` · Region ${reg}` : ''}`,
          title: `#${hs} ${shortName(name(home))} vs #${as} ${shortName(name(away))}`,
          region: reg,
          home, away, homeSeed: hs, awaySeed: as,
          result: `${shortName(name(w))} wins the series ${wWins}–${lWins}`,
          file: `d-${round.r}-${reg}`,
          games,
          gameLabels: games.map((_, i) => `Game ${i + 1}`),
        });
      }
    };
    if (view.kind === 'round') addRound(index.rounds[view.r - 1]);
    if (view.kind === 'season') index.rounds.forEach(addRound);
    if (view.kind === 'lbt' || view.kind === 'season') {
      for (const { seeds, game } of index.lbt) {
        const [, week, home, away, , , winner] = game;
        out.push({
          key: `lbt-${game[0]}`,
          roundLabel: `Leaderboard Tournament · ${LBT_ROUNDS[week] || ''}`,
          title: `#${seeds[0]} ${shortName(name(home))} vs #${seeds[1]} ${shortName(name(away))}`,
          region: 0,
          home, away, homeSeed: seeds[0], awaySeed: seeds[1],
          result: `${shortName(name(winner!))} advances`,
          file: 'd-lbt',
          games: [game],
          gameLabels: [LBT_ROUNDS[week] || 'Game'],
        });
      }
    }
    if (view.kind === 'gf' || view.kind === 'season') {
      for (const game of index.gf) {
        const [, , home, away, , , winner] = game;
        out.push({
          key: `gf-${game[0]}`,
          roundLabel: 'Grand Final',
          title: `${shortName(name(home))} (bracket champion) vs ${shortName(name(away))} (leaderboard champion)`,
          region: 0,
          home, away, homeSeed: 1, awaySeed: 2,
          result: `${shortName(name(winner!))} wins the Grand Final`,
          file: 'd-gf',
          games: [game],
          gameLabels: ['Grand Final'],
        });
      }
    }
    const q = query.trim().toLowerCase();
    return out.filter((row) => {
      if (region && row.region && row.region !== region) return false;
      if (region && !row.region) return false;
      if (onlyFavs && !favs.has(row.home) && !favs.has(row.away)) return false;
      if (q && !name(row.home).toLowerCase().includes(q) && !name(row.away).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [index, view, region, query, onlyFavs, favs]);

  const { shown, sentinel } = useReveal(rows.length);

  if (error) return <main className="bl"><p className="bl-empty">Could not load the bracket ({error}).</p><Styles /></main>;
  if (!index) return <main className="bl"><p className="bl-empty">Loading the 2026 bracket…</p><Styles /></main>;

  const S = index.schools;
  const nm = (h: number) => shortName(S[h]?.[0] || String(h));
  const viewKey = view.kind === 'round' ? `r${view.r}` : view.kind;
  const pick = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

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
          {index.rounds.map((r) => (
            <button key={r.r} type="button" className={viewKey === `r${r.r}` ? 'on' : ''} onClick={() => pick({ kind: 'round', r: r.r })}>
              <b>{r.r <= 6 ? `R${r.r}` : r.name}</b>
              <span>{fmtRange(r.start, r.end)}</span>
            </button>
          ))}
          <button type="button" className={viewKey === 'lbt' ? 'on' : ''} onClick={() => pick({ kind: 'lbt' })}>
            <b>Leaderboard 8</b><span>Aug 17 – Sep 6</span>
          </button>
          <button type="button" className={viewKey === 'gf' ? 'on' : ''} onClick={() => pick({ kind: 'gf' })}>
            <b>Grand Final</b><span>Sep 7 – 13</span>
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
        <div className="bl-count">{rows.length.toLocaleString()} {rows.length === 1 ? 'matchup' : 'matchups'} · tap a card to flip it</div>
      </nav>

      <section className="bl-rows">
        {rows.slice(0, shown).map((row) => (
          <SeriesRowView key={row.key} row={row} index={index} favs={favs} onFav={toggle} />
        ))}
        {rows.length === 0 && <p className="bl-empty">{onlyFavs && !favs.size ? 'Star a school on any matchup to follow it here.' : 'No matchups match these filters.'}</p>}
        <div ref={sentinel} className="bl-sentinel" aria-hidden="true" />
      </section>
      <footer className="bl-foot">
        Simulated on 2026 stats: pros are real box scores (spring training included); college lines marked * are simulated from each player&apos;s 2026 season totals.
        OPS+ and FIP- compare every player with the average at his own level (100 = average).
      </footer>
      <Styles />
    </main>
  );
}

function SeriesRowView({ row, index, favs, onFav }: { row: Row; index: Index; favs: Set<number>; onFav: (h: number) => void }) {
  const S = index.schools;
  const [boxes, setBoxes] = useState<Record<string, GameBox> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        loadBoxes(row.file).then((b) => { if (!cancelled) setBoxes(b); });
      }
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [row.file]);

  const star = (h: number) => (
    <button type="button" className={`bl-star${favs.has(h) ? ' on' : ''}`} onClick={() => onFav(h)} aria-pressed={favs.has(h)} aria-label={`${favs.has(h) ? 'Unfollow' : 'Follow'} ${S[h]?.[0]}`}>
      {favs.has(h) ? '★' : '☆'}
    </button>
  );

  return (
    <div className="bl-row" ref={ref}>
      <div className="bl-rowhead">
        <div className="bl-round">{row.roundLabel}</div>
        <div className="bl-title">
          {star(row.home)}<span>#{row.homeSeed} <b>{shortName(S[row.home]?.[0] || '')}</b> <i>{place(S[row.home]?.[0] || '')}</i></span>
          <span className="bl-vs">vs</span>
          {star(row.away)}<span>#{row.awaySeed} <b>{shortName(S[row.away]?.[0] || '')}</b> <i>{place(S[row.away]?.[0] || '')}</i></span>
        </div>
        <div className="bl-result">{row.result}</div>
      </div>
      <div className={`bl-cards n${row.games.length}`}>
        {row.games.map((g, i) => (
          <FlipCard key={g[0]} game={g} label={row.gameLabels[i]} index={index} box={boxes ? boxes[String(g[0])] : undefined} loading={!boxes} />
        ))}
      </div>
    </div>
  );
}

function FlipCard({ game, label, index, box, loading }: { game: GameRow; label: string; index: Index; box?: GameBox; loading: boolean }) {
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
        <div className="bl-face bl-front">{face('h')}</div>
        <div className="bl-face bl-back">{face('a')}</div>
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
      {TIE_NOTE[decidedBy] && <div className="bl-note">{TIE_NOTE[decidedBy]}</div>}
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
      .bl-foot { max-width:1180px; margin:32px auto 0; color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); padding-top:12px; }
    `}</style>
  );
}
