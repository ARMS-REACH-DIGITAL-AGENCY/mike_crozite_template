'use client';

// src/components/bracket/FantasyTimeline.tsx
// Row 3 on a school's fantasy page (the Fantasy Bracket Tourney tab), where a
// player profile has its Career Path Timeline: a slide per week - the 30
// weeks, and the postseason weeks once the school is in them. Each slide has
// the opponent's crest and the result (or the date, or TBD); tapping one
// brings that week's card into view below. Opens on the current week.

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH, getSchoolCrestUrl } from '@/lib/schoolAssets';
import { type Index, type LbGame, LAST_WEEK, fmtDate, loadIndex, loadLb, previewDate, shortName } from './gallery';
import { type Star, calendar, lastName, loadStars, runsThrough, schoolSeason } from './schoolSeason';
import { focusWeek } from './bracketNav';

export default function FantasyTimeline() {
  const school = useContext(SchoolContext);
  const me = Number(school?.hsid || 0);
  const [data, setData] = useState<{ index: Index; lb: LbGame[]; asof: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadIndex(), loadLb()]).then(([index, lb]) => { if (!cancelled) setData({ index, lb, asof: previewDate() }); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const cards = useMemo(() => (data ? schoolSeason(data.index, data.lb, me, data.asof) : []), [data, me]);
  // Alumni of the Week, on each final week's slide.
  const [stars, setStars] = useState<Record<number, Star>>({});
  const region = data?.index.schools[me]?.[1];
  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    loadStars(region).then((all) => { if (!cancelled) setStars(all[me] || {}); });
    return () => { cancelled = true; };
  }, [region, me]);
  const week = data ? calendar(data.index, data.asof).week : 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [cards.length]);
  // Open on this week's slide.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !cards.length) return;
    const cur = el.querySelector<HTMLElement>('.yft-slide.now');
    if (cur) el.scrollLeft = cur.offsetLeft - el.clientWidth / 2 + cur.offsetWidth / 2;
  }, [cards.length]);

  const scroll = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  const S = data?.index.schools || {};
  return (
    <div className="gallery-strip yft" data-active-section="fantasy">
      <button type="button" className={`gallery-strip-arrow left ${edges.left ? '' : 'hidden'}`} onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
      <div ref={scrollRef} className="gallery-strip-inner" role="list" aria-label="The season, week by week">
        {cards.map((c) => {
          const g = c.game;
          const opp = g ? (g[2] === me ? g[3] : g[2]) : 0;
          const [hr, ar] = g ? runsThrough(g, c.days) : [0, 0];
          const mine = g && g[2] === me ? hr : ar;
          const theirs = g && g[2] === me ? ar : hr;
          const star = c.state === 'final' ? stars[c.week] : undefined;
          const res = g && c.state === 'final' ? (g[6] === null ? 'T' : g[6] === me ? 'W' : 'L') : '';
          const bottom = c.state === 'final' ? `${res} ${mine}–${theirs}`
            : c.state === 'live' ? `${mine}–${theirs}`
            : c.state === 'bye' ? 'Bye'
            : c.state === 'next' && data ? fmtDate(data.index.weeks[c.week - 1][0])
            : 'TBD';
          return (
            <button key={c.week} type="button" role="listitem"
              className={`gallery-slot yft-slide ${c.state}${c.week === week ? ' now' : ''}${c.week > LAST_WEEK ? ' post' : ''}`}
              title={`Week ${c.week} · ${c.stage}${opp ? ` · vs ${shortName(S[opp]?.[0] || '')}` : ''}${star ? ` · Alumni of the Week: ${star[0]}` : ''}`}
              onClick={() => focusWeek(c.week)}>
              <span className="yft-wk">{c.week > LAST_WEEK ? 'Post' : 'Wk'} {c.week}</span>
              {opp
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="yft-crest" src={getSchoolCrestUrl(opp)} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = CREST_FALLBACK_PATH; }} />
                : <span className="yft-q">{c.state === 'bye' ? '–' : '?'}</span>}
              <span className={`yft-res ${res}${star ? ' up' : ''}`}>{bottom}</span>
              {star && <span className="yft-star">★ {lastName(star[0])}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className={`gallery-strip-arrow right ${edges.right ? '' : 'hidden'}`} onClick={() => scroll(1)} aria-label="Scroll right">›</button>
      <style jsx>{`
        .yft-slide { position:relative; padding:0; border:0; cursor:pointer; color:#fff; background:#111;
          display:flex; flex-direction:column; align-items:center; justify-content:center; font:inherit; }
        .yft-slide.tbd, .yft-slide.bye { background:#1a1d22; }
        .yft-slide.post { background:#241f10; }
        .yft-slide.now { box-shadow:inset 0 0 0 2px var(--gold, #ffc107); }
        .yft-wk { position:absolute; top:6px; left:0; right:0; text-align:center; font:700 8.5px/1 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:#9e9e9e; }
        .yft-slide.now .yft-wk { color:var(--gold, #ffc107); }
        .yft-crest { width:40px; height:40px; object-fit:contain; margin-top:-10px; }
        .yft-q { font:400 30px/1 "Bebas Neue", Oswald, sans-serif; color:#6a7280; margin-top:-4px; }
        .yft-res { position:absolute; left:2px; right:2px; bottom:5px; text-align:center; font:700 9.5px/1.05 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#cfd3da; }
        .yft-res.up { bottom:17px; }
        .yft-star { position:absolute; left:2px; right:2px; bottom:5px; text-align:center; font:600 8px/1.1 Oswald, sans-serif; letter-spacing:.03em; color:var(--gold, #ffc107); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .yft-res.W { color:#7fd18b; }
        .yft-res.L { color:#e2786a; }
      `}</style>
    </div>
  );
}
