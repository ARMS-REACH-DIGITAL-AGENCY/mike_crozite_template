// /src/app/api/schools/[hsid]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  const { hsid } = params;

  return NextResponse.json({
    stamp: 'ST-5004-TEST-1',
    hsid,  // Echoes back the dynamic hsid value for testing
  });
}
