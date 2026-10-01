'use client';

// src/components/bracket/BracketLab.tsx
// The private /bracket-lab page: the 2026 National Alumni Bracket as a
// gallery of flip cards. One card is one game (one week): the front is one
// school's box score, the back the other's, both under the same 9-inning
// line score. A row of three cards is a series; rounds stack down the page.
// Filters: round, region, a school search and favorite schools (kept in
// this browser). Leaderboards: the 8 regional leaderboards and each school's
// whole season. The pieces are shared with the schools' Fantasy Bracket
// Tourney tab (gallery.tsx).

import { useEffect, useMemo, useState } from 'react';
import {
  type Index, type LbGame, type Row, type View,
  LAST_WEEK, REGIONS, Leaderboards, SchoolHead, SeriesRowView, Styles,
  buildRows, fmtRange, loadIndex, loadLb, shortName, useFavorites, useReveal,
} from './gallery';

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
    loadIndex().then(setIndex).catch((e) => setError(String(e)));
  }, []);

  // The leaderboard games load the first time the leaderboards or a school's
  // season are opened.
  const needLb = view.kind === 'boards' || view.kind === 'school';
  useEffect(() => {
    if (!needLb || lb) return;
    loadLb().then(setLb);
  }, [needLb, lb]);

  const rows = useMemo<Row[]>(() => {
    if (!index) return [];
    const out = buildRows(index, lb, view);
    if (view.kind === 'school') return out;
    const name = (h: number) => index.schools[h]?.[0] || String(h);
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

  if (error) return <main className="bl"><p className="bl-empty">Could not load the bracket ({error}).</p><Styles /><LabBackground /></main>;
  if (!index) return <main className="bl"><p className="bl-empty">Loading the 2026 bracket…</p><Styles /><LabBackground /></main>;

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
          Bracket champion <b>{nm(index.champion)}</b> · Season champion <b>{nm(index.lbChampion)}</b> · Fantasy World Series <b>{nm(index.grandChampion)}</b>
        </p>
      </header>

      <nav className="bl-nav" aria-label="Rounds">
        <div className="bl-pills">
          <button type="button" className={viewKey === 'boards' || viewKey === 'school' ? 'on' : ''} onClick={() => pick({ kind: 'boards' })}>
            <b>Leaderboards</b><span>8 regions · most runs</span>
          </button>
          {index.rounds.map((r) => (
            <button key={r.r} type="button" className={viewKey === `r${r.r}` ? 'on' : ''} onClick={() => pick({ kind: 'round', r: r.r })}>
              <b>{`Round ${r.r}`}</b>
              <span>{fmtRange(r.start, r.end)}</span>
            </button>
          ))}
          <button type="button" className={viewKey === 'lbt' ? 'on' : ''} onClick={() => pick({ kind: 'lbt' })}>
            <b>Season Championship</b><span>Aug 31 – Sep 20</span>
          </button>
          <button type="button" className={viewKey === 'gf' ? 'on' : ''} onClick={() => pick({ kind: 'gf' })}>
            <b>Fantasy World Series</b><span>Sep 21 – 27</span>
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
      <Styles /><LabBackground />
    </main>
  );
}


// The lab page is dark end to end.
function LabBackground() {
  return <style jsx global>{`body { background: #0b0d10; }`}</style>;
}
