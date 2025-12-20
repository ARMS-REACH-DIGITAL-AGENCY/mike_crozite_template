import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Connection pool to the PostgreSQL database.  The DATABASE_URL
// environment variable should already be configured for your Neon
// project.  SSL is enabled to allow secure connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * GET handler for pitching statistics by high‑school ID (hsid).
 *
 * The tbc_pitching_raw table does not include an hsid column, so we
 * join against tbc_players_raw on the player identifier.  This join
 * allows us to return all pitching rows for players whose high‑school
 * ID matches the requested hsid.
 *
 * NOTE: Replace `playerid` with the actual column names used to join
 * your pitching and players tables.  For example, if pitching uses
 * `pid` and players uses `player_id`, update the ON clause
 * accordingly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  const { hsid } = params;
  try {
    const query = `
      SELECT s.*
      FROM tbc_pitching_raw s
      JOIN tbc_players_raw p ON s.playerid = p.playerid
      WHERE p.hsid = $1
    `;
    const { rows } = await pool.query(query, [hsid]);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching pitching stats by hsid:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
