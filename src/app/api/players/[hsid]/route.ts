import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { hsid: string } }
) {
  return NextResponse.json({ hsid: params.hsid });
}
