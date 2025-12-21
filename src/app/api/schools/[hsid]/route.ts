// /src/app/api/schools/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hsid: string }> }
) {
  const resolvedParams = await params;
  const { hsid } = resolvedParams;

  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1',
      [hsid]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching school:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
