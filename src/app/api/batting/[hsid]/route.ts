import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Connection pool to the PostgreSQL database. DATABASE_URL must be set in Vercel env vars.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  const { hsid } = params;

  if (!hsid) {
    return NextResponse.json({ error: 'Missing hsid' }, { status: 400 });
  }

  try {
    const query = `
      SELECT b.*
      FROM public.tbc_batting_raw b
      JOIN public.tbc_players_raw p ON b.playerid = p.playerid
      WHERE p.hsid = $1
    `;
    const { rows } = await pool.query(query, [hsid]);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching batting stats by hsid:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}