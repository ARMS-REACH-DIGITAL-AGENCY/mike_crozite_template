// src/app/[hsid]/layout.tsx
// Shared shell for ALL /{hsid}/* routes.
// Provides: YatStyles, drawer mask, left drawer (player search + nav), AccountDrawer.
// Each page renders its own <header> and page-specific content as {children}.

import { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { formatSchoolName, type NavItem } from "@/lib/playerUtils";
import YatStyles from "@/components/yatstats/YatStyles";
import AccountDrawer from "@/components/yatstats/AccountDrawer";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";

  let school: Record<string, unknown> | null = null;
  try {
    school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  } catch {
    // fall through to notFound below
  }
  if (!school) notFound();

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ""));

  const ROOT_DOMAIN = "yatstats.com";
  const subdomain =
    host.replace(`.${ROOT_DOMAIN}`, "").replace(ROOT_DOMAIN, "") ||
    resolvedHsid;

  const navItems: NavItem[] = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  return (
    <>
      <YatStyles />

      {/* DRAWER MASK */}
      <div className="yat-drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER — Player search + school navigation */}
      <aside className="yat-drawer" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft" type="button" aria-label="Close menu">
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
            <a href={`/${resolvedHsid}`} className="yat-drawer-nav-item">
              &#8592; {schoolName}
            </a>
            {navItems.map((item) => (
              <a
                key={item.tab}
                href={`/${resolvedHsid}#sec-${item.tab}`}
                className="yat-drawer-nav-item"
                data-tab={item.tab}
              >
                {item.thin ? `${item.thin} ` : ""}
                {item.bold}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ACCOUNT DRAWER */}
      <AccountDrawer subdomain={subdomain} />

      {children}
    </>
  );
}
