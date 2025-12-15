import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await params;

  try {
    const players = await query(
      `SELECT playerid, firstname, lastname, position, gradyear, letter_years, status, level, team, org
       FROM tbc_players_raw
       WHERE hsid = $1
       ORDER BY lastname ASC, firstname ASC`,
      [hsid]
    );

    return NextResponse.json(players);
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
