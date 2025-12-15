import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await params;

  try {
    const rows = await query(
      'SELECT * FROM tbc_schools_raw WHERE hsid = $1',
      [hsid]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `School with HSID ${hsid} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('Error fetching school:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
