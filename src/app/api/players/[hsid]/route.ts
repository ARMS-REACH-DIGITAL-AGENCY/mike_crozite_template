// src/app/api/players/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../../lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hsid: string }> }
) {
  const resolvedParams = await params;
  const { hsid } = resolvedParams;

  try {
    // 1) Lookup school in authoritative table (school_success).
    const schoolRes = await pool.query(
      'SELECT * FROM public.school_success WHERE hsid = $1 LIMIT 1',
      [hsid]
    );
    const school = schoolRes.rows[0];

    // If no school found — redirect to the YAT?STATS homepage (not a 404).
    if (!school) {
      return NextResponse.redirect('https://yatstats.com');
    }

    // 2) Fetch roster from the authoritative roster table (hs_rosters_simple).
    //    Keep this denormalized table as the primary source for microsite cards.
    const rosterRes = await pool.query(
      `SELECT *
       FROM public.hs_rosters_simple
       WHERE hsid = $1
       ORDER BY COALESCE(last, lastname, display_name, '') ASC, COALESCE(first, firstname, '') ASC`,
      [hsid]
    );
    const players = rosterRes.rows;

    // 3) Return school + players so the frontend can render flip-cards quickly.
    return NextResponse.json({ school, players });
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
