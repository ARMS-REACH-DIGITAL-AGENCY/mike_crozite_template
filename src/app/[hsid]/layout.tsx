// src/app/[hsid]/layout.tsx
// Shared shell for all /{hsid}/* routes.
// Owns: stable header chrome (topbar + wordmark + SchoolRow + dividers),
//       GlobalSearchModal overlay, drawers (left + account), drawer mask, footer.
// Pages own: body/content family + page-local slot content (back arrow, player name, FAVORITE).

import { headers } from "next/headers";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import YatStyles from "@/components/yatstats/YatStyles";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import SchoolRow from "@/components/yatstats/SchoolRow";
import SectionTabs from "@/components/yatstats/SectionTabs";
import { NAV_ITEMS, formatSchoolName } from "@/lib/playerUtils";

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
  const schoolName = formatSchoolName(String(school?.hsname || ""));
  const location = (String(school?.hslocation || "")).toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  // Subdomain for AccountDrawer GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host.endsWith(`.${ROOT_DOMAIN}`) ? host.slice(0, -(ROOT_DOMAIN.length + 1)) : "";
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  return (
    <>
      <YatStyles />

      {/* HEADER — stable chrome across ALL /{hsid}/* routes
           DOM slots for page-local content:
           • #topbarLeftExt — player profile prepends a back-arrow <a> here via inline script
           • #yatSectionLabel — gallery YatInteractivity sets section breadcrumb;
                                player profile inline script sets player display name
           • #schoolRowRight — player profile inline script injects the FAVORITE button here */}
      <header className="yat-header" id="site-header">
        <div className="yat-container yat-topbar">
          <div className="yat-left-icons">
            {/* DOM slot: page scripts inject page-specific left icons (e.g. back arrow on player profile) */}
            <span id="topbarLeftExt" />
            <button className="yat-icon-btn" id="btnMenu" type="button" aria-label="Menu">
              <i className="ri-menu-line" />
            </button>
            <button className="yat-icon-btn" id="btnAccount" type="button" aria-label="Account">
              <i className="ri-user-3-line" />
            </button>
            <button className="yat-icon-btn" id="btnSearch" type="button" aria-label="Search">
              <i className="ri-search-line" />
            </button>
            <button className="yat-icon-btn" id="theme-toggle" type="button" aria-label="Toggle Theme">
              <i className="ri-sun-line" />
            </button>
          </div>

          <SectionTabs navItems={NAV_ITEMS} resolvedHsid={resolvedHsid} />

          <div className="yat-wordmark-wrap">
            <a
              href="https://home.yatstats.com"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
                alt="YAT?STATS"
                className="yat-wordmark-img"
                style={{ height: "28px", width: "auto", filter: "var(--logo-filter)" }}
              />
            </a>
          </div>
        </div>

        <div className="yat-hr" />

        <SchoolRow crestUrl={crestUrl} schoolName={schoolName} location={location} />

        <div className="yat-hr" />
      </header>

      {/* GLOBAL SEARCH MODAL — wired by YatInteractivity (gallery) and inline script (player profile) */}
      <GlobalSearchModal />

      {/* DRAWER MASK */}
      <div className="yat-drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER — Player search + navigation */}
      <aside className="yat-drawer" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft" type="button">
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
                data-sec={item.tab}
              >
                {item.thin ? `${item.thin} ` : ""}{item.bold}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* RIGHT DRAWER — Account */}
      <AccountDrawer subdomain={subdomain} />

      {children}

      {/* FOOTER — stable chrome */}
      <footer className="yat-footer">
        <a href="https://peteismyagent.com/products" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Presented by</span>
          <span className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</span>
        </a>
        <a href="mailto:sponsor@yatstats.com" className="sponsor-cta-link">
          Sponsor This Page
        </a>
      </footer>
    </>
  );
}
