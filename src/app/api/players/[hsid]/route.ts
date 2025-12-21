// /src/app/api/players/[hsid]/route.ts
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
    // Get school to get hs_lookup_key
    const schoolQuery = await pool.query(
      'SELECT hs_lookup_key FROM public.tbc_schools_raw WHERE hsid = $1',
      [hsid]
    );
    const hs_lookup_key = schoolQuery.rows[0]?.hs_lookup_key;

    if (!hs_lookup_key) {
      return NextResponse.json({ error: 'No school found' }, { status: 404 });
    }

    // Get players
    const playersQuery = await pool.query(
      'SELECT * FROM public.tbc_players_raw WHERE high_school = $1',
      [hs_lookup_key]
    );
    const players = playersQuery.rows;

    // Get stats for each player
    const playerData = await Promise.all(players.map(async (player) => {
      const battingQuery = await pool.query(
        'SELECT * FROM public.tbc_batting_raw WHERE playerid = $1',
        [player.playerid]
      );
      const pitchingQuery = await pool.query(
        'SELECT * FROM public.tbc_pitching_raw WHERE playerid = $1',
        [player.playerid]
      );
      return {
        ...player,
        batting: battingQuery.rows,
        pitching: pitchingQuery.rows,
      };
    }));

    return NextResponse.json(playerData);
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
