// src/app/api/players/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ hsid: string }> },
): Promise<Response> {
  const { hsid } = await context.params;


  const { hsid } = params;

  try {
    const { rows } = await pool.query(
      'SELECT * FROM tbc_players_raw WHERE hsid = $1 ORDER BY lastname, firstname',
      [hsid],
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
