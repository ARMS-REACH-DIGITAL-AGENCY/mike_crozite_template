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
// - Every column is clickable to sort, with a ▼/▲ arrow on whichever column
//   is currently sorted (DATE ▼ to start). The first click on a column
//   sorts it high to low; clicking it again flips it. Rows stay intact
//   (the whole row object moves together, never individual cells). Same
//   rules as the season table on the Stats tab (ProfileStatsInjector), and
//   the same look: same stat columns, header, row height and colours.
// - On mount, scrolls to today's date (or the nearest upcoming game if
//   today is an off day) so a fan lands on "now," not buried in the
//   season - future games are still there, just a scroll up away, rather
//   than dumped above today's game by default.
// - One season at a time, with a season picker when there's more than one
//   (e.g. this season's games plus next season's schedule).
// - A player who changed teams gets a marker row where each team's games
//   begin ("Joined Winston-Salem Dash"); shown only in date order, since it
//   marks a point in time. A game his team played without him says
//   "Did not play".

import { useEffect, useMemo, useRef, useState } from "react";

export type ScheduleTableRow = {
  kind: "game" | "move"; // "move" = the marker where a new team's games begin
  iso: string; // "2026-09-17"
  season: number;
  dateLabel: string; // "Sep 17, 2026"
  opponent: string;
  logoUrl: string | null;
  resultLetter: "W" | "L" | "T" | null;
  resultClass: string;
  stats: string[]; // aligned to statHeaders, "-" for not-yet-played games
  didNotPlay?: boolean; // his team played, he didn't
  note?: string; // the marker's text
};

type SortKey = "date" | "opponent" | "result" | number; // number = stats[] index

interface Props {
  rows: ScheduleTableRow[];
  statHeaders: string[];
  todayIso: string;
  defaultSeason: number;
}

