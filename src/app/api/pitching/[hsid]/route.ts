import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from 'next';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * GET handler for pitching statistics by high-school ID (hsid).
 *
 * NOTE: Update join keys/columns if your schema differs.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/pitching/[hsid]'>,
) {
  const { hsid } = await ctx.params;

  try {
    const query = `
      SELECT p.*
      FROM tbc_pitching_raw p
      JOIN tbc_players_raw pl ON p.playerid = pl.playerid
      WHERE pl.hsid = $1
    `;

    const { rows } = await pool.query(query, [hsid]);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching pitching stats by hsid:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
