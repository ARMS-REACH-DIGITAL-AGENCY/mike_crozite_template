import { NextRequest, NextResponse } from "next/server";
import { writerQuery } from "@/lib/dbWriter";
import {
  SAFE_2025_RETIREMENT_BACKFILL_SQL,
  SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL,
} from "@/lib/officialLevels";

// Strictly bounded catch-up after fresh TBC imports. Separate from the TBC
// transaction to avoid holding locks while processing thousands of audit rows.
// A 2026 stat presence blocks RETIRED but does NOT promote a professional ACTIVE.
// Existing verified statuses and current teams are never overwritten.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  try {
    let retired = 0;
    let verifiedLevelsFixed = 0;
    if (!dry) {
      const levels = await writerQuery<{ corrected: number }>(SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL);
      verifiedLevelsFixed = Number(levels.rows[0]?.corrected ?? 0);
      const status = await writerQuery<{ retired: number }>(SAFE_2025_RETIREMENT_BACKFILL_SQL);
      retired = Number(status.rows[0]?.retired ?? 0);
    }

    const remaining = await writerQuery<{ blank: number; retired_ncaas: number }>(`
      SELECT COUNT(*) FILTER (WHERE status_label IS NULL)::int AS blank,
        COUNT(*) FILTER (WHERE status_label='RETIRED'
          AND level_label='NCAA' AND highest_level_label IN
          ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'))::int AS retired_ncaas
      FROM public.flip_card_front_stage
    `);
    const result = {
      ok: true, dry, retired, verifiedLevelsFixed,
      missingStatuses: remaining.rows[0]?.blank ?? 0,
      retiredNCAAPlaceholders: remaining.rows[0]?.retired_ncaas ?? 0,
      batchLimit: 5000,
    };
    console.log("[flip-card-status-reconciliation]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[flip-card-status-reconciliation]", error);
    return NextResponse.json({ ok: false, error: String((error as Error)?.message ?? error) }, { status: 500 });
  }
}
