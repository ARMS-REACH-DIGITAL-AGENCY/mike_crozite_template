import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { sanitizeError, sendIngestAlert } from "@/lib/ingestAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "tbc_safe_ingest";
const MAX_AGE_MS = 26 * 60 * 60 * 1000;

const pool = new Pool({
  connectionString: process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL,
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
    const { rows } = await pool.query(
      `select last_success_at from public.ingest_job_health where job_name = $1`,
      [JOB_NAME],
    );
    const lastSuccessAt = rows[0]?.last_success_at
      ? new Date(rows[0].last_success_at).toISOString()
      : null;
    const stale = !lastSuccessAt || Date.now() - new Date(lastSuccessAt).getTime() > MAX_AGE_MS;

    if (stale) {
      await sendIngestAlert({
        event: "yatstats_ingest_stale",
        job: JOB_NAME,
        occurredAt: new Date().toISOString(),
        lastSuccessAt,
        error: "No successful TBC ingest was recorded in the last 26 hours",
      });
    }

    return NextResponse.json({ ok: true, stale, lastSuccessAt });
  } catch (error) {
    const message = sanitizeError(error);
    console.error("[tbc-ingest-watchdog] check failed", { message });
    try {
      await sendIngestAlert({
        event: "yatstats_ingest_stale",
        job: JOB_NAME,
        occurredAt: new Date().toISOString(),
        error: `Watchdog could not read ingest health: ${message}`,
      });
    } catch (alertError) {
      console.error("[tbc-ingest-watchdog] failed to send alert", {
        message: sanitizeError(alertError),
      });
    }
    return NextResponse.json({ ok: false, error: "watchdog check failed" }, { status: 500 });
  }
}
