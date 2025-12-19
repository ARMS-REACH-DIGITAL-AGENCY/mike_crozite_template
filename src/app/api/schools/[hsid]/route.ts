import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { hsid: string } }
) {
  const hsid = context.params.hsid;

  return NextResponse.json({
    stamp: "ST-5004-TEST-1",
    hsid,
  });
}