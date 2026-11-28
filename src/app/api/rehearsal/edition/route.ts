// TEST-ONLY, read-only access to the exact archived review copy. No renderer,
// scoring, publication or email delivery is performed by opening this page.
import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { readRehearsalClock } from '@/lib/bracket/rehearsalClock';
import { readRehearsalEdition } from '@/lib/newsletter/rehearsalEditionArchive';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!process.env.REHEARSAL_NEON_BRANCH) return new NextResponse('Not found', { status: 404 });
  try {
    const clock = await readRehearsalClock('2027');
    if (!clock) return new NextResponse('Not found', { status: 404 });
    const cadence = req.nextUrl.searchParams.get('cadence') || 'daily';
    const date = req.nextUrl.searchParams.get('date') || clock.reportDate;
    const version = req.nextUrl.searchParams.get('version') || undefined;
    if (!['daily', 'weekly'].includes(cadence) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > clock.reportDate || (version && !/^[a-f0-9]{64}$/.test(version))) return new NextResponse('Invalid edition', { status: 400 });
    const edition = await readRehearsalEdition({ query }, { season: '2027', cadence, date, version });
    if (!edition) return new NextResponse('Review copy unavailable', { status: 404 });
    const plain = req.nextUrl.searchParams.get('format') === 'text';
    return new NextResponse(plain ? edition.plain_text : edition.html, { headers: {
      'Content-Type': plain ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Hash': edition.content_hash,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src data:; base-uri 'none'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex, nofollow',
    } });
  } catch (error) {
    console.error('[rehearsal/edition]', error);
    return new NextResponse('Review copy unavailable', { status: 503 });
  }
}
