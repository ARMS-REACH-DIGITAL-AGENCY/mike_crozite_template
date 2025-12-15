import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  const { hsid } = params;

  try {
    const { rows } = await pool.query(
      'SELECT * FROM tbc_batting_raw WHERE hsid = $1',
      [hsid],
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching batting stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
