import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { publishSchoolBanners } from '@/lib/newsletter/newsletterImagesServer';

// Every fan's home school gets its Gazette banner drawn and stored ahead of time
// (Pete, Nov 25 2026), in the asset bucket at newsletter/gazette/banner/<hsid>.png.
// Daily by cron, so a new fan's school is ready by the next morning; only missing
// banners are drawn. ?redraw=1 draws them all again (a school changed its logo).
//
//   GET /api/cron/newsletter-banners   Authorization: Bearer $CRON_SECRET

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const connection = process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection) return NextResponse.json({ ok: false, error: 'database_unavailable' }, { status: 500 });
  const pool = new Pool({ connectionString: connection, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    const { rows } = await pool.query<{ home_hsid: number }>('SELECT DISTINCT home_hsid FROM public.newsletter_recipients WHERE home_hsid IS NOT NULL');
    const run = await publishSchoolBanners({ hsids: rows.map(r => Number(r.home_hsid)), base: request.nextUrl.origin, redraw: request.nextUrl.searchParams.get('redraw') === '1' });
    console.log('[newsletter-banners]', JSON.stringify({ schools: rows.length, drawn: run.drawn.length, already: run.already, failed: run.failed, skipped: run.skipped }));
    return NextResponse.json({ ok: run.failed.length === 0, schools: rows.length, ...run }, { status: run.failed.length ? 503 : 200 });
  } catch (error) {
    console.error('[newsletter-banners]', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    await pool.end();
  }
}
