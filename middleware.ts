import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();

function getHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || "").toLowerCase();
  return host.split(",")[0].trim().split(":")[0];
}

function redirectNonLiveSchoolSearchResult(request: NextRequest, hsid: string) {
  const schoolState = request.nextUrl.searchParams.get("schoolState");
  if (schoolState !== "potential" && schoolState !== "inactive") return null;

  const target = new URL("/school-not-live", `https://${ROOT_DOMAIN}`);
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

  const isOnRootDomain = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
  if (!isOnRootDomain) return NextResponse.next();

  const subdomain = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";

  if (/^\d+$/.test(firstSegment)) {
    const nonLiveRedirect = redirectNonLiveSchoolSearchResult(request, firstSegment);
    if (nonLiveRedirect) return nonLiveRedirect;
  }

  if (!subdomain || subdomain === "www") return NextResponse.next();

  const hasNumericPrefix = /^\d+$/.test(firstSegment);
  const alreadyPrefixed = path === `/${subdomain}` || path.startsWith(`/${subdomain}/`) || hasNumericPrefix;
  if (alreadyPrefixed) return NextResponse.next();

  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

  url.pathname = `/${subdomain}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};