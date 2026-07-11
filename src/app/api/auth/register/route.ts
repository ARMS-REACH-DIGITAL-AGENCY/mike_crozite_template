import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail, createGHLContact, getGHLLocationId } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";
import { isSuperfan } from "@/lib/entitlements";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const PLATFORM_SESSION_COOKIE = "yat-platform-session";
const LEGACY_SESSION_COOKIE = "yat-session";

interface RegisterRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subdomain?: string;
}

async function getSchoolByHsid(hsid: string) {
  const sql = `
    SELECT hsname, hslocation, microsite_url
    FROM school_success
    WHERE hsid::text = $1
    LIMIT 1
  `;
  const result = await query(sql, [String(hsid)]);
  return result.rows?.[0] ?? null;
}

function normalizeMicrositeUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
}

function getCookieDomain(hostname: string | null) {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0].toLowerCase();
  if (host === "yatstats.com" || host.endsWith(".yatstats.com")) return ".yatstats.com";
  return undefined;
}

function clearLegacySessionCookies(response: NextResponse, cookieDomain?: string) {
  const base = {
    name: LEGACY_SESSION_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    expires: new Date(0),
  };
  response.cookies.set(base);
  if (cookieDomain) response.cookies.set({ ...base, domain: cookieDomain });
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
            body.subdomain ?? "yatstats"
          );

          if (!("error" in created)) {
            const createdContact = (created as { contact?: { id?: string } }).contact;
            armsContactId = createdContact?.id ?? null;
          } else {
            console.error("GHL create failed (non-fatal):", created);
          }
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
        arms_location_id: getGHLLocationId() ?? null,
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
    let homeMicrositeUrl: string | null = null;

    if (profile.home_hsid) {
      try {
        const school = await getSchoolByHsid(String(profile.home_hsid));
        if (school) {
          homeSchoolName = school.hsname ?? null;
          homeSchoolLocation = school.hslocation ?? null;
          homeMicrositeUrl = normalizeMicrositeUrl(school.microsite_url);
        }
      } catch (schoolErr) {
        console.error("School lookup failed (non-fatal):", schoolErr);
      }
    }

    const superfan = isSuperfan(profile);
    const payload = {
      success: true,
      contactId: profile.arms_contact_id ?? null,
      plan: superfan ? "superfan" : profile.plan ?? "fan",
      isSuperfan: superfan,
      firstName: profile.first_name ?? body.firstName ?? null,
      homeHsid: profile.home_hsid ? String(profile.home_hsid) : (body.subdomain ?? null),
      homeSchoolName,
      homeSchoolLocation,
      homeMicrositeUrl,
      role: profile.role ?? "fan",
      subscriptionStatus: profile.subscription_status ?? null,
    };

    const sessionData = { uid: body.uid, email: body.email, ...payload };
    const response = NextResponse.json(payload);
    const cookieDomain = getCookieDomain(request.headers.get("host"));

    response.cookies.set({
      name: PLATFORM_SESSION_COOKIE,
      value: JSON.stringify(sessionData),
      ...(cookieDomain ? { domain: cookieDomain } : {}),
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    clearLegacySessionCookies(response, cookieDomain);
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
