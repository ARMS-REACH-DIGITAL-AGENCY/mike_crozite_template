// src/components/yatstats/SectionTabs.tsx
// Top navigation bar tab links

import type { NavItem } from "@/lib/playerUtils";

interface SectionTabsProps {
  navItems: NavItem[];
}

export default function SectionTabs({ navItems }: SectionTabsProps) {
  return (
    <nav className="yat-topnav" aria-label="Top Navigation">
      {navItems.map((item) => (
        <a key={item.tab} href={`#sec-${item.tab}`} className="yat-nav-pair" data-tab={item.tab}>
          {item.thin && <span className="thin">{item.thin} </span>}
          <span className="bold">{item.bold}</span>
        </a>
      ))}
    </nav>
  );
}
