// src/app/[hsid]/layout.tsx
// Shared shell for all /{hsid}/* routes.
// Renders once: YatStyles, drawer mask, left drawer (player search + nav),
// AccountDrawer (right), and GlobalSearchModal overlay.

import { headers } from "next/headers";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import YatStyles from "@/components/yatstats/YatStyles";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import { NAV_ITEMS } from "@/lib/playerUtils";

export default async function HsidLayout({
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
    // Layout does not 404 — the child page handles that.
  }

  const resolvedHsid = String(school?.hsid || hsid);

  // Subdomain for AccountDrawer GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host.endsWith(`.${ROOT_DOMAIN}`) ? host.slice(0, -(ROOT_DOMAIN.length + 1)) : "";
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  return (
    <>
      <YatStyles />

      {/* DRAWER MASK */}
      <div className="yat-drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER — Player search + navigation */}
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

      {/* RIGHT DRAWER — Account */}
      <AccountDrawer subdomain={subdomain} />

      {/* GLOBAL SEARCH MODAL */}
      <GlobalSearchModal />

      {children}
    </>
  );
}
