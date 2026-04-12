import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get("yat-session")?.value;

    if (!cookie) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const session = JSON.parse(cookie);

    return NextResponse.json(
      {
        authenticated: true,
        session,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error reading yat-session cookie:", error);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
