// src/lib/canonicalUrl.ts
// Returns the canonical base URL for a school page.
//
// Priority:
//   1. school.microsite_url  — must follow naming protocol {slug}.{state}.yatstats.com
//                              e.g. "https://hamilton.az.yatstats.com"
//                              Old single-level subdomains (e.g. "hamilton.yatstats.com")
//                              are rejected and fall through to the numeric fallback.
//   2. Fallback              — "https://yatstats.com/{resolvedHsid}"

const DEFAULT_ROOT_DOMAIN = "yatstats.com";
const ROOT_DOMAIN = (
  typeof process !== "undefined"
    ? process.env.ROOT_DOMAIN || DEFAULT_ROOT_DOMAIN
    : DEFAULT_ROOT_DOMAIN
).toLowerCase();

/**
 * Returns true when the URL is a yatstats.com (or ROOT_DOMAIN) subdomain URL
 * that does NOT follow the required {slug}.{state}.rootDomain naming protocol
 * (i.e. it has only one subdomain level, like "hamilton.yatstats.com").
 * Such URLs are legacy/invalid and should fall back to the numeric HSID URL.
 */
function isOldFormatSubdomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return false;
    // Strip the root domain to get the subdomain part
    const subPart = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
    // Naming protocol requires at least two parts: {slug}.{state}
    return subPart.split(".").length < 2;
  } catch {
    return false;
  }
}

export function getCanonicalBaseUrl(
  school: Record<string, unknown> | null | undefined,
  resolvedHsid: string
): string {
  const microsite = school?.microsite_url as string | undefined;
  if (microsite && /^https?:\/\/.+/.test(microsite) && !isOldFormatSubdomain(microsite)) {
    // Strip trailing slash for consistent URL construction
    return microsite.replace(/\/$/, "");
  }
  return `https://yatstats.com/${resolvedHsid}`;
}
