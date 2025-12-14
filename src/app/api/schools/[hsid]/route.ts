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

    const schools = await query(
      'SELECT * FROM public.tbc_schools_raw WHERE hsid = $1 LIMIT 1',
      [hsid]
    );

    if (schools.length === 0) {
      return NextResponse.json(
        { error: 'School not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(schools[0]);
  } catch (error) {
    console.error('Error fetching school:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
