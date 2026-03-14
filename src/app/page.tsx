// src/app/page.tsx
// Root route — on preview/non-root-domain deployments redirect to the default
// school microsite (PREVIEW_DEFAULT_HSID env var); otherwise redirect to the
// main yatstats.com homepage.
//
// PREVIEW_DEFAULT_HSID accepts two formats:
//   • Numeric HSID  — e.g. "5004"   (direct, no DB lookup required)
//   • Slug.state    — e.g. "hamilton.az"  (resolved to numeric HSID via DB)
//
// A bare slug (e.g. "hamilton" without a state) is NOT supported because it
// is ambiguous.  Leaving the variable blank (or setting it to an unrecognised
// value) causes the root path to redirect to https://yatstats.com instead.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSchoolBySubdomainParts } from "@/lib/db";

export default async function RootPage() {
  const raw = (process.env.PREVIEW_DEFAULT_HSID || "").trim();

  let resolvedHsid: string | null = null;

  if (/^\d+$/.test(raw)) {
    // Already a numeric school ID — use it directly without a DB round-trip.
    resolvedHsid = raw;
  } else if (/^[a-z0-9-]+\.[a-z0-9-]+$/i.test(raw)) {
    // "slug.state" format (e.g. "hamilton.az") — resolve to numeric HSID via DB.
    // getSchoolBySubdomainParts is already safe against injection and returns
    // null on any error, so a DB failure here is non-fatal.
    const dotIdx = raw.indexOf(".");
    const slug = raw.slice(0, dotIdx);
    const state = raw.slice(dotIdx + 1);
    try {
      const school = await getSchoolBySubdomainParts(slug, state);
      if (school?.hsid) {
        resolvedHsid = String(school.hsid);
      }
    } catch {
      // DB lookup failed — fall through to yatstats.com redirect.
    }
  }
  // Any other value (blank, bare slug like "hamilton", etc.) → resolvedHsid
  // remains null and the visitor is sent to yatstats.com below.

  if (resolvedHsid) {
    const rootDomain = (
      process.env.ROOT_DOMAIN || "yatstats.com"
    ).toLowerCase();
    const headersList = await headers();
    // Strip port from host — same approach as middleware.ts; IPv6 not required.
    const host = (headersList.get("host") || "").toLowerCase().split(":")[0];
    const isOnRootDomain =
      host === rootDomain || host.endsWith(`.${rootDomain}`);

    // On Vercel previews, localhost, or any other non-production host the
    // root path should open the designated school microsite directly.
    if (!isOnRootDomain) {
      redirect(`/${resolvedHsid}`);
    }
  }

  redirect("https://yatstats.com");
}
