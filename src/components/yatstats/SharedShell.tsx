
// src/components/yatstats/SharedShell.tsx
// This component renders the unified shell UI (Rows 1-4).
// It uses the SchoolContext to get school data and renders the appropriate headers.

'use client';

import { ReactNode, useContext } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Import sub-components for each row
import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';

export default function SharedShell({ children, hsid }: { children: ReactNode, hsid: string }) {
  const schoolData = useContext(SchoolContext);
  const pathname = usePathname();

  // Determine the current page family from the pathname
  const isPlayerProfile = pathname.includes('/player/');
  const isNews = pathname.includes('/news');
  const isGallery = !isPlayerProfile && !isNews; // Default

  return (
    <>
      <header className="yat-header">
        <GlobalTopbar />
        <SchoolContextBar isPlayerProfile={isPlayerProfile} isGallery={isGallery} isNews={isNews} />
      </header>

      <main>
        {/* Row 3 and 4 are part of the page content, not the sticky shell */}
        <InteractionStrip isPlayerProfile={isPlayerProfile} isGallery={isGallery} isNews={isNews} />
        <MetadataRow isPlayerProfile={isPlayerProfile} isGallery={isGallery} />

        {/* Row 5: The actual page content */}
        <div className="yat-page-content-row">
          {children}
        </div>
      </main>

      <footer className="yat-footer">
        <a href="https://www.armsreachdigital.com/" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Powered By</span>
          <span className="sponsor-name">ARMS REACH</span>
        </a>
      </footer>
    </>
  );
}
