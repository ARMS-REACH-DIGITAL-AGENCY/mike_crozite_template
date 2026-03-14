// src/app/[hsid]/layout.tsx
// THE ONE shared shell for every /{hsid}/* page.
//
// This layout renders all global chrome exactly once:
//   • Topbar: hamburger · account · theme · global-search  +  #topbarSecondaryIcons slot
//   • School identity row: crest (#stickyIdentityImg) + name + #yatSectionLabel + #schoolRowRight slot
//   • Left drawer (hamburger) — player search + section nav
//   • Account drawer (account icon)
//   • Global Search modal (search icon)
//   • YatInteractivity — wires all of the above
//
// Pages inject their sub-type-specific secondary icons via a tiny inline <script>
// that runs before DOMContentLoaded and sets innerHTML of:
//   #topbarSecondaryIcons  — filter+reset (gallery)  |  back-arrow (player profile)  |  empty (funnel)
//   #schoolRowRight        — empty (gallery/funnel)  |  favorite button (player profile)
//   #yatSectionLabel       — section name (gallery via YatInteractivity) | player name (profile)

import { headers } from "next/headers";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getFirebaseConfigJSON } from "@/lib/firebase-config";
import { formatSchoolName, NAV_ITEMS } from "@/lib/playerUtils";

import YatStyles from "@/components/yatstats/YatStyles";
import SchoolRow from "@/components/yatstats/SchoolRow";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import YatInteractivity from "@/components/yatstats/YatInteractivity";

export const runtime = "nodejs";

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
    if (host) school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  } catch { /* silently fall back to defaults */ }

  const resolvedHsid = school ? String(school.hsid ?? hsid) : hsid;
  const schoolName = school ? formatSchoolName(String(school.hsname || "")) : "";
  const location = school ? String(school.hslocation || "").toUpperCase() : "";
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  const firebaseConfigJSON = getFirebaseConfigJSON();

  return (
    <>
      <YatStyles />

      {/* ── GLOBAL HEADER ──────────────────────────────────────────────────
          This is the ONE header rendered for every page in the microsite.
          Pages do NOT render their own headers or drawers.
      ──────────────────────────────────────────────────────────────────── */}
      <header className="yat-header" id="site-header">
        <div className="yat-container yat-topbar">

          {/* Global icons — ALWAYS present, NEVER moved, IDENTICAL on every page */}
          <div className="yat-left-icons">
            <button className="yat-icon-btn" id="btnMenu" type="button" aria-label="Menu">
              <i className="ri-menu-line" />
            </button>
            <button className="yat-icon-btn" id="btnAccount" type="button" aria-label="Account">
              <i className="ri-user-3-line" />
            </button>
            <button className="yat-icon-btn" id="btnSearch" type="button" aria-label="Global Search">
              <i className="ri-search-line" />
            </button>
            <button className="yat-icon-btn" id="theme-toggle" type="button" aria-label="Toggle Theme">
              <i className="ri-sun-line" />
            </button>
          </div>

          {/* Section navigation (center) */}
          <nav className="yat-topnav" aria-label="Top Navigation">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.tab}
                href={`/${resolvedHsid}#sec-${item.tab}`}
                className="yat-nav-pair"
                data-tab={item.tab}
              >
                {item.thin && <span className="thin">{item.thin} </span>}
                <span className="bold">{item.bold}</span>
              </a>
            ))}
          </nav>

          {/* Secondary-icon slot — filled by page-type JS before DOMContentLoaded:
              gallery   → filter + reset buttons
              profile   → back-arrow link
              funnel    → left empty   */}
          <div id="topbarSecondaryIcons" className="yat-right-icons" />

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

        {/* School identity row — crest never moves; #yatSectionLabel and #schoolRowRight are page-filled */}
        <SchoolRow
          crestUrl={crestUrl}
          schoolName={schoolName}
          location={location}
          defaultSectionLabel="ACTIVE BASEBALL ALUMNI"
        />

        <div className="yat-hr" />
      </header>

      {/* ── DRAWER MASK (shared) ──────────────────────────────────────── */}
      <div className="yat-drawer-mask" id="drawerMask" />

      {/* ── LEFT DRAWER — hamburger opens this ───────────────────────── */}
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
                data-tab={item.tab}
              >
                {item.thin ? `${item.thin} ` : ""}{item.bold}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ── ACCOUNT DRAWER — account icon opens this ─────────────────── */}
      <AccountDrawer subdomain={subdomain} />

      {/* ── GLOBAL SEARCH MODAL — search icon opens this ─────────────── */}
      <GlobalSearchModal />

      {/* ── INTERACTIVITY — wires every shared element above ─────────── */}
      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={firebaseConfigJSON} />

      {/* ── PAGE BODY ─────────────────────────────────────────────────── */}
      {children}
    </>
  );
}
