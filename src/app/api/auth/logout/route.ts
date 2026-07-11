import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PLATFORM_SESSION_COOKIE = "yat-platform-session";
const LEGACY_SESSION_COOKIE = "yat-session";

function getCookieDomain(hostname: string | null) {
  if (!hostname) return undefined;

  const host = hostname.split(":")[0].toLowerCase();

  if (host === "yatstats.com" || host.endsWith(".yatstats.com")) {
    return ".yatstats.com";
  }

  return undefined;
}

function expireCookie(response: NextResponse, name: string, domain?: string) {
  response.cookies.set({
    name,
    value: "",
    ...(domain ? { domain } : {}),
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires: new Date(0),
  });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  const cookieDomain = getCookieDomain(request.headers.get("host"));

  // Clear both host-only and shared-domain variants so no school microsite
  // can retain a stale identity after the user signs out.
  expireCookie(response, PLATFORM_SESSION_COOKIE);
  expireCookie(response, LEGACY_SESSION_COOKIE);

  if (cookieDomain) {
    expireCookie(response, PLATFORM_SESSION_COOKIE, cookieDomain);
    expireCookie(response, LEGACY_SESSION_COOKIE, cookieDomain);
  }

  return response;
}
