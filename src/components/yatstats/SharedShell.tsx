
// src/components/yatstats/SharedShell.tsx
// This component renders the unified shell UI (Rows 1-4).
// It uses the SchoolContext to get school data and renders the appropriate headers.

'use client';

import { ReactNode, isValidElement, useContext } from 'react';
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

  const childList = Array.isArray(children) ? children : [children];
  let row3Content: ReactNode = null;
  let row4Content: ReactNode = null;
  let row5Content: ReactNode[] = [];
  const unassigned: ReactNode[] = [];

  for (const child of childList) {
    if (isValidElement(child)) {
      const row = (child.props as Record<string, unknown>)['data-row'];
      if (row === '3' || row === 3) {
        row3Content = child;
        continue;
      }
      if (row === '4' || row === 4) {
        row4Content = child;
        continue;
      }
      if (row === '5' || row === 5) {
        row5Content.push(child);
        continue;
      }
    }
    unassigned.push(child);
  }

  if (row5Content.length === 0) {
    row5Content = unassigned;
  } else {
    row5Content = [...row5Content, ...unassigned];
  }

  return (
    <>
      <header className="yat-header">
        <GlobalTopbar />
        <SchoolContextBar isPlayerProfile={isPlayerProfile} isGallery={isGallery} isNews={isNews} />
      </header>

      <main>
        {/* Row 3 */}
        {isPlayerProfile && row3Content ? (
          <div className="yat-row3">{row3Content}</div>
        ) : (
          <InteractionStrip isPlayerProfile={isPlayerProfile} isGallery={isGallery} isNews={isNews} />
        )}

        {/* Row 4 */}
        {isPlayerProfile && row4Content ? (
          <div className="yat-row4">{row4Content}</div>
        ) : (
          <MetadataRow isPlayerProfile={isPlayerProfile} isGallery={isGallery} />
        )}

        {/* Row 5: The actual page content */}
        <div className="yat-page-content-row">
          {row5Content}
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
