// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();

function getHost(request: NextRequest) {
  // Vercel/proxies commonly set x-forwarded-host
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || "").toLowerCase();

  // Strip port if present (localhost:3000, etc.)
  return host.split(",")[0].trim().split(":")[0];
}

export function middleware(request: NextRequest) {
  const host = getHost(request);
  const url = request.nextUrl.clone();

  // Only apply subdomain logic on the root domain and its subdomains
  const isOnRootDomain = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
  if (!isOnRootDomain) return NextResponse.next();

  // Extract subdomain (everything before .ROOT_DOMAIN)
  // Examples:
  // 5004.yatstats.com -> "5004"
  // www.yatstats.com -> "www"
  // yatstats.com -> ""
  const subdomainPart =
    host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1)); // remove ".ROOT_DOMAIN"
  const subdomain = subdomainPart.split(".")[0] || "";

  // Ignore apex + www
  if (!subdomain || subdomain === "www") return NextResponse.next();

  // Prevent double-prefixing if someone manually visits /{subdomain}/...
  const path = url.pathname;
  const alreadyPrefixed = path === `/${subdomain}` || path.startsWith(`/${subdomain}/`);
  if (alreadyPrefixed) return NextResponse.next();

  // Rewrite: SUBDOMAIN.yatstats.com/anything -> /SUBDOMAIN/anything
  url.pathname = `/${subdomain}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Don't run middleware on Next internals, API, or common static/metadata files
    "/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
