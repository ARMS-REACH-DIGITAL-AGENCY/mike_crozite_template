import { NextRequest, NextResponse } from "next/server";
// Rewrites levels: the writer connection, not the site's read-only pool.
import { writerQuery as query } from "@/lib/dbWriter";
import { findOrCreateGhlContact, sendGHLEmail } from "@/lib/gohighlevel";
import {
  ACTIVE_CARD_LEFTOVERS_SQL,
  CANONICAL_ACTIVE_STAGE_MISMATCH_SQL,
  CANONICAL_STAGE_REPAIR_SQL,
  SAFE_2026_STAGE_TEAM_RECOVERY_SQL,
  STAGE_TEAM_COVERAGE_SQL,
  UNRESOLVED_ACTIVE_TEAM_SQL,
  LEVEL_FIX_TARGETS,
  LEVEL_SCAN_SQL,
  OFFICIAL_LEVELS,
  TEAM_LEVEL_MISMATCH_SQL,
  levelFixSql,
} from "@/lib/officialLevels";

// Daily canonical identity + level quality check.
// teamid_universe_mapping is the only team identity authority. Every day it:
//   1. repairs Flip Card current team / org-conference / level from canonical identity;
//   2. rewrites known level aliases in the remaining live level columns;
//   3. scans for unofficial values and active Flip Card identity drift;
// then emails Pete only when it repaired drift or found something unresolved.
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
type IdentityMismatch = {
  playerid: string;
  display_name: string;
  current_teamid: string | null;
  current_team_name: string | null;
  current_org_or_conference_name: string | null;
  level_label: string | null;
  canonical_team_name: string | null;
  canonical_org_name: string | null;
  canonical_level: string | null;
};

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
    let canonicalFixed = 0;
    let teamIdsRecovered = 0;
    if (!dry) {
      const { rows: recoveryRows } = await query<{ recovered: number }>(SAFE_2026_STAGE_TEAM_RECOVERY_SQL);
      teamIdsRecovered = recoveryRows[0]?.recovered ?? 0;
      if (teamIdsRecovered) fixed["flip_card_front_stage safe 2026 team recovery"] = teamIdsRecovered;
      const { rows: canonicalRows } = await query<{ fixed: number }>(CANONICAL_STAGE_REPAIR_SQL);
      canonicalFixed = canonicalRows[0]?.fixed ?? 0;
      if (canonicalFixed) fixed["flip_card_front_stage canonical identity"] = canonicalFixed;
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
    const { rows: identityMismatches } = await query<IdentityMismatch>(CANONICAL_ACTIVE_STAGE_MISMATCH_SQL);
    const { rows: coverageRows } = await query<{
      stage_rows: number; null_team_ids: number; active_rows: number;
      active_null_team_ids: number; unmapped_team_ids: number;
      active_team_id_without_source: number;
    }>(STAGE_TEAM_COVERAGE_SQL);
    const coverage = coverageRows[0];
    const { rows: unresolvedActiveTeams } = await query<{
      playerid: string; display_name: string; status_label: string;
      current_teamid: string | null; current_team_name: string | null;
      level_label: string | null; current_team_source: string | null;
    }>(UNRESOLVED_ACTIVE_TEAM_SQL);
    const result = {
      ok: true,
      dry,
      fixed,
      fixedTotal,
      canonicalFixed,
      teamIdsRecovered,
      coverage,
      unresolvedActiveTeams,
      scan,
      activeCards: cards.length,
      mismatches: mismatches.length,
      identityMismatches: identityMismatches.length,
    };

    // Email when something changed, an active player needs a decision, or
    // any table still holds an unofficial level; a clean week stays quiet.
    if (fixedTotal > 0 || cards.length > 0 || mismatches.length > 0 || identityMismatches.length > 0 || scan.length > 0 || (coverage?.active_null_team_ids ?? 0) > 0 || (coverage?.unmapped_team_ids ?? 0) > 0) {
      const contactId = await findOrCreateGhlContact(REPORT_EMAIL, "Pete", "DeLuca", undefined, "YAT?STATS Operations");
      if (contactId) {
        const fixedRows = Object.entries(fixed).map(([k, n]) => [esc(k), String(n)]);
        const html = `<p><b>Daily canonical identity + level check${dry ? " (dry run)" : ""}</b></p>
          <p><b>Fixed automatically (${fixedTotal}):</b></p>
          ${fixedRows.length ? table(["Table.column", "Rows"], fixedRows) : "<p>Nothing this week.</p>"}
          <p><b>Active players whose card isn't an official level (${cards.length}):</b></p>
          ${cards.length ? table(["Player", "Team", "Card says"], cards.slice(0, 200).map((r) => [esc(r.display_name), esc(r.current_team_name), `<b>${esc(r.card_level)}</b>`])) : "<p>None.</p>"}
          <p><b>Active players whose card disagrees with teamid_universe_mapping (${mismatches.length}):</b></p>
          ${mismatches.length ? table(["Player", "Team", "Card says", "Team table says"], mismatches.slice(0, 200).map((r) => [esc(r.display_name), esc(r.current_team_name), esc(r.card_level), `<b>${esc(r.team_level)}</b>`])) : "<p>None.</p>"}
          <p><b>Active Flip Cards still disagreeing with canonical Team ID identity (${identityMismatches.length}):</b></p>
          ${identityMismatches.length ? table(["Player", "Team ID", "Card Team", "Canonical Team", "Card Org", "Canonical Org", "Card Level", "Canonical Level"], identityMismatches.slice(0, 200).map((r) => [esc(r.display_name), esc(r.current_teamid), esc(r.current_team_name), esc(r.canonical_team_name), esc(r.current_org_or_conference_name), esc(r.canonical_org_name), esc(r.level_label), esc(r.canonical_level)])) : "<p>None.</p>"}
          <p><b>Full-stage coverage:</b> ${esc(JSON.stringify(coverage))}</p>
          <p><b>Unresolved ACTIVE assignments (first ${unresolvedActiveTeams.length}):</b></p>
          ${unresolvedActiveTeams.length ? table(["Player", "Team ID", "Team", "Level", "Source"], unresolvedActiveTeams.map((r) => [esc(r.display_name), esc(r.current_teamid), esc(r.current_team_name), esc(r.level_label), esc(r.current_team_source)])) : "<p>None.</p>"}
          <p><b>Every value in the database that still isn't official:</b></p>
          ${table(["Table", "Column", "Value", "Rows"], scan.map((r) => [esc(r.table_name), esc(r.column_name), `<b>${esc(r.value)}</b>`, String(r.rows)]))}
          <p>NCAA without a division needs the division. PRO needs MLB, the affiliate level, INDY or INTERNATIONAL.</p>`;
        await sendGHLEmail(contactId, `YAT?STATS daily identity check: ${cards.length + mismatches.length + identityMismatches.length} active to review`, html);
      }
    }
    console.log("[level-qc]", JSON.stringify({ ...result, scan: scan.length }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[level-qc] failed", error);
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
