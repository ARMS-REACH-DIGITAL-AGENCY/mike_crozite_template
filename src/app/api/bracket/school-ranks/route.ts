import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const { rows } = await query<{
      hsid: string | number;
      yatstats_national_rank: string | number | null;
    }>(`
      SELECT hsid, yatstats_national_rank
      FROM school_success
      WHERE yatstats_national_rank IS NOT NULL
    `);

    const ranks = Object.fromEntries(
      rows.map((row) => [String(row.hsid), Number(row.yatstats_national_rank)])
        .filter(([, rank]) => Number.isFinite(rank))
    );

    return NextResponse.json(
      { ranks },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('school rank lookup failed', error);
    return NextResponse.json({ ranks: {} }, { status: 500 });
  }
}
