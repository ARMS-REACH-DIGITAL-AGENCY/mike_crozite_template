// src/components/yatstats/SectionTabs.tsx
// Top navigation bar tab links

import type { NavItem } from "@/lib/playerUtils";

interface SectionTabsProps {
  navItems: NavItem[];
  /** When provided, links use full /{resolvedHsid}#sec-{tab} URLs (correct for all routes). */
  resolvedHsid?: string;
}

export default function SectionTabs({ navItems, resolvedHsid }: SectionTabsProps) {
  return (
    <nav className="yat-topnav" aria-label="Top Navigation">
      {navItems.map((item) => (
        <a
          key={item.tab}
          // Full URL so links work correctly from any route (gallery or player profile).
          // data-tab is kept so YatInteractivity can intercept gallery-home clicks with
          // e.preventDefault() and switch sections via JS without a page reload.
          href={resolvedHsid ? `/${resolvedHsid}#sec-${item.tab}` : `#sec-${item.tab}`}
          className="yat-nav-pair"
          data-tab={item.tab}
        >
          {item.thin && <span className="thin">{item.thin} </span>}
          <span className="bold">{item.bold}</span>
        </a>
      ))}
    </nav>
  );
}