function compareRows(a: ScheduleTableRow, b: ScheduleTableRow, sortKey: SortKey, sortDir: 1 | -1): number {
  if (sortKey === "date") {
    if (a.iso !== b.iso) return a.iso < b.iso ? -sortDir : sortDir;
    // A marker sits just before its first day's games, in either direction.
    if (a.kind !== b.kind) return (a.kind === "move" ? -1 : 1) * sortDir;
    return 0;
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

export default function PlayerScheduleTable({ rows, statHeaders, todayIso, defaultSeason }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const seasons = useMemo(() => [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a), [rows]);
  const [season, setSeason] = useState<number>(defaultSeason);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);

  // This season's rows, still in the server's ascending date order.
  const seasonRows = useMemo(() => rows.filter((r) => r.season === season), [rows, season]);

  const sortedRows = useMemo(() => {
    const dir = sortDir;
    // Markers only make sense in date order.
    const shown = sortKey === "date" ? seasonRows : seasonRows.filter((r) => r.kind === "game");
    // Ties (e.g. every 0-HR game when sorting by HR) go newest game first.
    return [...shown].sort((a, b) => compareRows(a, b, sortKey, dir) || (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  }, [seasonRows, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      // A new column always starts high to low.
      setSortKey(key);
      setSortDir(-1);
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="pst-sort-arrow">{sortDir === 1 ? "▲" : "▼"}</span>;
  }

  function header(key: SortKey, label: string, className?: string) {
    return (
      <th key={String(key)} className={className} aria-sort={key === sortKey ? (sortDir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => onSort(key)}>
          {label}
          {sortIndicator(key)}
        </button>
      </th>
    );
  }

  // Scroll to today's date on first load and on a season change - the
  // target is computed from the season's rows in the server's ascending
  // order (today's game, or the next one; the season's last game when it's
  // over), not the current sort state.
  useEffect(() => {
    const container = containerRef.current;
    const games = seasonRows.filter((r) => r.kind === "game");
    if (!container || games.length === 0) return;

    const target = games.find((r) => r.iso >= todayIso) || games[games.length - 1];
    const el = container.querySelector<HTMLElement>(`tr[data-kind="game"][data-iso="${target.iso}"]`);
    if (!el) return;

    const headerHeight = theadRef.current?.getBoundingClientRect().height || 0;
    const containerTop = container.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    container.scrollTop += elTop - containerTop - headerHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  const columnCount = 3 + statHeaders.length;

  return (
    <>
    {seasons.length > 1 && (
      <div className="pst-seasons" role="group" aria-label="Season">
        {seasons.map((y) => (
          <button
            key={y}
            type="button"
            className={y === season ? "pst-season is-active" : "pst-season"}
            aria-pressed={y === season}
            onClick={() => setSeason(y)}
          >
            {y}
          </button>
        ))}
      </div>
    )}
    <div className="pst-wrap" ref={containerRef}>
      <table className="pst-table">
        <thead ref={theadRef}>
          <tr>
            {header("date", "DATE", "pst-date")}
            {header("opponent", "OPPONENT", "pst-opp")}
            {header("result", "W/L", "pst-res")}
            {statHeaders.map((label, i) => header(i, label))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) =>
            row.kind === "move" ? (
              <tr key={`move-${row.iso}-${i}`} data-kind="move" data-iso={row.iso} className="pst-row-move">
                <td colSpan={columnCount}>
                  <span className="pst-move">
                    <span className="pst-move-date">{row.dateLabel}</span>
                    {row.note}
                  </span>
                </td>
              </tr>
            ) : (
              <tr
                key={`${row.iso}-${i}`}
                data-kind="game"
                data-iso={row.iso}
                className={row.iso === todayIso ? "pst-row-today" : undefined}
              >
                <td className="pst-date">{row.dateLabel}</td>
                <td className="pst-opp">
                  <span className="pst-opponent">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {row.logoUrl && <img src={row.logoUrl} alt="" className="pst-opponent-logo" />}
                    <span className="pst-opponent-name">{row.opponent || "--"}</span>
                  </span>
                </td>
                <td className="pst-res">{row.resultLetter && <span className={row.resultClass}>{row.resultLetter}</span>}</td>
                {row.didNotPlay ? (
                  <td className="pst-dnp" colSpan={statHeaders.length}>
                    Did not play
                  </td>
                ) : (
                  row.stats.map((v, si) => <td key={si}>{v}</td>)
                )}
              </tr>
            )
          )}
        </tbody>
      </table>

      {/* Same look as the Stats tab's season table (ProfileStatsInjector):
          its colour variables (--psi-*, set on #playerFunZone for light and
          dark), header, cell padding, font and row height. */}
      <style>{`
        .pst-wrap{
          max-height: 70vh;
          overflow: auto;
          border: 1px solid var(--psi-border, rgba(255,255,255,.18));
          background: var(--psi-panel-bg, #080808);
          box-shadow: 0 14px 32px rgba(0,0,0,.22);
        }
        .pst-table{
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font: 500 9.5px/1.05 Oswald, Arial, sans-serif;
          color: var(--psi-text, #f4f0e6);
        }
        .pst-table thead th{
          position: sticky;
          top: 0;
          z-index: 8;
          padding: 0;
          border-right: 1px solid var(--psi-border, rgba(255,255,255,.18));
          border-bottom: 1px solid var(--psi-border, rgba(255,255,255,.18));
          background: linear-gradient(180deg, var(--psi-head-bg-a, #202020), var(--psi-head-bg-b, #101010));
          color: var(--psi-text, #f4f0e6);
          white-space: nowrap;
        }
        .pst-table thead th button{
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 2px;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 4px 3px;
          font: 900 9px/1 Oswald, Arial, sans-serif;
          letter-spacing: .04em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .pst-table thead th.pst-date button,
        .pst-table thead th.pst-opp button{ justify-content: flex-start; }
        .pst-table thead th.pst-res button{ justify-content: center; }
        .pst-sort-arrow{ font-size: 7px; line-height: 1; }
        .pst-table td{
          padding: 3px 3px;
          border-right: 1px solid rgba(128,128,128,.14);
          border-bottom: 1px solid rgba(128,128,128,.16);
          background: var(--psi-cell-bg, rgba(255,255,255,.035));
          color: var(--psi-muted-text, rgba(255,255,255,.84));
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .pst-table tbody tr:nth-child(even) td{ background: var(--psi-cell-bg-alt, rgba(255,255,255,.065)); }
        .pst-table tbody tr:hover td{ background: var(--psi-cell-hover, rgba(255,255,255,.12)); color: var(--psi-text, #f4f0e6); }
        .pst-table td.pst-date, .pst-table td.pst-opp{ text-align: left; color: var(--psi-text, #f4f0e6); }
        .pst-table td.pst-res{ text-align: center; }
        /* DATE stays put while the stat columns scroll sideways (like YEAR). */
        .pst-table th.pst-date, .pst-table td.pst-date{ position: sticky; left: 0; z-index: 6; box-shadow: 4px 0 10px rgba(0,0,0,.18); }
        .pst-table th.pst-date{ z-index: 10; }
        .pst-table td.pst-date{ background: linear-gradient(var(--psi-cell-bg, rgba(255,255,255,.035)), var(--psi-cell-bg, rgba(255,255,255,.035))), var(--psi-panel-bg, #080808); }
        .pst-table tbody tr:nth-child(even) td.pst-date{ background: linear-gradient(var(--psi-cell-bg-alt, rgba(255,255,255,.065)), var(--psi-cell-bg-alt, rgba(255,255,255,.065))), var(--psi-panel-bg, #080808); }
        .pst-row-today td{ background: rgba(214,178,83,.22) !important; }
        .pst-opponent{ display: flex; align-items: center; gap: 4px; white-space: nowrap; }
        .pst-table td.pst-dnp{ text-align: left; font-style: italic; color: var(--psi-muted-text, rgba(255,255,255,.84)); opacity: .7; }
        .pst-table tr.pst-row-move td{
          padding: 4px 3px;
          text-align: left;
          background: rgba(214,178,83,.14);
          border-bottom: 1px solid rgba(214,178,83,.45);
          color: var(--psi-text, #f4f0e6);
        }
        .pst-move{ position: sticky; left: 3px; display: inline-flex; align-items: center; gap: 6px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
        .pst-move-date{ font-weight: 500; opacity: .75; }
        .pst-seasons{ display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
        .pst-season{
          border: 1px solid var(--psi-border, rgba(255,255,255,.18));
          background: var(--psi-cell-bg, rgba(255,255,255,.035));
          color: var(--psi-muted-text, rgba(255,255,255,.84));
          padding: 3px 8px;
          font: 700 10px/1 Oswald, Arial, sans-serif;
          letter-spacing: .04em;
          cursor: pointer;
        }
        .pst-season.is-active{
          background: linear-gradient(180deg, var(--psi-head-bg-a, #202020), var(--psi-head-bg-b, #101010));
          color: var(--psi-text, #f4f0e6);
          border-color: rgba(214,178,83,.7);
        }
        .pst-opponent-logo{ width: 11px; height: 11px; object-fit: contain; flex-shrink: 0; }
        .pp-result-w{ color: #2ecc71; font-weight: 700; }
        .pp-result-l{ color: #e74c3c; font-weight: 700; }
        .pp-result-t{ color: var(--muted, #888); font-weight: 700; }
        @media (max-width: 860px){
          .pst-table{ font-size: 9px; }
          .pst-table thead th button, .pst-table td{ padding: 3px 2px; }
          .pst-opponent-logo{ width: 10px; height: 10px; }
        }
      `}</style>
    </div>
    </>
  );
}
