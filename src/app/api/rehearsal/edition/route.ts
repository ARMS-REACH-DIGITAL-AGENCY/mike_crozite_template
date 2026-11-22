// TEST-ONLY, read-only access to the exact archived review copy. No renderer,
// scoring, publication or email delivery is performed by opening this page.
import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { readRehearsalClock } from '@/lib/bracket/rehearsalClock';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!process.env.REHEARSAL_NEON_BRANCH) return new NextResponse('Not found', { status: 404 });
  try {
    const clock = await readRehearsalClock('2027');
    if (!clock) return new NextResponse('Not found', { status: 404 });
    const cadence = req.nextUrl.searchParams.get('cadence') || 'daily';
    const date = req.nextUrl.searchParams.get('date') || clock.reportDate;
    if (!['daily', 'weekly'].includes(cadence) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > clock.reportDate) return new NextResponse('Invalid edition', { status: 400 });
    const { rows } = await query<{ html: string; plain_text: string; content_hash: string }>(
      'SELECT html,plain_text,content_hash FROM bracket_rehearsal_editions WHERE season_key=$1 AND cadence=$2 AND period_start=$3', ['2027', cadence, date]);
    if (rows.length !== 1) return new NextResponse('Review copy unavailable', { status: 404 });
    const plain = req.nextUrl.searchParams.get('format') === 'text';
    return new NextResponse(plain ? rows[0].plain_text : rows[0].html, { headers: {
      'Content-Type': plain ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Hash': rows[0].content_hash,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex, nofollow',
    } });
  } catch (error) {
    console.error('[rehearsal/edition]', error);
    return new NextResponse('Review copy unavailable', { status: 503 });
  }
}
