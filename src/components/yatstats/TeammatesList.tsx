'use client';

// src/components/yatstats/TeammatesList.tsx
// The narrow column beside the Stories feed: everyone the player shared a
// roster with (high school, then college and pro, in order), in small type.
// Every name links to that teammate's profile when he has one.

import { useEffect, useState } from 'react';

type Teammate = { playerId: string; name: string; href: string | null };
type Group = { key: string; team: string; level: string; years: string; teammates: Teammate[] };

export default function TeammatesList({ playerId }: { playerId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teammates?playerId=${encodeURIComponent(playerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setGroups(Array.isArray(data?.groups) ? data.groups : []); })
      .catch(() => { if (!cancelled) setGroups([]); });
    return () => { cancelled = true; };
  }, [playerId]);

  if (!groups?.length) return null;
  const total = new Set(groups.flatMap((g) => g.teammates.map((t) => t.playerId))).size;

  return (
    <aside className="ytm" aria-label="Teammates">
      <div className="ytm-title">Teammates <span>{total}</span></div>
      {groups.map((g) => (
        <section key={g.key} className="ytm-group">
          <div className="ytm-team">{g.team}</div>
          {g.years && <div className="ytm-years">{g.years}</div>}
          <ul>
            {g.teammates.map((t) => (
              <li key={t.playerId}>
                {t.href ? <a href={t.href}>{t.name}</a> : <span>{t.name}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <style jsx>{`
        .ytm { min-width: 0; color: var(--ysf-text, rgba(255,255,255,.88)); font: 400 10px/1.35 system-ui, sans-serif; }
        .ytm-title { margin: 0 0 8px; color: var(--ysf-when, #ffc107); font: 400 13px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .ytm-title span { color: var(--ysf-muted, rgba(255,255,255,.55)); }
        .ytm-group { margin: 0 0 10px; }
        .ytm-team { color: var(--ysf-strong, #fff); font: 600 10px/1.2 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; }
        .ytm-years { margin-top: 1px; color: var(--ysf-when, #ffc107); font: 600 9px/1.2 Oswald, sans-serif; letter-spacing: .04em; }
        ul { margin: 3px 0 0; padding: 0; list-style: none; }
        li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        a { color: inherit; text-decoration: none; }
        a:hover, a:focus-visible { color: var(--ysf-when, #ffc107); text-decoration: underline; }
        span { color: var(--ysf-muted, rgba(255,255,255,.55)); }
        @media (max-width: 899px) {
          .ytm { font-size: 9px; }
          .ytm-title { font-size: 11px; }
          .ytm-team { font-size: 9px; }
          .ytm-years { font-size: 8px; }
        }
      `}</style>
    </aside>
  );
}
