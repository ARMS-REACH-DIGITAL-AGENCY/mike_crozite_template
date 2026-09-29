'use client';

// src/components/yatstats/TeammatesList.tsx
// The narrow column beside the Stories feed: everyone the player shared a
// roster with, in small type, one line per teammate per season (a teammate
// for three years is listed three times, once with each year).
//   A-Z:  every line by last name, each with its year.
//   Year: newest season first, under that season's year and team.
// Every name links to that teammate's profile when he has one.

import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';

type TeammateSeason = { playerId: string; name: string; sortName: string; href: string | null; year: number; team: string };
type Order = 'az' | 'year';

function Name({ t }: { t: TeammateSeason }) {
  return t.href
    ? <a href={t.href} onClick={() => track('teammate_click', { teammate_id: t.playerId, teammate_year: t.year })}>{t.name}</a>
    : <span className="ytm-plain">{t.name}</span>;
}

export default function TeammatesList({ playerId }: { playerId: string }) {
  const [rows, setRows] = useState<TeammateSeason[] | null>(null);
  const [order, setOrder] = useState<Order>('az');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teammates?playerId=${encodeURIComponent(playerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setRows(Array.isArray(data?.teammates) ? data.teammates : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [playerId]);

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
  const total = new Set(rows.map((t) => t.playerId)).size;

  return (
    <aside className="ytm" aria-label="Teammates">
      <div className="ytm-title">Teammates <span className="ytm-on">on</span> YAT?STATS <span className="ytm-count">*({total})</span></div>
      <div className="ytm-sort" role="group" aria-label="Sort teammates">
        <button type="button" className={order === 'az' ? 'on' : ''} aria-pressed={order === 'az'} onClick={() => setOrder('az')}>A–Z</button>
        <button type="button" className={order === 'year' ? 'on' : ''} aria-pressed={order === 'year'} onClick={() => setOrder('year')}>Year</button>
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
        .ytm { min-width: 0; color: var(--ysf-text, rgba(255,255,255,.88)); font: 400 10px/1.35 system-ui, sans-serif; }
        .ytm-note { margin: 10px 0 0; color: var(--ysf-muted, rgba(255,255,255,.55)); font: 400 7px/1.3 system-ui, sans-serif; }
        .ytm-title { margin: 0 0 6px; color: var(--ysf-when, #ffc107); font: 400 13px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .ytm-on { text-transform: none; }
        .ytm-count { color: var(--ysf-muted, rgba(255,255,255,.55)); }
        .ytm-sort { display: flex; gap: 2px; margin: 0 0 8px; }
        .ytm-sort button { flex: 1; min-height: 22px; padding: 0 4px; border: 1px solid var(--ysf-card-border, rgba(255,255,255,.14)); border-radius: 4px; background: var(--ysf-card-bg, rgba(255,255,255,.055)); color: var(--ysf-muted, rgba(255,255,255,.55)); font: 600 9px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
        .ytm-sort button.on { border-color: var(--ysf-when, #ffc107); color: var(--ysf-when, #ffc107); }
        .ytm-group { margin: 0 0 9px; }
        .ytm-head { color: var(--ysf-strong, #fff); font: 600 9px/1.25 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; }
        .ytm-head-yr { color: var(--ysf-when, #ffc107); }
        ul { margin: 2px 0 0; padding: 0; list-style: none; }
        li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        a { color: inherit; text-decoration: none; }
        a:hover, a:focus-visible { color: var(--ysf-when, #ffc107); text-decoration: underline; }
        .ytm-plain { color: var(--ysf-muted, rgba(255,255,255,.55)); }
        .ytm-yr { color: var(--ysf-when, #ffc107); font-size: 9px; }
        @media (max-width: 899px) {
          .ytm { font-size: 9px; }
          .ytm-title { font-size: 11px; }
          .ytm-note { font-size: 6.5px; }
          .ytm-sort button { min-height: 20px; font-size: 8px; }
          .ytm-head { font-size: 8px; }
          .ytm-yr { font-size: 8px; }
        }
      `}</style>
    </aside>
  );
}
