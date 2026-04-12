import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("yat-session")?.value;

    if (!raw) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    let session: any = null;

    try {
      session = JSON.parse(raw);
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json(
      {
        authenticated: true,
        session,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        authenticated: false,
        error: error?.message ?? "Session lookup failed",
      },
      { status: 200 }
    );
  }
}
