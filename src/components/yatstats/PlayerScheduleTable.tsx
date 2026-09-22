"use client";
// Full season schedule / game log table on the player profile page.
//
// - One row per game. Default sort is DATE DESCENDING (most recent first) -
//   a fan opening this tab wants to see how the player has been doing
//   lately, not game 1 of the season. `rows` itself (the server-computed
//   prop) stays chronological ascending; only the initial sort STATE is
//   descending, so this is a display-order choice, not a data change.
// - Sticky column headers inside their own scroll container (this is a
//   full profile page, not the space-constrained flip-card FunZone panel,
//   so an internal scroll region is appropriate here).
// - Every column is clickable to sort ascending/descending, with a ▲/▼
//   arrow on whichever column is currently sorted so it's visible that
//   every column here is sortable; rows stay intact (the whole row object
//   moves together, never individual cells).
// - On mount, scrolls to today's date (or the nearest upcoming game if
//   today is an off day) so a fan lands on "now," not buried in the
//   season - future games are still there, just a scroll up away, rather
//   than dumped above today's game by default.

import { useEffect, useMemo, useRef, useState } from "react";

export type ScheduleTableRow = {
  iso: string; // "2026-09-17"
  dateLabel: string; // "Sep 17, 2026"
  opponent: string;
  logoUrl: string | null;
  resultLetter: "W" | "L" | "T" | null;
  resultClass: string;
  stats: string[]; // aligned to statHeaders, "-" for not-yet-played games
};

type SortKey = "date" | "opponent" | "result" | number; // number = stats[] index

interface Props {
  rows: ScheduleTableRow[];
  statHeaders: string[];
  todayIso: string;
}

function compareRows(a: ScheduleTableRow, b: ScheduleTableRow, sortKey: SortKey, sortDir: 1 | -1): number {
  if (sortKey === "date") {
    return a.iso < b.iso ? -sortDir : a.iso > b.iso ? sortDir : 0;
  }

  if (sortKey === "opponent") {
    const av = a.opponent.toLowerCase();
    const bv = b.opponent.toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  }

  if (sortKey === "result") {
    const rank: Record<string, number> = { W: 0, T: 1, L: 2 };
    const aBlank = a.resultLetter == null;
    const bBlank = b.resultLetter == null;
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1; // games with no result yet always sort last
    if (bBlank) return -1;
    const av = rank[a.resultLetter as string];
    const bv = rank[b.resultLetter as string];
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  }

  // Numeric stat column - blanks (future games, "-") always sort last
  // regardless of direction, so sorting stats doesn't scatter them.
  const aRaw = a.stats[sortKey];
  const bRaw = b.stats[sortKey];
  const av = Number(aRaw);
  const bv = Number(bRaw);
  const aBlank = aRaw === "-" || aRaw === "" || !Number.isFinite(av);
  const bBlank = bRaw === "-" || bRaw === "" || !Number.isFinite(bv);
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  return av < bv ? -sortDir : av > bv ? sortDir : 0;
}

export default function PlayerScheduleTable({ rows, statHeaders, todayIso }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);

  const sortedRows = useMemo(() => {
    const dir = sortDir;
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, dir));
  }, [rows, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="pst-sort-arrow">{sortDir === 1 ? "▲" : "▼"}</span>;
  }

  // Scroll to today's date on first load - the target is computed from the
  // server-ordered `rows` prop (always ascending), not the current sort
  // state, since this only runs once on mount before any user interaction.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || rows.length === 0) return;

    const target = rows.find((r) => r.iso >= todayIso) || rows[rows.length - 1];
    const el = container.querySelector<HTMLElement>(`[data-iso="${target.iso}"]`);
    if (!el) return;

    const headerHeight = theadRef.current?.getBoundingClientRect().height || 0;
    const containerTop = container.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    container.scrollTop += elTop - containerTop - headerHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pst-wrap" ref={containerRef}>
      <table className="pst-table">
        <thead ref={theadRef}>
          <tr>
            <th onClick={() => onSort("date")}>DATE{sortIndicator("date")}</th>
            <th onClick={() => onSort("opponent")}>OPPONENT{sortIndicator("opponent")}</th>
            <th onClick={() => onSort("result")}>{sortIndicator("result")}</th>
            {statHeaders.map((label, i) => (
              <th key={label} onClick={() => onSort(i)}>
                {label}
                {sortIndicator(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={`${row.iso}-${i}`} data-iso={row.iso} className={row.iso === todayIso ? "pst-row-today" : undefined}>
              <td>{row.dateLabel}</td>
              <td className="pst-opponent">
                {row.logoUrl && <img src={row.logoUrl} alt="" className="pst-opponent-logo" />}
                {row.opponent || "--"}
              </td>
              <td>{row.resultLetter && <span className={row.resultClass}>{row.resultLetter}</span>}</td>
              {row.stats.map((v, si) => (
                <td key={si}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .pst-wrap{
          max-height: 70vh;
          overflow: auto;
          border: 1px solid var(--line, rgba(255,255,255,.08));
          border-radius: 6px;
        }
        .pst-table{
          width: 100%;
          border-collapse: collapse;
          font: 400 10px/1.4 Oswald, sans-serif;
        }
        .pst-table thead th{
          position: sticky;
          top: 0;
          z-index: 1;
          background: var(--card-bg, #1a1a1a);
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          color: var(--muted, #888);
          padding: 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
          text-align: center;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
        }
        .pst-table thead th:first-child,
        .pst-table thead th:nth-child(2){
          text-align: left;
        }
        .pst-sort-arrow{ margin-left: 4px; font-size: 7px; }
        .pst-table td{
          padding: 5px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.06));
          color: var(--fg, #f0f0f0);
          text-align: center;
          white-space: nowrap;
        }
        .pst-table td:first-child,
        .pst-table td:nth-child(2){
          text-align: left;
        }
        .pst-row-today td{
          background: rgba(200,169,110,.10);
        }
        .pst-opponent{ display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .pst-opponent-logo{ width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }
        .pp-result-w{ color: #2ecc71; font-weight: 700; }
        .pp-result-l{ color: #e74c3c; font-weight: 700; }
        .pp-result-t{ color: var(--muted, #888); font-weight: 700; }
      `}</style>
    </div>
  );
}
