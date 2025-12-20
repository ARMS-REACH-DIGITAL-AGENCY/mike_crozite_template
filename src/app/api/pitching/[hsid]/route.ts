import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs'; // pg requires node runtime

type Params = { hsid: string };
type RouteCtx = { params: Params | Promise<Params> };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  // Works whether ctx.params is an object OR a Promise (Next 15/16 typing differences)
  const { hsid } = await Promise.resolve(ctx.params);

  if (!hsid) {
    return NextResponse.json({ error: 'Missing hsid' }, { status: 400 });
  }

  try {
    const query = `
      SELECT p.*
      FROM tbc_pitching_raw p
      JOIN tbc_players_raw pl ON p.playerid = pl.playerid
      WHERE pl.hsid = $1
    `;

    const { rows } = await pool.query(query, [hsid]);
    return NextResponse.json(rows, { status: 200 });
  } catch (err) {
    console.error('Error fetching pitching stats by hsid:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

