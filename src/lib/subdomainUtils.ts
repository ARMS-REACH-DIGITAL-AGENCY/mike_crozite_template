// src/lib/subdomainUtils.ts
// Utilities for parsing the YAT?STATS subdomain naming protocol:
//   {slug}.{state}.{rootDomain}  →  e.g. hamilton.az.yatstats.com

/**
 * Parse the {slug} and {state} from a host that follows the naming protocol
 * {slug}.{state}.{rootDomain}  (e.g. hamilton.az.yatstats.com).
 *
 * Returns null when:
 *  • the host doesn't end with .{rootDomain}
 *  • there are fewer than two subdomain parts
 *  • the slug is a numeric school ID (those are already handled as direct hsid paths)
 */
export function parseSubdomainSlugState(
  host: string,
  rootDomain = "yatstats.com"
): { slug: string; state: string } | null {
  const root = (rootDomain || "yatstats.com").toLowerCase();
  const h = host.toLowerCase();
  if (!h.endsWith(`.${root}`)) return null;
  const subPart = h.slice(0, -(root.length + 1)); // e.g. 'hamilton.az'
  const parts = subPart.split(".");
  // Expect at least two parts: [slug, state]
  if (parts.length < 2) return null;
  const slug = parts[0];
  const state = parts[parts.length - 1];
  // Ignore numeric subdomains — those are already handled as direct hsid paths
  if (/^\d+$/.test(slug)) return null;
  return { slug, state };
}
