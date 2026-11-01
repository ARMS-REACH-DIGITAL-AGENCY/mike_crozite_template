import { NextRequest, NextResponse } from "next/server";
import { writerQuery } from "@/lib/dbWriter";
import {
  SAFE_2025_RETIREMENT_BACKFILL_SQL,
  SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL,
  SAFE_RETIRED_TBC_CAREER_HIGH_BACKFILL_SQL,
  SAFE_RETIRED_POST_TRANSACTION_TEAM_CLEAR_SQL,
  SAFE_AUTO_RETIRED_2026_COLLEGE_REACTIVATION_SQL,
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
    let verifiedCareerHighFixed = 0;
    let staleRetiredTeamsCleared = 0;
    let collegesReactivated = 0;
    if (!dry) {
      const college = await writerQuery<{ reactivated: number }>(SAFE_AUTO_RETIRED_2026_COLLEGE_REACTIVATION_SQL);
      collegesReactivated = Number(college.rows[0]?.reactivated ?? 0);
      const levels = await writerQuery<{ corrected: number }>(SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL);
      verifiedLevelsFixed = Number(levels.rows[0]?.corrected ?? 0);
      const status = await writerQuery<{ retired: number }>(SAFE_2025_RETIREMENT_BACKFILL_SQL);
      retired = Number(status.rows[0]?.retired ?? 0);
      const career = await writerQuery<{ recovered: number }>(SAFE_RETIRED_TBC_CAREER_HIGH_BACKFILL_SQL);
      verifiedCareerHighFixed = Number(career.rows[0]?.recovered ?? 0);
      const oldTeams = await writerQuery<{ cleared: number }>(SAFE_RETIRED_POST_TRANSACTION_TEAM_CLEAR_SQL);
      staleRetiredTeamsCleared = Number(oldTeams.rows[0]?.cleared ?? 0);
    }

    const remaining = await writerQuery<{ blank: number; retired_ncaas: number }>(`
      SELECT COUNT(*) FILTER (WHERE status_label IS NULL)::int AS blank,
        COUNT(*) FILTER (WHERE status_label='RETIRED'
          AND level_label='NCAA' AND highest_level_label IN
          ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'))::int AS retired_ncaas
      FROM public.flip_card_front_stage
    `);
    const result = {
      ok: true, dry, retired, verifiedLevelsFixed, verifiedCareerHighFixed, staleRetiredTeamsCleared, collegesReactivated,
      missingStatuses: remaining.rows[0]?.blank ?? 0,
      retiredNCAAPlaceholders: remaining.rows[0]?.retired_ncaas ?? 0,
      batchLimit: 5000,
      seasonRolloverRequired: new Date().getUTCFullYear() !== 2026,
    };
    console.log("[flip-card-status-reconciliation]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[flip-card-status-reconciliation]", error);
    return NextResponse.json({ ok: false, error: String((error as Error)?.message ?? error) }, { status: 500 });
  }
}
