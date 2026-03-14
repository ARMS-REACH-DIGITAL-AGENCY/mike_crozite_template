// src/app/page.tsx
// Root route — on preview/non-root-domain deployments redirect to the default
// school microsite (PREVIEW_DEFAULT_HSID env var); otherwise redirect to the
// main yatstats.com homepage.
//
// IMPORTANT: PREVIEW_DEFAULT_HSID MUST be a numeric school ID (e.g. "5004").
// Slug-based values (e.g. "hamilton") cannot be resolved on Vercel preview
// deployments because there is no yatstats.com subdomain for the middleware
// to rewrite, so the [hsid] route has no way to look up the school and will
// return a 404. Always use the numeric hsid.
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function RootPage() {
  const previewHsid = process.env.PREVIEW_DEFAULT_HSID;

  // Only use the preview HSID when it is a purely numeric school ID.
  // Slug-based values (e.g. "hamilton") cannot be resolved on Vercel preview
  // deployments — the [hsid] route depends on a yatstats.com subdomain header
  // to translate a slug into a numeric HSID via the database, and that header
  // is absent on *.vercel.app / localhost URLs. Using a slug would redirect to
  // a route that immediately returns 404, which confuses Vercel's preview links.
  const numericPreviewHsid =
    previewHsid && /^\d+$/.test(previewHsid.trim()) ? previewHsid.trim() : null;

  if (numericPreviewHsid) {
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
      redirect(`/${numericPreviewHsid}`);
    }
  }

  redirect("https://yatstats.com");
}
