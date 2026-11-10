import { NextRequest, NextResponse } from "next/server";
import { schoolHostnamePattern } from "./src/lib/schoolDirectoryRouting";

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || "yatstats.com").toLowerCase();
const FALLBACK_ROOT_DOMAIN = "yatstats.com";

function getHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || request.nextUrl.hostname).toLowerCase();
  return host.split(",")[0].trim().split(":")[0];
}

function getRootDomainForHost(host: string) {
  const candidates = Array.from(new Set([ROOT_DOMAIN, FALLBACK_ROOT_DOMAIN].filter(Boolean)));
  return candidates.sort((a, b) => b.length - a.length)
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

// One routing rule for EVERY school subdomain:
// resolve its full hostname against the school directory, then use its HSID.
// This replaces the unreliable first-label routing and all school-specific
// mappings. URL spelling is owned by schoolDirectoryRouting/school_success.
export async function middleware(request: NextRequest) {
  const host = getHost(request);
  const rootDomain = getRootDomainForHost(host);
  if (!rootDomain || host === rootDomain || host === `www.${rootDomain}`) return NextResponse.next();

  const url = request.nextUrl.clone();
  const path = url.pathname;
  const firstSegment = path.split("/").filter(Boolean)[0] || "";
  const staticAssetExt = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|otf|css|js|json|txt|xml|webmanifest)$/i;
  if (staticAssetExt.test(path)) return NextResponse.next();

  // Keep explicit numeric routes intact: they may represent a cross-school
  // navigation and their page already performs its own canonical redirect.
  if (/^[1-9][0-9]*$/.test(firstSegment)) {
    return redirectNonLiveSchoolSearchResult(request, firstSegment) || NextResponse.next();
  }

  const school = schoolHostnamePattern(host);
  // Never infer an HSID from only the first hostname label.
  if (!school) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set("x-pathname", path);
  if (request.nextUrl.searchParams.get("join") === "1") headers.set("x-yat-open-join", "1");
  if (/^\d{4}$/.test(request.nextUrl.searchParams.get("team") || "")) {
    headers.set("x-yat-team", request.nextUrl.searchParams.get("team")!);
  }

  let hsid: string;
  if (school.type === "numeric") {
    hsid = school.hsid;
  } else {
    // Node API resolves both school.state and school.city.state names. A
    // shared cached lookup avoids a database query on each page view.
    // The /api/ prefix is excluded from middleware to prevent recursion.
    try {
      const resolver = new URL("/api/school-host-resolve", request.url);
      const response = await fetch(resolver, {
        headers: { "x-yat-school-host": host },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Host resolver HTTP ${response.status}`);
      const result = await response.json() as { hsid?: string | null; canonicalUrl?: string | null };
      hsid = String(result.hsid || "");
      if (!/^[1-9][0-9]*$/.test(hsid)) return NextResponse.next();
      // A uniquely resolvable old alias redirects to its real school URL.
      if (result.canonicalUrl) {
        try {
          const canonical = new URL(result.canonicalUrl);
          if (canonical.hostname.endsWith(".yatstats.com") && canonical.hostname !== host) {
            canonical.pathname = path;
            canonical.search = url.search;
            canonical.hash = url.hash;
            return NextResponse.redirect(canonical, 308);
          }
        } catch { /* Stale directory values must not misroute a school. */ }
      }
    } catch (error) {
      console.error("School hostname lookup failed", { host, error });
      return new NextResponse("School directory is temporarily unavailable.", { status: 503 });
    }
  }
  headers.set("x-yat-internal-school-rewrite", "1");
  headers.set("x-yat-resolved-host-hsid", hsid);
  url.pathname = path === "/" ? `/${hsid}` : `/${hsid}${path}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Preserve shared APIs/assets, including Favorites cross-school /embed.
  matcher: ["/((?!api|g/|embed|_next|favicon.ico|robots.txt|sitemap.xml|sitemaps/|manifest.webmanifest).*)"],
};
