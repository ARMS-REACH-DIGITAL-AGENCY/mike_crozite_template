import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountDrawer from "@/components/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import { getSchoolByHsid, getSchoolByUrl } from "@/lib/db";
import { formatSchoolName, type NavItem } from "@/lib/playerUtils";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";

export default async function PlayerLayout({
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
  school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
  if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ""));
  const location = String(school.hslocation || "").toUpperCase();
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
      <header className="yat-header" id="site-header">
        <div className="yat-container yat-topbar">
          <div className="yat-left-icons">
            <a href={`/${resolvedHsid}`} className="yat-icon-btn" aria-label="Back to school"><i className="ri-arrow-left-line" /></a>
            <button className="yat-icon-btn" id="btnMenu" aria-label="Menu"><i className="ri-menu-line" /></button>
            <button className="yat-icon-btn" id="btnAccount" aria-label="Account"><i className="ri-user-3-line" /></button>
            <button className="yat-icon-btn" id="btnSearch" aria-label="Search"><i className="ri-search-line" /></button>
            <button className="yat-icon-btn" id="theme-toggle" aria-label="Toggle Theme"><i className="ri-sun-line" /></button>
          </div>
          <nav className="yat-topnav" aria-label="Top Navigation">
            {navItems.map((item) => (
              <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="yat-nav-pair">
                {item.thin && <span className="thin">{item.thin} </span>}
                <span className="bold">{item.bold}</span>
              </a>
            ))}
          </nav>
          <div className="yat-wordmark-wrap">
            <a href="https://home.yatstats.com" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
                alt="YAT?STATS"
                style={{ height: "30px", width: "auto", filter: "var(--logo-filter)" }}
              />
            </a>
          </div>
        </div>
        <div className="yat-hr" />
        <div className="yat-schoolrow" id="schoolRow">
          <div className="yat-schoolrow-id">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={crestUrl} alt={`${schoolName} crest`} className="yat-crest" id="school-crest" />
            <div className="yat-schooltext">
              <div className="...line1...">{location}</div>
              <div className="...line2...">{schoolName}</div>
              <div className="...line3...">{playerName}</div>
            </div>
          </div>
          <button id="btnFanFav" className="fav-btn-hero" aria-label="Favorite">
            <i className="ri-star-line" /> FAVORITE
          </button>
        </div>
      </header>

      <div className="drawer-mask" id="drawerMask" />

      <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft"><i className="ri-close-line" /></button>
        <h3 style={{ font: '700 16px "Bebas Neue",sans-serif', letterSpacing: '.1em', marginBottom: '8px', paddingTop: '8px' }}>PLAYER SEARCH</h3>
        <div style={{ paddingBottom: '12px' }}>
          <input id="playerSearch" type="search" placeholder="Type a name…" className="drawer-search-input" />
          <div id="liveResults" />
        </div>
        <h3 style={{ font: '700 16px "Bebas Neue",sans-serif', letterSpacing: '.1em', marginBottom: '8px' }}>NAVIGATION</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <a href={`/${resolvedHsid}`} className="drawer-nav-link">&#8592; BACK TO {schoolName}</a>
          {navItems.map((item) => (
            <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="drawer-nav-link">
              {item.thin ? `${item.thin} ` : ""}{item.bold}
            </a>
          ))}
        </div>
      </aside>

      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
        <h3 style={{ font: '700 16px "Bebas Neue",sans-serif', letterSpacing: '.1em', marginBottom: '16px', paddingTop: '8px' }}>ACCOUNT</h3>
        <AccountDrawer subdomain={subdomain} />
      </aside>

      <GlobalSearchModal />

      {children}
    </>
  );
}
