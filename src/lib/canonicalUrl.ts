// src/lib/canonicalUrl.ts
// Returns the canonical base URL for a school page.
//
// Priority:
//   1. school.microsite_url  — e.g. "https://hamilton.yatstats.com"
//   2. Fallback              — "https://yatstats.com/{resolvedHsid}"

export function getCanonicalBaseUrl(
  school: Record<string, unknown> | null | undefined,
  resolvedHsid: string
): string {
  const microsite = school?.microsite_url as string | undefined;
  if (microsite && /^https?:\/\/.+/.test(microsite)) {
    // Strip trailing slash for consistent URL construction
    return microsite.replace(/\/$/, "");
  }
  return `https://yatstats.com/${resolvedHsid}`;
}
