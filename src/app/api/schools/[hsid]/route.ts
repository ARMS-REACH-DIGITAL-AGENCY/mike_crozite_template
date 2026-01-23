// src/app/api/schools/[hsid]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getSchoolByHsid } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  if (!hsid) {
    return NextResponse.json({ error: "Missing hsid" }, { status: 400 });
  }

  try {
    const school = await getSchoolByHsid(hsid);
    if (!school) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(school, { status: 200 });
  } catch (err) {
    console.error("Error fetching school:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
