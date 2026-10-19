import { NextRequest, NextResponse } from "next/server";
// Rewrites levels: the writer connection, not the site's read-only pool.
import { writerQuery as query } from "@/lib/dbWriter";
import { findOrCreateGhlContact, sendGHLEmail } from "@/lib/gohighlevel";
import {
  ACTIVE_CARD_LEFTOVERS_SQL,
  LEVEL_FIX_TARGETS,
  LEVEL_SCAN_SQL,
  OFFICIAL_LEVELS,
  TEAM_LEVEL_MISMATCH_SQL,
  levelFixSql,
} from "@/lib/officialLevels";

// Weekly level spot check (Pete, Oct 18-19, 2026: only the official levels
// are used, anywhere in the database). Every Monday it:
//   1. rewrites known aliases and wrong capitalisation to the official level
//      (AAA -> TRIPLE-A, LOW-A -> SINGLE-A, Rk -> ROOKIE ...) in every level
//      column the site reads (LEVEL_FIX_TARGETS);
//   2. scans every level column of every table for values that still aren't
//      official, so a new one is caught the week it shows up;
//   3. lists active players whose card isn't official (JUCO, generic NCAA)
//      or disagrees with the team cross-check (teamid_universe_mapping);
// then emails Pete what it fixed and what a person has to decide.
//   GET /api/cron/level-qc            fix + report
//   GET /api/cron/level-qc?dry=1      report only, change nothing

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REPORT_EMAIL = "pete@yatstats.com";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type ScanRow = { table_name: string; column_name: string; value: string; rows: number };
type CardRow = { playerid: string; display_name: string; current_team_name: string | null; card_level: string; team_level?: string };

const table = (head: string[], rows: string[][]) =>
  `<table cellpadding="4" border="1" style="border-collapse:collapse"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows
    .map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`)
    .join("")}</table>`;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const official = OFFICIAL_LEVELS as unknown as string[];

  try {
    const fixed: Record<string, number> = {};
    if (!dry) {
      for (const target of LEVEL_FIX_TARGETS) {
        try {
          const { rows } = await query<{ fixed: number }>(levelFixSql(target));
          const n = rows[0]?.fixed ?? 0;
          if (n) fixed[`${target.table}.${target.column}`] = n;
        } catch (error) {
          // A table or column that was renamed or dropped: say so, keep going.
          console.error("[level-qc] fix failed", target, error);
          fixed[`${target.table}.${target.column} (failed)`] = 0;
        }
      }
    }
    const fixedTotal = Object.values(fixed).reduce((n, v) => n + v, 0);
    const { rows: scan } = await query<ScanRow>(LEVEL_SCAN_SQL, [official]);
    const { rows: cards } = await query<CardRow>(ACTIVE_CARD_LEFTOVERS_SQL, [official]);
    const { rows: mismatches } = await query<CardRow>(TEAM_LEVEL_MISMATCH_SQL, [official]);
    const result = { ok: true, dry, fixed, fixedTotal, scan, activeCards: cards.length, mismatches: mismatches.length };

    // Email only when something changed or an active player needs a
    // decision; a clean week stays quiet.
    if (fixedTotal > 0 || cards.length > 0 || mismatches.length > 0) {
      const contactId = await findOrCreateGhlContact(REPORT_EMAIL, "Pete", "DeLuca", undefined, "YAT?STATS Operations");
      if (contactId) {
        const fixedRows = Object.entries(fixed).map(([k, n]) => [esc(k), String(n)]);
        const html = `<p><b>Weekly level check${dry ? " (dry run)" : ""}</b></p>
          <p><b>Fixed automatically (${fixedTotal}):</b></p>
          ${fixedRows.length ? table(["Table.column", "Rows"], fixedRows) : "<p>Nothing this week.</p>"}
          <p><b>Active players whose card isn't an official level (${cards.length}):</b></p>
          ${cards.length ? table(["Player", "Team", "Card says"], cards.slice(0, 200).map((r) => [esc(r.display_name), esc(r.current_team_name), `<b>${esc(r.card_level)}</b>`])) : "<p>None.</p>"}
          <p><b>Active players whose card disagrees with teamid_universe_mapping (${mismatches.length}):</b></p>
          ${mismatches.length ? table(["Player", "Team", "Card says", "Team table says"], mismatches.slice(0, 200).map((r) => [esc(r.display_name), esc(r.current_team_name), esc(r.card_level), `<b>${esc(r.team_level)}</b>`])) : "<p>None.</p>"}
          <p><b>Every value in the database that still isn't official:</b></p>
          ${table(["Table", "Column", "Value", "Rows"], scan.map((r) => [esc(r.table_name), esc(r.column_name), `<b>${esc(r.value)}</b>`, String(r.rows)]))}
          <p>JUCO needs NJCAA, CCCAA or NWAC by the player's college. NCAA without a division needs the division. PRO needs MLB, the affiliate level, INDY or INTERNATIONAL.</p>`;
        await sendGHLEmail(contactId, `YAT?STATS weekly level check: ${cards.length + mismatches.length} active to review`, html);
      }
    }
    console.log("[level-qc]", JSON.stringify({ ...result, scan: scan.length }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[level-qc] failed", error);
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
