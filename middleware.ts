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

function redirectNonLiveSchoolSearchResult(request: NextRequest, hsid: string) {
  const schoolState = request.nextUrl.searchParams.get("schoolState");
  if (schoolState !== "potential" && schoolState !== "inactive") return null;

  const target = new URL("/school-not-live", `https://${ROOT_DOMAIN}`);
  target.searchParams.set("reason", schoolState);
  target.searchParams.set("hsid", hsid);

  // Preserve any richer lead-capture context if future search links include it.
  ["school", "city", "state", "active", "mlb", "natRank", "stateRank", "allTime", "draftedRatio"].forEach((key) => {
    const value = request.nextUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  });

  return NextResponse.redirect(target);
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

  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";

  // Global search currently links non-live school results to /{hsid}?schoolState=...
  // On a school subdomain, that can resolve through the current microsite shell before
  // the page-level redirect gets a useful school context. Catch it here first.
  if (/^\d+$/.test(firstSegment)) {
    const nonLiveRedirect = redirectNonLiveSchoolSearchResult(request, firstSegment);
    if (nonLiveRedirect) return nonLiveRedirect;
  }

  // Ignore apex + www
  if (!subdomain || subdomain === "www") return NextResponse.next();

  // Prevent double-prefixing if someone manually visits /{subdomain}/...
  const hasNumericPrefix = /^\d+$/.test(firstSegment);
  const alreadyPrefixed =
    path === `/${subdomain}` ||
    path.startsWith(`/${subdomain}/`) ||
    hasNumericPrefix;
  if (alreadyPrefixed) return NextResponse.next();

  // Don't rewrite requests for static assets — these must be served directly.
  // This prevents /img/player-silhouette.png from being rewritten to
  // /hamilton/img/player-silhouette.png (which doesn't exist) on custom domains.
  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

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