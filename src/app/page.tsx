// src/app/page.tsx
// Root route — on preview/non-root-domain deployments redirect to the default
// school microsite (PREVIEW_DEFAULT_HSID env var); otherwise redirect to the
// main yatstats.com homepage.
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function RootPage() {
  const previewHsid = process.env.PREVIEW_DEFAULT_HSID;

  if (previewHsid) {
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
      redirect(`/${previewHsid}`);
    }
  }

  redirect("https://yatstats.com");
}
