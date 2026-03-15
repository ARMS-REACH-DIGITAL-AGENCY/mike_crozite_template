// src/app/[hsid]/layout.tsx
import { getSchoolByHsid, getFirebaseConfigJSON } from "@/lib/db";
import { notFound } from "next/navigation";
import HeroHeader from "@/components/yatstats/HeroHeader";
import SchoolRow from "@/components/yatstats/SchoolRow";
import SectionTabs from "@/components/yatstats/SectionTabs";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import AccountDrawer from "@/components/AccountDrawer";
import FiltersDrawer from "@/components/FiltersDrawer";
import YatInteractivity from "@/components/yatstats/YatInteractivity";
import YatStyles from "@/components/yatstats/YatStyles";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { hsid: string };
}) {
  const { hsid } = params;
  const school = await getSchoolByHsid(hsid);
  if (!school) notFound();

  const subdomain = school.microsite_url?.split(".")[0] || "hamilton.az";
  const resolvedHsid = String(school.hsid);

  const navItems = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "FAQ'S", bold: "", tab: "faq" },
  ];

  return (
    <div className="yat-app">
      <YatStyles />
      <header className="yat-header">
        <HeroHeader />
        <div className="yat-hr" />
        <SchoolRow school={school} />
        <div className="yat-hr" />
        <SectionTabs items={navItems} />
      </header>

      <GlobalSearchModal />
      
      <aside className="yat-drawer" id="drawerLeft">
        <div className="yat-drawer-header">
          <h3>NAVIGATION</h3>
          <button className="yat-icon-btn yat-close-btn" id="closeLeft">
            <i className="ri-close-line"></i>
          </button>
        </div>
        <div className="yat-drawer-content">
          <div className="yat-drawer-nav">
            <a href={`/${hsid}`} className="yat-drawer-nav-item">← BACK TO {school.hsname}</a>
            {navItems.map((item, idx) => (
              <a 
                key={idx} 
                href={`/${hsid}#sec-${item.tab}`}
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
        <a href="https://www.instagram.com/platoscloset_scottsdale?igsh=bzh3NGN0a3d5dW44" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Presented by</span>
          <span className="sponsor-name">PLATO'S CLOSET</span>
        </a>
      </footer>

      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={getFirebaseConfigJSON()} />
    </div>
  );
}
