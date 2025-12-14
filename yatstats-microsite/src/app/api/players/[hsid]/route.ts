import { NextResponse } from "next/server";

type Params = {
  hsid: string;
};

export async function GET(
  request: Request,
  { params }: { params: Params }
) {
  const { hsid } = params;

  return NextResponse.json({ hsid });
}
