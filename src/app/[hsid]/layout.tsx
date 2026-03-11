// src/app/[hsid]/layout.tsx
// YAT?STATS — Shared school-level layout
// Provides the global functional shell (Header, Nav, Drawers, Interactivity) for all school and player pages.

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { formatSchoolName, type NavItem } from "@/lib/playerUtils";
import { getFirebaseConfigJSON } from "@/lib/firebase-config";

import YatStyles from "@/components/yatstats/YatStyles";
import HeroHeader from "@/components/yatstats/HeroHeader";
import FiltersDrawer from "@/components/yatstats/FiltersDrawer";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import YatInteractivity from "@/components/yatstats/YatInteractivity";

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
  const schoolName = formatSchoolName(String(school.hsname || ""));
  const location = (String(school.hslocation || "")).toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  
  const navItems: NavItem[] = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  return (
    <>
      <YatStyles />
      
      <HeroHeader
        schoolName={schoolName}
        location={location}
        crestUrl={crestUrl}
        defaultSectionLabel="ACTIVE BASEBALL ALUMNI"
        navItems={navItems}
      />

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
            {navItems.map((item) => (
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

      <FiltersDrawer gradClasses={[]} />
      <AccountDrawer subdomain={subdomain} />

      {children}

      {/* SPONSOR FOOTER */}
      <footer className="yat-footer">
        <a href="https://peteismyagent.com/products" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Presented by</span>
          <span className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</span>
        </a>
      </footer>

      {/* This is the functional engine that powers search, drawers, and tabs */}
      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={getFirebaseConfigJSON()} />

      {/* Article detail overlay + modal drawer */}
      <div className="yat-article-overlay" id="articleOverlay" />
      <aside className="yat-article-modal" id="articleModal" role="dialog" aria-modal="true" aria-label="Article detail">
        <div className="yat-article-modal-top">
          <span className="yat-article-modal-label">ALUMNI NEWS</span>
          <button className="yat-article-modal-close" id="articleModalClose" aria-label="Close">
            <i className="ri-close-line" />
          </button>
        </div>
        <div id="articleModalImg" />
        <div className="yat-article-modal-body" id="articleModalBody"></div>
      </aside>
    </>
  );
}
