import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { writerQuery } from '@/lib/dbWriter';
import { publishTransactionNews, type TransactionNewsReport } from '@/lib/transactionNews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOB_NAME = 'mlb_transaction_news';

// News coverage has its own job, never the email cursor. Old imports and all
// transaction types are caught up without sending historical fan alerts.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'
    || (process.env.VERCEL_ENV === 'preview' && process.env.YATSTATS_ISOLATED_PREVIEW !== '1');
  const report: TransactionNewsReport & { batches: number } = {
    considered: 0, created: 0, hasMore: false, samples: [], batches: 0,
  };
  const deadline = Date.now() + 240_000;

  try {
    // Bounded work and resumable by absence, rather than a watermark that
    // could permanently skip a failed insert. At most 10,000 cards per run.
    do {
      const batch = await publishTransactionNews(writerQuery, { batchSize: 500, dryRun });
      report.batches++;
      report.considered += batch.considered;
      report.created += batch.created;
      report.hasMore = batch.hasMore;
      if (!report.samples.length) report.samples = batch.samples;
      if (dryRun || !batch.hasMore || batch.created === 0) break;
    } while (report.batches < 20 && Date.now() < deadline);

    // A previous attempt may have committed cards before cache invalidation
    // failed. Even a zero-row retry must make those cards visible, without
    // clearing cached stats, game logs, or any other profile data.
    if (!dryRun) revalidateTag('player-profile-news', { expire: 0 });
    if (!dryRun) {
      await writerQuery(`
        INSERT INTO public.ingest_job_health
          (job_name, last_success_at, consecutive_failures, last_error, last_result, updated_at)
        VALUES ($1, NOW(), 0, NULL, $2::jsonb, NOW())
        ON CONFLICT (job_name) DO UPDATE SET
          last_success_at = EXCLUDED.last_success_at, consecutive_failures = 0,
          last_error = NULL, last_result = EXCLUDED.last_result, updated_at = NOW()
      `, [JOB_NAME, JSON.stringify(report)]);
    }
    return NextResponse.json({ ok: true, dryRun, ...report });
  } catch (error) {
    // Earlier batches (or a write whose response was lost) may have committed.
    // Refresh only news; the missing rows remain eligible next run.
    if (!dryRun) revalidateTag('player-profile-news', { expire: 0 });
    const message = error instanceof Error ? error.message : String(error);
    console.error('[mlb-transaction-news] publication failed', error);
    if (!dryRun) {
      await writerQuery(`
        INSERT INTO public.ingest_job_health
          (job_name, last_failure_at, consecutive_failures, last_error, last_result, updated_at)
        VALUES ($1, NOW(), 1, $2, $3::jsonb, NOW())
        ON CONFLICT (job_name) DO UPDATE SET
          last_failure_at = EXCLUDED.last_failure_at,
          consecutive_failures = public.ingest_job_health.consecutive_failures + 1,
          last_error = EXCLUDED.last_error, last_result = EXCLUDED.last_result,
          updated_at = NOW()
      `, [JOB_NAME, message.slice(0, 1000), JSON.stringify(report)]).catch(() => undefined);
    }
    return NextResponse.json({ ok: false, dryRun, error: 'Transaction news publication failed', ...report }, { status: 500 });
  }
}
