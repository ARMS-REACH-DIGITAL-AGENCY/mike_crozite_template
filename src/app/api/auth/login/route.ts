import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail, getGHLLocationId } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";
import { isSuperfan } from "@/lib/entitlements";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const PLATFORM_SESSION_COOKIE = "yat-platform-session";
const LEGACY_SESSION_COOKIE = "yat-session";

interface LoginRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  currentHsid?: string;
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

  if (host === "yatstats.com" || host.endsWith(".yatstats.com")) {
    return ".yatstats.com";
  }

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

  // Clear a possible host-only legacy cookie on the current microsite.
  response.cookies.set(base);

  // Clear the previous shared-domain cookie too.
  if (cookieDomain) {
    response.cookies.set({ ...base, domain: cookieDomain });
  }
}

export async function POST(request: NextRequest) {
  const body: LoginRequestBody = await request.json().catch(() => ({} as LoginRequestBody));

  if (!body.uid || !body.email) {
    return NextResponse.json(
      { error: "uid and email are required" },
      { status: 400 }
    );
  }

  let payload: {
    success: boolean;
    dbError?: boolean;
    contactId: string | null;
    plan: string;
    isSuperfan: boolean;
    firstName: string | null;
    homeHsid: string | null;
    homeSchoolName: string | null;
    homeSchoolLocation: string | null;
    homeMicrositeUrl: string | null;
    role: string | null;
    subscriptionStatus: string | null;
  };

  try {
    let profile = await getUserProfile(body.uid);

    if (!profile) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        home_hsid: body.currentHsid ?? null,
        plan: "fan",
      });
    }

    if (!profile.home_hsid && body.currentHsid) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        home_hsid: body.currentHsid,
      });
    }

    if (!profile.arms_contact_id) {
      try {
        const armsContactId = await lookupGHLContactByEmail(body.email);
        if (armsContactId) {
          profile = await upsertUserProfile(body.uid, {
            email: body.email,
            arms_contact_id: armsContactId,
            arms_location_id: getGHLLocationId() ?? null,
          });
        }
      } catch (ghlErr) {
        console.error("GHL backfill failed (non-fatal):", ghlErr);
      }
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

    payload = {
      success: true,
      contactId: profile.arms_contact_id ?? null,
      plan: superfan ? "superfan" : profile.plan ?? "fan",
      isSuperfan: superfan,
      firstName: profile.first_name ?? null,
      homeHsid: profile.home_hsid ? String(profile.home_hsid) : null,
      homeSchoolName,
      homeSchoolLocation,
      homeMicrositeUrl,
      role: profile.role ?? null,
      subscriptionStatus: profile.subscription_status ?? null,
    };
  } catch (error) {
    console.error("Error in login API (returning partial response):", error);

    payload = {
      success: false,
      dbError: true,
      contactId: null,
      plan: "fan",
      isSuperfan: false,
      firstName: body.firstName ?? null,
      homeHsid: body.currentHsid ?? null,
      homeSchoolName: null,
      homeSchoolLocation: null,
      homeMicrositeUrl: body.currentHsid ? `https://yatstats.com/${body.currentHsid}` : null,
      role: null,
      subscriptionStatus: null,
    };
  }

  const sessionData = {
    uid: body.uid,
    email: body.email,
    ...payload,
  };

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
}
