import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail, createGHLContact } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";
import { query } from "@/lib/db";

export const runtime = "nodejs";

interface RegisterRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subdomain?: string;
}

async function getSchoolByHsid(hsid: string) {
  const sql = `
    SELECT hsname, hslocation
    FROM school_success
    WHERE hsid::text = $1
    LIMIT 1
  `;
  const result = await query(sql, [String(hsid)]);
  return result.rows?.[0] ?? null;
}

function getCookieDomain(hostname: string | null) {
  if (!hostname) return undefined;

  const host = hostname.split(":")[0].toLowerCase();

  if (host === "yatstats.com" || host.endsWith(".yatstats.com")) {
    return ".yatstats.com";
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  const body: RegisterRequestBody = await request.json().catch(
    () => ({} as RegisterRequestBody)
  );

  if (!body.uid || !body.email) {
    return NextResponse.json(
      { error: "uid and email are required" },
      { status: 400 }
    );
  }

  try {
    let profile = await getUserProfile(body.uid);

    if (!profile) {
      let armsContactId: string | null = null;

      try {
        armsContactId = await lookupGHLContactByEmail(body.email);
      } catch (err) {
        console.error("GHL lookup failed (non-fatal):", err);
      }

      if (!armsContactId) {
        try {
          const created = await createGHLContact(
            {
              email: body.email,
              firstName: body.firstName ?? "",
              lastName: body.lastName ?? "",
            },
            body.subdomain ?? ""
          );
          armsContactId = created?.contactId ?? null;
        } catch (err) {
          console.error("GHL create failed (non-fatal):", err);
        }
      }

      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        home_hsid: body.subdomain ?? null,
        plan: "fan",
        arms_contact_id: armsContactId,
        arms_location_id: process.env.GHL_LOCATION_ID ?? null,
      });
    }

    if (!profile.home_hsid && body.subdomain) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        home_hsid: body.subdomain,
      });
    }

    let homeSchoolName: string | null = null;
    let homeSchoolLocation: string | null = null;

    if (profile.home_hsid) {
      try {
        const school = await getSchoolByHsid(String(profile.home_hsid));
        if (school) {
          homeSchoolName = school.hsname ?? null;
          homeSchoolLocation = school.hslocation ?? null;
        }
      } catch (schoolErr) {
        console.error("School lookup failed (non-fatal):", schoolErr);
      }
    }

    const payload = {
      success: true,
      contactId: profile.arms_contact_id ?? null,
      plan: profile.plan ?? "fan",
      isSuperfan: profile.plan === "superfan",
      firstName: profile.first_name ?? body.firstName ?? null,
      homeHsid: profile.home_hsid
        ? String(profile.home_hsid)
        : (body.subdomain ?? null),
      homeSchoolName,
      homeSchoolLocation,
      role: profile.role ?? "fan",
      subscriptionStatus: profile.subscription_status ?? null,
    };

    const sessionData = {
      uid: body.uid,
      email: body.email,
      ...payload,
    };

    const response = NextResponse.json(payload);

    const cookieDomain = getCookieDomain(request.headers.get("host"));

    response.cookies.set({
      name: "yat-session",
      value: JSON.stringify(sessionData),
      ...(cookieDomain ? { domain: cookieDomain } : {}),
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error: any) {
    console.error("Register API error:", error);

    return NextResponse.json(
      {
        error: "Registration failed",
        message: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
