import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { sanitizeError, sendIngestAlert } from "@/lib/ingestAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "tbc_safe_ingest";
const MAX_AGE_MS = 13 * 60 * 60 * 1000;

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
        error: "No successful TBC ingest was recorded in the last 13 hours",
      });
    }

    // Capture success is NOT player publication success. The independent
    // full-universe pipeline must finish raw promotion, identity reconciliation
    // and flip-card publication (or explicitly hold an identity).
    const publicationJob = "tbc_players_canonical_publication";
    const { rows: publicationRows } = await pool.query<{
      last_success_at: Date | null;
      last_failure_at: Date | null;
      consecutive_failures: number;
      last_error: string | null;
      last_result: unknown;
    }>(
      `SELECT last_success_at,last_failure_at,consecutive_failures,last_error,last_result
         FROM public.ingest_job_health WHERE job_name=$1`,
      [publicationJob],
    );
    const published = publicationRows[0];
    const lastPublicationAt = published?.last_success_at
      ? new Date(published.last_success_at).toISOString() : null;
    // Twelve-hour scheduling with one full day to tolerate a missed slot.
    const publicationStale = !lastPublicationAt ||
      Date.now() - new Date(lastPublicationAt).getTime() > 26 * 60 * 60 * 1000;
    const publicationFailed = Number(published?.consecutive_failures ?? 0) > 0;
    if (publicationStale || publicationFailed) {
      await sendIngestAlert({
        event: "yatstats_ingest_stale",
        job: publicationJob,
        occurredAt: new Date().toISOString(),
        lastSuccessAt: lastPublicationAt,
        error: publicationFailed
          ? "TBC Players downloaded but canonical publication failed: " + (published?.last_error || "incomplete")
          : "No verified end-to-end TBC player publication in the last 26 hours",
      });
    }
    return NextResponse.json({
      ok: !(stale || publicationStale || publicationFailed),
      stale,
      lastSuccessAt,
      publication: {
        stale: publicationStale,
        failed: publicationFailed,
        lastSuccessAt: lastPublicationAt,
        lastResult: published?.last_result ?? null,
      },
    }, { status: stale || publicationStale || publicationFailed ? 503 : 200 });
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
