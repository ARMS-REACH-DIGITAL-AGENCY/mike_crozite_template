// src/components/yatstats/HeroHeader.tsx
// Top hero bar: hamburger + account + theme toggle | top nav | wordmark
// School crest + name row + hero strip with search/filter icons

import type { NavItem } from "@/lib/playerUtils";
import SchoolRow from "@/components/yatstats/SchoolRow";
import SectionTabs from "@/components/yatstats/SectionTabs";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";

interface HeroHeaderProps {
  schoolName: string;
  location: string;
  crestUrl: string;
  defaultSectionLabel: string;
  navItems: NavItem[];
}

export default function HeroHeader({
  schoolName,
  location,
  crestUrl,
  defaultSectionLabel,
  navItems,
}: HeroHeaderProps) {
  return (
    <header className="yat-header" id="site-header">
      <div className="yat-container yat-topbar">
        <div className="yat-left-icons">
          <button className="yat-icon-btn" id="btnMenu" aria-label="Menu">
            <i className="ri-menu-line" />
          </button>
          <button className="yat-icon-btn" id="btnAccount" aria-label="Account">
            <i className="ri-user-3-line" />
          </button>
          <button className="yat-icon-btn" id="theme-toggle" aria-label="Toggle Theme">
            <i className="ri-sun-line" />
          </button>
        </div>

        <SectionTabs navItems={navItems} />

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

      <SchoolRow
        crestUrl={crestUrl}
        schoolName={schoolName}
        location={location}
        defaultSectionLabel={defaultSectionLabel}
      />

      <div className="yat-hr" />

      <div className="yat-hero">
        <div className="yat-container yat-hero-grid">
          <div className="yat-hero-left">
            <div className="yat-tag-duo">
              <div className="yat-tag-swap">
                <span className="yat-tag-grey">FLIP FOR </span>
                <span className="yat-tag-bold">STATS!</span>
              </div>
              <div className="yat-tag-swap">
                <span className="yat-tag-grey">WHERE THEY </span>
                <span className="yat-tag-bold">YAT?</span>
              </div>
            </div>
          </div>
          <GlobalSearchModal />
        </div>
        {/* Dropdown must live outside yat-hero-grid so position:absolute tops out at yat-hero */}
        <div id="heroSearchDrop" className="yat-hero-search-drop" />
      </div>
    </header>
  );
}
