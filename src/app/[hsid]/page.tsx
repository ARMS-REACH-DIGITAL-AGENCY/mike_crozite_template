// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite
// Minimal orchestration: fetch school + players, pass props to components.

import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
} from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getFirebaseConfigJSON } from "@/lib/firebase-config";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { gradClass, type NavItem } from "@/lib/playerUtils";

import YatStyles from "@/components/yatstats/YatStyles";
import HeroHeader from "@/components/yatstats/HeroHeader";
import FiltersDrawer from "@/components/yatstats/FiltersDrawer";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import PlayerCard from "@/components/yatstats/PlayerCard";
import YatInteractivity from "@/components/yatstats/YatInteractivity";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostSchool = host ? await getSchoolByUrl(`https://${host}`) : null;
  const school = hostSchool || await getSchoolByHsid(hsid);
  const name = (school as Record<string, unknown>)?.hsname as string || "Your School";
  const loc = (school as Record<string, unknown>)?.hslocation as string || "";
  const locParts = loc.split(",").map((s: string) => s.trim());
  const stateAbbr = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase() : "";
  const titleParts = [name.toUpperCase(), stateAbbr, "YAT?STATS - Where They YAT?"].filter(Boolean);
  const schoolHsid = (school as Record<string, unknown>)?.hsid as string || hsid;
  const crestUrl = getSchoolCrestUrl(schoolHsid);
  const canonicalUrl = getCanonicalBaseUrl(school as Record<string, unknown> | null, schoolHsid);
  return {
    title: titleParts.join(" | "),
    description: `Track active and all-time baseball alumni from ${name} (${loc}).`,
    alternates: { canonical: canonicalUrl },
    icons: {
      icon: [
        { url: crestUrl, type: "image/png" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ],
      apple: crestUrl,
    },
  };
}

export default async function SchoolPage({ params }: { params: Promise<{ hsid: string }> }) {
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

  // Redirect numeric hsid paths to the school's custom domain (skip on preview deployments)
  const micrositeUrl = (school as Record<string, unknown>).microsite_url as string | undefined;
  const isNumericHsid = /^\d+$/.test(hsid);
  const isPreview = host.includes("vercel.app") || host.includes("localhost");
  if (micrositeUrl && isNumericHsid && !isPreview) {
    permanentRedirect(micrositeUrl.replace(/\/$/, ""));
  }

  const resolvedHsid = String(school.hsid ?? hsid);
  const [activeRoster, allTimeRoster] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
  ]);

  const schoolNameRaw = (String(school.hsname || "")).toUpperCase();
  const schoolName = schoolNameRaw.includes("HIGH SCHOOL") ? schoolNameRaw : `${schoolNameRaw} HIGH SCHOOL`;
  const location = (String(school.hslocation || "")).toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const defaultSectionLabel = "ACTIVE BASEBALL ALUMNI";
  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
  const photoDefaultUrl = `${canonicalBase}/assets/img/now_players/default.jpg`;

  const navItems: NavItem[] = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  // Extract subdomain for GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  const gradClasses = Array.from(new Set(
    [...(activeRoster as Record<string, unknown>[]), ...(allTimeRoster as Record<string, unknown>[])].map((p) => gradClass(p)).filter(Boolean)
  )).sort().reverse();

  return (
    <>
      <YatStyles />

      <HeroHeader
        schoolName={schoolName}
        location={location}
        crestUrl={crestUrl}
        defaultSectionLabel={defaultSectionLabel}
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
              <a key={item.tab} href={`#sec-${item.tab}`} className="yat-drawer-nav-item" data-tab={item.tab}>
                {item.thin ? `${item.thin} ` : ""}{item.bold}
              </a>
            ))}
          </div>
        </div>
      </aside>

      <FiltersDrawer gradClasses={gradClasses} />
      <AccountDrawer subdomain={subdomain} />

      {/* GLOBAL SEARCH MODAL */}
      <GlobalSearchModal />

      {/* MAIN CONTENT */}
      <main id="main-content">

        {/* ACTIVE ALUMNI */}
        <section id="sec-active" className="yat-section visible">
          <div className="yat-grid" id="active-grid">
            {(activeRoster as Record<string, unknown>[]).length === 0 ? (
              <div className="yat-empty">
                <div className="yat-empty-icon">⚾</div>
                <div className="yat-empty-title">No active players found</div>
                <div className="yat-empty-sub">Check back once the 2026 season begins</div>
              </div>
            ) : (activeRoster as Record<string, unknown>[]).map((p) => (
              <PlayerCard
                key={String(p.playerid)}
                player={p}
                resolvedHsid={resolvedHsid}
                photoDefaultUrl={photoDefaultUrl}
              />
            ))}
          </div>
        </section>

        {/* ALL-TIME LIST */}
        <section id="sec-alltime" className="yat-section">
          <div className="yat-grid" id="alltime-grid">
            {(allTimeRoster as Record<string, unknown>[]).length === 0 ? (
              <div className="yat-empty">
                <div className="yat-empty-icon">⚾</div>
                <div className="yat-empty-title">No alumni found</div>
                <div className="yat-empty-sub">Check back as we continue building the database</div>
              </div>
            ) : (allTimeRoster as Record<string, unknown>[]).map((p) => (
              <PlayerCard
                key={String(p.playerid)}
                player={p}
                resolvedHsid={resolvedHsid}
                photoDefaultUrl={photoDefaultUrl}
                isAllTime
              />
            ))}
          </div>
        </section>

        {/* NEWS */}
        <section id="sec-news" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">📰</div>
            <div className="yat-placeholder-title">Alumni News Coming Soon</div>
            <div className="yat-placeholder-body">
              Integrating with <strong style={{ color: "var(--fg)" }}>Webz.io</strong> to automatically surface news for every active alumni.
            </div>
          </div>
        </section>

        {/* CURRENT TEAM */}
        <section id="sec-team" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🏟️</div>
            <div className="yat-placeholder-title">Current Team Roster</div>
            <div className="yat-placeholder-body">
              The current {schoolName} varsity roster will appear here once the season begins.
            </div>
          </div>
        </section>

        {/* MENTOR */}
        <section id="sec-mentor" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">Mentorship Marketplace</div>
            <div className="yat-placeholder-body">
              Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.
            </div>
          </div>
        </section>

        {/* PARTNER */}
        <section id="sec-partner" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">PCD Action Partner Program</div>
            <div className="yat-placeholder-body">
              Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
              <br /><br />
              <a
                href="mailto:sponsor@yatstats.com"
                style={{
                  display: "inline-block",
                  background: "#00e676",
                  color: "#000",
                  fontFamily: '"Bebas Neue",Oswald,sans-serif',
                  fontSize: "14px",
                  letterSpacing: ".1em",
                  padding: "10px 24px",
                  borderRadius: "4px",
                }}
              >
                Get In Touch
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sec-faq" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">❓</div>
            <div className="yat-placeholder-title">FAQ&apos;s</div>
            <div className="yat-placeholder-body">
              Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon.
            </div>
          </div>
        </section>

      </main>

      {/* SPONSOR FOOTER */}
      <footer className="yat-footer">
        <a href="https://peteismyagent.com/products" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Presented by</span>
          <span className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</span>
        </a>
      </footer>

      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={getFirebaseConfigJSON()} />
    </>
  );
}
