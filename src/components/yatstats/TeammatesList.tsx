'use client';

// src/components/yatstats/TeammatesList.tsx
// The Teammates drawer on the Stories tab (opened by the Teammates button
// beside the story search): everyone the player shared a roster with, one
// line per teammate per season (a teammate for three years is listed three
// times, once with each year).
//   A-Z:  every line by last name, each with its year.
//   Year: newest season first, under that season's year and team.
// Every name links to that teammate's profile when he has one.

import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';

export type TeammateSeason = { playerId: string; name: string; sortName: string; href: string | null; year: number; team: string };
type Order = 'az' | 'year';

function Name({ t }: { t: TeammateSeason }) {
  return t.href
    ? <a className="ytm-name" href={t.href} onClick={() => track('teammate_click', { teammate_playerid: t.playerId, teammate_year: t.year })}>{t.name}</a>
    : <span className="ytm-plain">{t.name}</span>;
}

// His teammates, loaded once (null while loading): the Stories tab needs
// the count for its button before the drawer is opened.
export function useTeammates(playerId: string) {
  const [rows, setRows] = useState<TeammateSeason[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teammates?playerId=${encodeURIComponent(playerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setRows(Array.isArray(data?.teammates) ? data.teammates : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [playerId]);
  return rows;
}

export function teammateCount(rows: TeammateSeason[] | null) {
  return new Set((rows || []).map((t) => t.playerId)).size;
}

export default function TeammatesList({ rows }: { rows: TeammateSeason[] | null }) {
  const [order, setOrder] = useState<Order>('az');
  const listRef = useRef<HTMLElement>(null);
  // A new order starts from the top of the list.
  const pick = (next: Order) => {
    setOrder(next);
    const scroller = listRef.current?.closest('.ytd-scroll');
    if (scroller) scroller.scrollTop = 0;
  };

  const alphabetical = useMemo(
    () => (rows || []).slice().sort((a, b) => a.sortName.localeCompare(b.sortName) || a.year - b.year),
    [rows]
  );
  // Newest season first; within a season, each team with its names A-Z.
  const bySeason = useMemo(() => {
    const groups = new Map<string, { year: number; team: string; list: TeammateSeason[] }>();
    for (const t of rows || []) {
      const key = `${t.year}|${t.team}`;
      if (!groups.has(key)) groups.set(key, { year: t.year, team: t.team, list: [] });
      groups.get(key)!.list.push(t);
    }
    return Array.from(groups.values())
      .sort((a, b) => b.year - a.year || a.team.localeCompare(b.team))
      .map((g) => ({ ...g, list: g.list.sort((a, b) => a.sortName.localeCompare(b.sortName)) }));
  }, [rows]);

  if (!rows?.length) return null;
  const total = teammateCount(rows);

  return (
    <aside className="ytm" aria-label="Teammates" ref={listRef}>
      <div className="ytm-sticky">
        <div className="ytm-title">Teammates</div>
        <div className="ytm-sub"><b>{total}</b> on <span className="ytm-brand">YAT?STATS</span>*</div>
        <div className="ytm-sort" role="group" aria-label="Sort teammates">
          <button type="button" className={order === 'az' ? 'on' : ''} aria-pressed={order === 'az'} onClick={() => pick('az')}>A–Z</button>
          <button type="button" className={order === 'year' ? 'on' : ''} aria-pressed={order === 'year'} onClick={() => pick('year')}>Year</button>
        </div>
      </div>
      {order === 'az' ? (
        <ul className="ytm-list">
          {alphabetical.map((t) => (
            <li key={`${t.playerId}-${t.year}-${t.team}`} title={`${t.team}, ${t.year}`}>
              <Name t={t} /> <span className="ytm-yr">&rsquo;{String(t.year).slice(-2)}</span>
            </li>
          ))}
        </ul>
      ) : (
        bySeason.map((g) => (
          <section key={`${g.year}-${g.team}`} className="ytm-group">
            <div className="ytm-head"><span className="ytm-head-yr">{g.year}</span> {g.team}</div>
            <ul className="ytm-list">
              {g.list.map((t) => (
                <li key={t.playerId}><Name t={t} /></li>
              ))}
            </ul>
          </section>
        ))
      )}
      {/* Only players already on the platform can be listed for now. */}
      <p className="ytm-note">*Only Next-Level Alumni from the participating 1025 high school baseball programs are currently listed on the platform.</p>
      <style jsx>{`
        /* Contribute standard: compact Archivo and a dense two-column directory. */
        .ytm { min-width:0;color:var(--ytm-text,#eee);font:400 12px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .ytm-sticky { position:sticky;top:0;z-index:2;padding:0 34px 10px 0;background:var(--ytm-bg,#111); }
        .ytm-title { margin:0 0 4px;color:var(--ytm-strong,#fff);font:800 20px/1.14 var(--yat-font-ui,Archivo,Arial,sans-serif);letter-spacing:-.025em; }
        .ytm-sub { margin:0 0 10px;color:var(--ytm-muted,#aaa);font:400 11px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .ytm-sub b { font-weight:800;color:var(--ytm-strong,#fff); }
        .ytm-brand { white-space:nowrap; }
        .ytm-sort { display:flex;align-items:center;gap:4px; }
        .ytm-sort button { flex:0 0 auto;min-height:30px;padding:0 12px;border:0;border-radius:5px;background:transparent;color:var(--ytm-muted,#aaa);font:700 11px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);cursor:pointer; }
        .ytm-sort button.on { background:rgba(128,128,128,.22);color:var(--ytm-strong,#fff); }
        .ytm-group { margin:10px 0 12px; }
        .ytm-head { margin:0 0 5px;padding:0;border:0;color:var(--ytm-strong,#fff);font:800 12px/1.25 var(--yat-font-ui,Archivo,Arial,sans-serif);letter-spacing:-.01em;overflow-wrap:anywhere; }
        .ytm-head-yr { color:var(--ytm-muted,#aaa); }
        .ytm-list { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px 10px;margin:4px 0 0;padding:0;list-style:none; }
        .ytm-list li { display:flex;align-items:center;gap:4px;min-width:0;padding:4px 6px;overflow:hidden;white-space:nowrap;border-radius:4px; }
        .ytm :global(a.ytm-name),.ytm :global(.ytm-plain) { display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 0;color:inherit;text-decoration:none; }
        .ytm-list li:nth-child(4n + 1),.ytm-list li:nth-child(4n + 2) { background:rgba(128,128,128,.075); }
        .ytm-list li:hover,.ytm-list li:focus-within { background:rgba(128,128,128,.24); }
        .ytm :global(a.ytm-name:hover),.ytm :global(a.ytm-name:focus-visible) { text-decoration:underline;text-underline-offset:2px; }
        .ytm :global(.ytm-plain) { color:var(--ytm-muted,#aaa); }
        .ytm-yr { flex:none;color:var(--ytm-muted,#aaa);font:600 10px/1.25 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .ytm-note { margin:12px 0 0;color:var(--ytm-muted,#aaa);font:400 10.5px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif); }
      `}</style>
    </aside>
  );
}
