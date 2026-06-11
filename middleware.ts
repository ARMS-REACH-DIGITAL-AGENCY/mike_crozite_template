import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();
const FALLBACK_ROOT_DOMAIN = "yatstats.com";

const SCHOOL_SUBDOMAIN_HSID_OVERRIDES: Record<string, string> = {
  "hamilton": "5004",
  "hamilton.az": "5004",
  "hartselle": "5063",
  "hartselle.al": "5063",
};

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
  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";

  if (/^\d+$/.test(firstSegment)) {
    const nonLiveRedirect = redirectNonLiveSchoolSearchResult(request, firstSegment);
    if (nonLiveRedirect) return nonLiveRedirect;
  }

  if (!subdomain || subdomain === "www") return NextResponse.next();

  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

  const overrideHsid = SCHOOL_SUBDOMAIN_HSID_OVERRIDES[subdomain];
  if (overrideHsid && !/^\d+$/.test(firstSegment)) {
    url.pathname = `/${overrideHsid}${path}`;
    return NextResponse.rewrite(url);
  }

  const hasNumericPrefix = /^\d+$/.test(firstSegment);
  const alreadyPrefixed = path === `/${subdomain}` || path.startsWith(`/${subdomain}/`) || hasNumericPrefix;
  if (alreadyPrefixed) return NextResponse.next();

  url.pathname = `/${subdomain}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};