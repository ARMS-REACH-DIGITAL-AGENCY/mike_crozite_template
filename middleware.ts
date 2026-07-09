import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();
const FALLBACK_ROOT_DOMAIN = "yatstats.com";

function getHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || "").toLowerCase();
  return host.split(",")[0].trim().split(":")[0];
}

function getRootDomainForHost(host: string) {
  const candidates = Array.from(new Set([ROOT_DOMAIN, FALLBACK_ROOT_DOMAIN].filter(Boolean)));
  return candidates
    .sort((a, b) => b.length - a.length)
    .find((root) => host === root || host.endsWith(`.${root}`)) || "";
}

function getRoutePrefixForSubdomain(subdomain: string) {
  // Generic routing only. Do not hardcode school-name -> HSID mappings here.
  // Named school domains are resolved from school_success.microsite_url/staging_url in the page layer.
  return subdomain.split(".")[0] || "";
}

function redirectNonLiveSchoolSearchResult(request: NextRequest, hsid: string) {
  const schoolState = request.nextUrl.searchParams.get("schoolState");
  if (schoolState !== "potential" && schoolState !== "inactive") return null;

  const target = new URL("/school-not-live", `https://${FALLBACK_ROOT_DOMAIN}`);
  target.searchParams.set("reason", schoolState);
  target.searchParams.set("hsid", hsid);

  ["school", "city", "state", "active", "mlb", "natRank", "stateRank", "allTime", "draftedRatio"].forEach((key) => {
    const value = request.nextUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  });

  return NextResponse.redirect(target);
}

export function middleware(request: NextRequest) {
  const host = getHost(request);
  const url = request.nextUrl.clone();

  const rootDomain = getRootDomainForHost(host);
  if (!rootDomain) return NextResponse.next();

  const subdomain = host === rootDomain ? "" : host.slice(0, -(rootDomain.length + 1));
  const routePrefix = getRoutePrefixForSubdomain(subdomain);
  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";

  if (/^\d+$/.test(firstSegment)) {
    const nonLiveRedirect = redirectNonLiveSchoolSearchResult(request, firstSegment);
    if (nonLiveRedirect) return nonLiveRedirect;
  }

  if (!routePrefix || routePrefix === "www") return NextResponse.next();

  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

  const hasNumericPrefix = /^\d+$/.test(firstSegment);
  const alreadyPrefixed = path === `/${routePrefix}` || path.startsWith(`/${routePrefix}/`) || hasNumericPrefix;
  if (alreadyPrefixed) return NextResponse.next();

  url.pathname = `/${routePrefix}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};
