import { NextRequest, NextResponse } from 'next/server';
import { ensureFanContacts } from '@/lib/fanContacts';

// Every registered Fan and SuperFan has a working HighLevel contact before the
// newsletters go out (Pete, Nov 25 2026): daily at 3:30 a.m. Arizona, ahead of the
// 3:40 banners and the 4:00 newsletters. See src/lib/fanContacts.ts.
//
//   GET /api/cron/fan-contacts   Authorization: Bearer $CRON_SECRET

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const run = await ensureFanContacts();
    console.log('[fan-contacts]', JSON.stringify({ fans: run.fans, upToDate: run.upToDate, relinked: run.relinked, created: run.created, failed: run.failed.length, stoppedEarly: run.stoppedEarly }));
    return NextResponse.json({ ok: run.failed.length === 0 && !run.stoppedEarly, ...run }, { status: run.failed.length ? 503 : 200 });
  } catch (error) {
    console.error('[fan-contacts]', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
