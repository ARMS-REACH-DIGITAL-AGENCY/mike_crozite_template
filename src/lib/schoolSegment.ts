// The first path segment under /[hsid] is a school ID, or a microsite
// subdomain name that the page resolves from the host. Bots also request
// files like /robots.txt, /sitemap.xml and /ads.txt, and broken links send
// /null - none of those can be a school, but each one used to render the
// whole school page (host fallback) and hold DB connections that real
// visitors then timed out waiting for. Answer them 404 before any query.
export function isNeverASchoolSegment(segment: string): boolean {
  let value = String(segment || '');
  try {
    value = decodeURIComponent(value);
  } catch {
    // Malformed %-escape: still can't be a school, judge the raw text.
  }
  value = value.trim().toLowerCase();
  return !value || value.includes('.') || value === 'null' || value === 'undefined';
}
