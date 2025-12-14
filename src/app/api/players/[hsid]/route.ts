import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: { hsid: string } }
) {
  const { hsid } = context.params;

  return NextResponse.json({ hsid });
}
