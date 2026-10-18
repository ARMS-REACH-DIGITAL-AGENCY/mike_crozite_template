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
        <ul>
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
            <ul>
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
        .ytm { min-width: 0; color: var(--ytm-text, rgba(255,255,255,.88)); font: 400 15px/1.5 var(--yat-font-ui, system-ui, sans-serif); }
        .ytm-sticky { position: sticky; top: 0; z-index: 2; padding: 0 0 10px; background: var(--ytm-bg, #0b0b0b); }
        .ytm-note { margin: 18px 0 0; color: var(--ytm-muted, rgba(255,255,255,.55)); font: 400 11px/1.4 var(--yat-font-ui, system-ui, sans-serif); }
        .ytm-title { margin: 0 0 10px; color: var(--ytm-accent, #ffc107); font: 700 22px/1 var(--yat-font-compact, Oswald, sans-serif); letter-spacing: .01em; text-transform: uppercase; }
        .ytm-title { margin-bottom: 4px; font-size: 28px; }
        .ytm-sub { margin: 0 0 12px; color: var(--ytm-muted, rgba(255,255,255,.55)); font: 600 12px/1.2 var(--yat-font-ui, system-ui, sans-serif); letter-spacing: .04em; text-transform: uppercase; }
        .ytm-sub b { color: var(--ytm-strong, #fff); }
        .ytm-brand { white-space: nowrap; }
        .ytm-sort { display: flex; gap: 6px; }
        .ytm-sort button { flex: 1; min-height: 34px; padding: 0 10px; border: 1px solid var(--ytm-border, rgba(255,255,255,.16)); border-radius: 6px; background: transparent; color: var(--ytm-muted, rgba(255,255,255,.6)); font: 700 15px/1 var(--yat-font-compact, Oswald, sans-serif); letter-spacing: .04em; text-transform: uppercase; cursor: pointer; }
        .ytm-sort button.on { border-color: var(--ytm-accent, #ffc107); color: var(--ytm-accent, #ffc107); }
        .ytm-group { margin: 0 0 16px; }
        .ytm-head { padding: 0 0 4px; margin-bottom: 4px; border-bottom: 1px solid var(--ytm-border, rgba(255,255,255,.16)); color: var(--ytm-strong, #fff); font: 700 16px/1.2 var(--yat-font-compact, Oswald, sans-serif); letter-spacing: .02em; text-transform: uppercase; overflow-wrap: anywhere; }
        .ytm-head-yr { color: var(--ytm-accent, #ffc107); }
        ul { margin: 4px 0 0; padding: 0; list-style: none; }
        li { padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* Name is a child component and does not inherit this styled-jsx
           scope class. Keep its approved link treatment inside .ytm while
           explicitly reaching the child's rendered elements. */
        .ytm :global(a.ytm-name) { display: inline-block; padding: 4px 0; color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 30%, transparent); text-underline-offset: 3px; }
        .ytm :global(a.ytm-name:hover), .ytm :global(a.ytm-name:focus-visible), .ytm :global(a.ytm-name:active) { color: var(--ytm-accent, #ffc107); text-decoration-color: currentColor; }
        .ytm :global(.ytm-plain) { color: var(--ytm-muted, rgba(255,255,255,.55)); }
        .ytm-yr { color: var(--ytm-accent, #ffc107); font-size: 13px; }
      `}</style>
    </aside>
  );
}
