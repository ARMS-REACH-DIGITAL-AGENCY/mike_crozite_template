// src/app/api/batting/[hsid]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(
  _request: NextRequest,
  context: { params: { hsid: string } }
) {
  const { hsid } = context.params;

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
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('Error fetching batting stats by hsid:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}