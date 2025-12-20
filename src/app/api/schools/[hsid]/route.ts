import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ hsid: string }> },
): Promise<Response> {
  const { hsid } = await context.params;

  const hsid = context.params.hsid;

  return NextResponse.json({
    stamp: "ST-5004-TEST-1",
    hsid,
  });
}
