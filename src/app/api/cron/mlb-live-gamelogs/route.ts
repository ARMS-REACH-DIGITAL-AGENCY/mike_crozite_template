import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { runMlbLiveGameLogs } from "@/lib/mlb/liveGameLogs";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

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
    const summary = await runMlbLiveGameLogs(pool);
    console.log("[mlb-live-gamelogs]", JSON.stringify(summary));
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mlb-live-gamelogs] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
