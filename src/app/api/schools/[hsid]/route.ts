// src/app/api/schools/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

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
    const { rows } = await pool.query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1',
      [hsid]
    );
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('Error fetching school:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}