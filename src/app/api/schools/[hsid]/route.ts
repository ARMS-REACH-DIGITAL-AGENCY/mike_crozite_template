// src/app/api/schools/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a Postgres connection pool using DATABASE_URL
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
    // Query the tbc_schools_raw table for the matching HSID
    const { rows } = await pool.query(
      'SELECT * FROM tbc_schools_raw WHERE hsid = $1',
      [hsid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `School with HSID ${hsid} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('Error fetching school:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
