// src/app/api/players/[hsid]/route.ts (updated to remove stats)
import { NextResponse } from 'next/server';
import { getRosterByHsid } from '@/lib/db'; // Only import what's needed

export async function GET(request: Request, { params }: { params: { hsid: string } }) {
  const hsid = params.hsid;

  try {
    const roster = await getRosterByHsid(hsid);
    return NextResponse.json(roster);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}