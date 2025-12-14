import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { hsid: string } }
) {
  return NextResponse.json({ hsid: params.hsid });
}
