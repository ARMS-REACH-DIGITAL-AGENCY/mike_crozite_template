import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  try {
    const { hsid } = params;

    if (!hsid) {
      return NextResponse.json(
        { error: 'HSID is required' },
        { status: 400 }
      );
    }

    const players = await query(
      `SELECT playerid, firstname, lastname, position, gradyear 
       FROM public.tbc_players_raw 
       WHERE hsid = $1 
       ORDER BY lastname, firstname`,
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
