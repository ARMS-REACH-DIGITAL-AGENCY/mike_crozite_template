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
import { getSchoolByHsid, getSchoolByUrl, getSchoolColors, getSchoolBySubdomainParts } from "@/lib/db";
import { parseSubdomainSlugState } from "@/lib/subdomainUtils";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getFirebaseConfigJSON } from "@/lib/firebase-config";
import { formatSchoolName, NAV_ITEMS } from "@/lib/playerUtils";

import YatStyles from "@/components/yatstats/YatStyles";
import SchoolRow from "@/components/yatstats/SchoolRow";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import YatInteractivity from "@/components/yatstats/YatInteractivity";

export const runtime = "nodejs";

/** Strict CSS color value allow-list.
 *  Accepts:  #RGB / #RRGGBB / #RGBA / #RRGGBBAA
 *            CSS named colors (letters-only, e.g. "red", "navy")
 *            rgb() / rgba() with integer channels
 *            hsl() / hsla() with numeric values
 *  Rejects:  url(), expression(), data URIs, or anything else.
 *  The return value is safe to embed in a `<style>` rule as a property value.
 */
function sanitizeCssColor(v: string | null): string {
  if (!v) return "";
  const t = v.trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(t)) return t;
  if (/^[a-z]{2,30}$/.test(t)) return t; // named color (e.g. "red")
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(t)) return t;
  if (/^hsla?\(\s*\d{1,3}(\.\d+)?\s*,\s*\d{1,3}(\.\d+)?%\s*,\s*\d{1,3}(\.\d+)?%(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(t)) return t;
  return "";
}

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
    // Fallback 1: numeric hsid direct lookup
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
    // Fallback 2: {slug}.{state}.yatstats.com subdomain naming protocol
    if (!school && host) {
      const subParts = parseSubdomainSlugState(host, process.env.ROOT_DOMAIN);
      if (subParts) {
        school = (await getSchoolBySubdomainParts(subParts.slug, subParts.state)) as Record<string, unknown> | null;
      }
    }
  } catch { /* silently fall back to defaults */ }

  const resolvedHsid = school ? String(school.hsid ?? hsid) : hsid;
  const schoolName = school ? formatSchoolName(String(school.hsname || "")) : "";
  const location = school ? String(school.hslocation || "").toUpperCase() : "";
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  // Fetch school brand colors for the strip border accent line.
  const { color1, color2, color3 } = await getSchoolColors(resolvedHsid);
  const c1 = sanitizeCssColor(color1);
  const c2 = sanitizeCssColor(color2);
  const c3 = sanitizeCssColor(color3);
  const colorVars = [
    c1 && `--school-color1:${c1}`,
    c2 && `--school-color2:${c2}`,
    c3 && `--school-color3:${c3}`,
  ]
    .filter(Boolean)
    .join(";");

  const firebaseConfigJSON = getFirebaseConfigJSON();

  return (
    <>
      <YatStyles />
      {/* School brand colors — injected as CSS variables used by strip borders.
          Each value has been validated by sanitizeCssColor() which only passes
          hex, named, rgb(), or hsl() literals — no url(), expression(), or
          arbitrary characters — making the innerHTML content safe. */}
      {colorVars && (
        <style dangerouslySetInnerHTML={{ __html: `:root{${colorVars}}` }} />
      )}

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
            <button className="yat-icon-btn" id="theme-toggle" type="button" aria-label="Toggle Theme">
              <i className="ri-sun-line" />
            </button>
            <button className="yat-icon-btn" id="btnSearch" type="button" aria-label="Global Search">
              <i className="ri-search-line" />
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

        <div className="yat-school-stripe" />
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
      {/* Pass resolvedHsid (integer school ID) so home_hsid is stored correctly on registration */}
      <AccountDrawer subdomain={resolvedHsid} />

      {/* ── GLOBAL SEARCH MODAL — search icon opens this ─────────────── */}
      <GlobalSearchModal />

      {/* ── INTERACTIVITY — wires every shared element above ─────────── */}
      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={firebaseConfigJSON} />

      {/* ── PAGE BODY ─────────────────────────────────────────────────── */}
      {children}
    </>
  );
}
