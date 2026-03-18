// src/app/[hsid]/layout.tsx
// SHARED SHELL — Rows 1-3 global, player profile now lives inside as {children}
// Search icon moved to Row 2 right side (next to logo) exactly as you asked
// Bottom tabs slot added for player profile only

import { ReactNode } from 'react';
import SchoolContextBar from '@/components/SchoolContextBar'; // create this tiny file next if it doesn't exist
import GlobalSearchModal from '@/components/GlobalSearchModal';
import AccountDrawer from '@/components/AccountDrawer';
import Footer from '@/components/Footer';
import YatInteractivity from '@/components/YatInteractivity';

export default async function HsidLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { hsid: string };
}) {
  const school = await fetchSchoolData(params.hsid); // your existing helper

  return (
    <>
      {/* ROW 1 — GLOBAL TOPBAR (sticky) */}
      <header className="sticky top-0 z-50 bg-black border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button id="nav-menu-btn" className="yat-icon-btn text-2xl">☰</button>
            <button id="account-btn" className="yat-icon-btn text-2xl">👤</button>
            <button id="theme-toggle" className="yat-icon-btn text-2xl">🌙</button>
          </div>
          <div className="text-3xl font-black tracking-tighter">YAT?STATS</div>
        </div>
      </header>

      {/* ROW 2 — SCHOOL CONTEXT BAR (sticky) with Search on the right */}
      <SchoolContextBar school={school} />

      {/* ROW 3 — INTERACTION STRIP (sticky) */}
      <div id="interaction-strip" className="sticky top-[108px] z-40 bg-black border-b border-white/10 overflow-x-auto">
        <div id="yatSectionLabel" className="px-4 py-3" />
      </div>

      {/* PAGE CONTENT */}
      <main className="min-h-[calc(100vh-220px)] pb-20">
        {children}
      </main>

      {/* BOTTOM TABS CONTAINER (only shows on player profile) */}
      <div id="bottom-tabs-container" />

      {/* GLOBAL OVERLAYS */}
      <AccountDrawer />
      <GlobalSearchModal />

      {/* FOOTER */}
      <Footer />

      {/* SINGLE INTERACTIVITY SCRIPT (runs once) */}
      <YatInteractivity />
    </>
  );
}
