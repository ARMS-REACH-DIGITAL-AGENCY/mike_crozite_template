import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  return NextResponse.json({ hsid });
}



