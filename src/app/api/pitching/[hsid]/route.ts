import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  if (!hsid) return NextResponse.json({ error: 'Missing hsid' }, { status: 400 });

  const query = `
    SELECT p.*
    FROM public.tbc_pitching_raw p
    JOIN public.tbc_players_raw pl ON p.playerid = pl.playerid
    WHERE pl.hsid = $1
  `;

  try {
    const { rows } = await pool.query(query, [hsid]);
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('Error fetching pitching stats by hsid:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}