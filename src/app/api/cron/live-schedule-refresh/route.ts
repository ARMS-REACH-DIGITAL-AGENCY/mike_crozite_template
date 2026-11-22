import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { runLiveScheduleRefresh } from "@/lib/mlb/liveScheduleRefresh";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Every ten minutes: the shared production job refreshes the schedule,
// next-game card fields and stale statuses. The HTTP route never accepts a
// caller-provided clock or provider; isolated replay uses the shared job.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runLiveScheduleRefresh(pool);
    console.log("[live-schedule-refresh]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[live-schedule-refresh] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
