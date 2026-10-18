import { NextRequest, NextResponse } from "next/server";
// Rewrites flip-card levels: the writer connection, not the site's read-only pool.
import { writerQuery as query } from "@/lib/dbWriter";
import { findOrCreateGhlContact, sendGHLEmail } from "@/lib/gohighlevel";
import { LEVEL_LEFTOVERS_SQL, OFFICIAL_LEVELS, levelFixSql } from "@/lib/officialLevels";

// Weekly level spot check (Pete, Oct 18, 2026: only the official levels are
// used). Every Monday it rewrites known aliases and wrong capitalisation to
// the official level (AAA -> TRIPLE-A, LOW-A -> SINGLE-A, Intl ->
// INTERNATIONAL ...), then emails Pete what it fixed and what's left that a
// person has to decide: JUCO (NJCAA, CCCAA or NWAC by college), generic
// NCAA on an active player, or a value nobody has seen before.
//   GET /api/cron/level-qc            fix + report
//   GET /api/cron/level-qc?dry=1      report only, change nothing

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_EMAIL = "pete@yatstats.com";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Leftover = { column_name: string; value: string; players: number; active: number };

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    const fixed = { level_label: 0, display_level_label: 0 };
    if (!dry) {
      for (const column of ["level_label", "display_level_label"] as const) {
        const { rows } = await query<{ fixed: number }>(levelFixSql(column));
        fixed[column] = rows[0]?.fixed ?? 0;
      }
    }
    const { rows: leftovers } = await query<Leftover>(LEVEL_LEFTOVERS_SQL, [OFFICIAL_LEVELS as unknown as string[]]);
    const activeLeft = leftovers.reduce((n, r) => n + r.active, 0);
    const result = { ok: true, dry, fixed, activeLeft, leftovers };

    // Email only when something changed or an active player still needs a
    // decision; a clean week stays quiet.
    if (fixed.level_label + fixed.display_level_label > 0 || activeLeft > 0) {
      const contactId = await findOrCreateGhlContact(REPORT_EMAIL, "Pete", "DeLuca", undefined, "YAT?STATS Operations");
      if (contactId) {
        const rows = leftovers.map((r) =>
          `<tr><td>${esc(r.column_name)}</td><td><b>${esc(r.value)}</b></td><td align="right">${r.active}</td><td align="right">${r.players}</td></tr>`).join("");
        const html = `<p><b>Weekly level check${dry ? " (dry run)" : ""}</b></p>
          <p>Fixed automatically: ${fixed.level_label} level labels, ${fixed.display_level_label} card labels.</p>
          <p>Still not an official level (${activeLeft} active players):</p>
          <table cellpadding="4" border="1" style="border-collapse:collapse"><tr><th>Field</th><th>Value</th><th>Active</th><th>All</th></tr>${rows}</table>
          <p>JUCO needs NJCAA, CCCAA or NWAC by the player's college. NCAA without a division needs the division.</p>`;
        await sendGHLEmail(contactId, `YAT?STATS weekly level check: ${activeLeft} active to review`, html);
      }
    }
    console.log("[level-qc]", JSON.stringify({ ...result, leftovers: leftovers.length }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[level-qc] failed", error);
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
