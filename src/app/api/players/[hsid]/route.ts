import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await params;
  return NextResponse.json({ hsid });
}
