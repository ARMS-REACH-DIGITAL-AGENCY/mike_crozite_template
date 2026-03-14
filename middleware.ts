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

  // Extract subdomain parts (everything before .ROOT_DOMAIN)
  // Naming protocol: {slug}.{state}.yatstats.com  (e.g. hamilton.az.yatstats.com)
  // Numeric schools:  {hsid}.yatstats.com           (e.g. 5004.yatstats.com)
  const subdomainPart =
    host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1)); // remove ".ROOT_DOMAIN"
  // The [hsid] route param is always the first segment (slug or numeric id).
  // For hamilton.az.yatstats.com → subdomainPart='hamilton.az', routePrefix='hamilton'.
  // The full host header flows to the page so getSchoolByUrl / getSchoolBySubdomainParts
  // can resolve hamilton.az → numeric hsid without relying on the slug param alone.
  const routePrefix = subdomainPart.split(".")[0] || "";

  // Ignore apex + www
  if (!routePrefix || routePrefix === "www") return NextResponse.next();

  // Prevent double-prefixing.
  // A request is already prefixed if:
  //   • the path starts with /{routePrefix}/  (e.g. /hamilton/player/… on hamilton.az.yatstats.com)
  //   • the first path segment is a numeric school ID (e.g. /5004/… — internal nav links use resolvedHsid)
  //   • the full subdomainPart is the first segment (e.g. /hamilton.az/… — defensive guard for
  //     non-standard paths that already include the state qualifier as part of the segment)
  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";
  const hasNumericPrefix = /^\d+$/.test(firstSegment);
  const alreadyPrefixed =
    path === `/${routePrefix}` ||
    path.startsWith(`/${routePrefix}/`) ||
    path === `/${subdomainPart}` ||
    path.startsWith(`/${subdomainPart}/`) ||
    hasNumericPrefix;
  if (alreadyPrefixed) return NextResponse.next();

  // Don't rewrite requests for static assets — these must be served directly.
  // This prevents /img/player-silhouette.png from being rewritten to
  // /hamilton/img/player-silhouette.png (which doesn't exist) on custom domains.
  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

  // Rewrite: {slug}.{state}.yatstats.com/anything -> /{slug}/anything
  // The page resolves the full hostname (hamilton.az.yatstats.com) to the integer
  // school ID via getSchoolByUrl / getSchoolBySubdomainParts. The [hsid] param
  // receives the slug temporarily but is never passed directly to integer DB columns.
  url.pathname = `/${routePrefix}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Don't run middleware on Next internals, API, or common static/metadata files
    "/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
