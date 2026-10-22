import { NextRequest, NextResponse } from 'next/server';
import { POST as sendPilotReports } from '@/app/api/admin/fan-newsletter-pilot/route';
import { getTribuneApproval } from '@/lib/tribune/approval';
import { getTribunePilotAudience, dueTribunePeriod } from '@/lib/tribune/preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 4 AM Arizona. Daily = yesterday; Monday weekly = completed Monday–Sunday. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const pilot = getTribunePilotAudience();
  if (!pilot.configured) return NextResponse.json({ ok: true, status: 'held_for_pilot_configuration', reason: pilot.reason });
  const approval = await getTribuneApproval();
  if (!approval.approved) return NextResponse.json({ ok: true, status: 'held_for_approval', reason: approval.reason });
  const date = dueTribunePeriod('daily')!.end;
  const report = new NextRequest(request.url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
    body: JSON.stringify({ date, emails: pilot.emails, send: true }),
  });
  const response = await sendPilotReports(report);
  const payload = await response.json();
  const expected = ['queued', 'previously_attempted', 'not_due', 'unsubscribed', 'preferences_changed', 'held_for_approval'];
  const failed = Array.isArray(payload.result) ? payload.result.filter((row: { status: string }) => !expected.includes(row.status)) : [];
  console.log('[tribune-pilot]', JSON.stringify({ date, recipients: pilot.emails.length, failures: failed.length, statuses: payload.result?.map((row: { status: string }) => row.status) }));
  return NextResponse.json({ ok: response.ok && failed.length === 0, date, ...payload }, { status: response.ok && failed.length === 0 ? 200 : 500 });
}
