"use client";
// src/components/yatstats/SectionTabs.tsx
// Top navigation bar tab links

import type { NavItem } from "@/lib/playerUtils";
import { useParams } from "next/navigation";

interface SectionTabsProps {
  navItems: NavItem[];
}

export default function SectionTabs({ navItems }: SectionTabsProps) {
  const params = useParams();
  const hsid = params?.hsid;

  return (
    <nav className="yat-topnav" aria-label="Top Navigation">
      {navItems.map((item) => (
        <a 
          key={item.tab} 
          href={hsid ? `/${hsid}#sec-${item.tab}` : `#sec-${item.tab}`} 
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
