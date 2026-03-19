// src/app/[hsid]/layout.tsx
// STRICT 6-ROW SHARED SHELL — THIS IS LAW

import { ReactNode } from 'react';
import { getSchoolByHsid, getSchoolByUrl } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { getFirebaseConfigJSON } from '@/lib/firebase-config';
import { formatSchoolName } from '@/lib/playerUtils';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

// Shared Components
import YatStyles from '@/components/yatstats/YatStyles';
import YatInteractivity from '@/components/yatstats/YatInteractivity';
import AccountDrawerContent from '@/components/AccountDrawer';
import GlobalSearchModal from '@/components/yatstats/GlobalSearchModal';
import SchoolContextProvider from '@/context/SchoolContext';
import GlobalTopbar from '@/components/yatstats/shell/GlobalTopbar';
import SchoolContextBar from '@/components/yatstats/shell/SchoolContextBar';
import InteractionStrip from '@/components/yatstats/shell/InteractionStrip';
import MetadataRow from '@/components/yatstats/shell/MetadataRow';

export const runtime = 'nodejs';

export default async function HsidLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';

  let school: Record<string, unknown> | null = null;
  try {
    school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  } catch {
    notFound();
  }
  if (!school) notFound();

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ''));
  const location = String(school.hslocation || '').toUpperCase();
  const crestUrl = getSchoolCrestUrl(resolvedHsid);

  const ROOT_DOMAIN = 'yatstats.com';
  const subdomainPart = host === ROOT_DOMAIN ? '' : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split('.')[0] || hsid || 'unknown';

  const schoolData = {
    hsid: resolvedHsid,
    hsName: schoolName,
    hsLocation: location,
    crestUrl,
    primaryColor: String(school.primary_color || '#000000'),
    secondaryColor: String(school.secondary_color || '#FFFFFF'),
  };

  return (
    <SchoolContextProvider schoolData={schoolData}>
      <YatStyles />

      {/* STRICT 6-ROW GRID SHELL */}
      <div className="yat-shell-grid">
        {/* <!-- ROW 1 --> Global Top Bar */}
        <header id="site-header" className="yat-global-topbar">
          <GlobalTopbar />
        </header>

        {/* <!-- ROW 2 --> School Context Row */}
        <section className="yat-school-context">
          <SchoolContextBar />
        </section>

        {/* <!-- ROW 3 --> Interaction / Picture Strip — its OWN dedicated row */}
        <section className="yat-interaction-strip">
          <InteractionStrip />
        </section>

        {/* <!-- ROW 4 --> Metadata Row */}
        <section className="yat-metadata-row">
          <MetadataRow />
        </section>

        {/* <!-- ROW 5 --> Main Page Content */}
        <main className="yat-main-content">
          {children}
        </main>
      </div>

      {/* Shared Drawers & Modals */}
      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount">
          <i className="ri-close-line" />
        </button>
        <h3>ACCOUNT</h3>
        <AccountDrawerContent subdomain={subdomain} />
      </aside>

      <aside className="yat-drawer yat-drawer-right" id="drawerFilters">
        <button className="yat-icon-btn yat-close-btn" id="closeFilters">
          <i className="ri-close-line" />
        </button>
        <h3>FILTERS</h3>
        <div className="yat-drawer-content" id="filters">
          {/* filters content stays the same */}
        </div>
      </aside>

      <GlobalSearchModal />
      <div id="drawerMask" className="yat-drawer-mask" />

      {/* Article detail overlay */}
      <div className="yat-article-overlay" id="articleOverlay" />

      {/* <!-- ROW 6 --> Footer */}
      <footer className="yat-footer">
        <a href="https://www.armsreachdigital.com/" target="_blank" rel="noopener noreferrer">
          <span className="sponsor-text">Powered By</span>
          <span className="sponsor-name">ARMS REACH</span>
        </a>
      </footer>

      <YatInteractivity resolvedHsid={resolvedHsid} firebaseConfigJSON={getFirebaseConfigJSON()} />
    </SchoolContextProvider>
  );
}
