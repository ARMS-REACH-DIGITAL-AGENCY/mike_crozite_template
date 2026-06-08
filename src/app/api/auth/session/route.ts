import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserProfile } from "@/lib/userProfile";
import { isSuperfan } from "@/lib/entitlements";

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

    let reconciledSession = session;

    if (session?.uid) {
      try {
        const profile = await getUserProfile(session.uid);
        if (profile) {
          const superfan = isSuperfan(profile);
          reconciledSession = {
            ...session,
            contactId: profile.arms_contact_id ?? session.contactId ?? null,
            homeHsid: profile.home_hsid ?? session.homeHsid ?? null,
            homeSchoolName: profile.home_school_name ?? session.homeSchoolName ?? null,
            role: profile.role ?? session.role ?? 'fan',
            plan: superfan ? 'superfan' : profile.plan ?? session.plan ?? 'fan',
            subscriptionStatus: profile.subscription_status ?? session.subscriptionStatus ?? null,
            isSuperfan: superfan,
          };
        }
      } catch (profileError) {
        console.error('Session profile reconciliation failed:', profileError);
      }
    }

    return NextResponse.json(
      {
        authenticated: true,
        session: reconciledSession,
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
