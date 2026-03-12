// src/app/[hsid]/layout.tsx
// Shared shell for all /{hsid}/* routes.
// Provides: YatStyles (CSS), drawer mask, left drawer (player search + nav), account drawer.
// Each child page supplies its own header and main content.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { NAV_ITEMS } from "@/lib/playerUtils";
import YatStyles from "@/components/yatstats/YatStyles";
import AccountDrawer from "@/components/yatstats/AccountDrawer";

export const runtime = "nodejs";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";

  let school: Record<string, unknown> | null = null;
  try {
    school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
    if (!school) school = await getSchoolByHsid(hsid) as Record<string, unknown> | null;
  } catch {
    notFound();
  }
  if (!school) notFound();

  const resolvedHsid = String(school.hsid ?? hsid);

  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  return (
    <>
      <YatStyles />

      {/* DRAWER MASK */}
      <div className="yat-drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER — identical on every /{hsid} page */}
      <aside className="yat-drawer" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft">
          <i className="ri-close-line" />
        </button>
        <div className="yat-drawer-content">
          <h3>PLAYER SEARCH</h3>
          <div style={{ padding: "0 0 10px" }}>
            <input id="playerSearch" type="search" placeholder="Type a name…" />
            <div id="liveResults" />
          </div>
          <h3>NAVIGATION</h3>
          <div className="yat-drawer-nav">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.tab}
                href={`/${resolvedHsid}#sec-${item.tab}`}
                className="yat-drawer-nav-item"
                data-tab={item.tab}
              >
                {item.thin ? `${item.thin} ` : ""}{item.bold}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ACCOUNT DRAWER — shared auth UI */}
      <AccountDrawer subdomain={subdomain} />

      {children}
    </>
  );
}
