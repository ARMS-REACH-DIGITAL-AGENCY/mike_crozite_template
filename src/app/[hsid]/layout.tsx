// src/app/[hsid]/layout.tsx
// FINAL FIXED VERSION — builds on Next.js 16
// params is now a Promise (required in your version)
// Search icon is in Row 2 right side
// Bottom tabs slot ready

import { ReactNode } from 'react';

export default async function HsidLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;

  // Temporary placeholder school data
  const school = { name: 'Hamilton High School', cityState: 'Chandler, AZ' };

  return (
    <>
      {/* ROW 1 — GLOBAL TOPBAR (sticky) */}
      <header className="sticky top-0 z-50 bg-black border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button id="nav-menu-btn" className="text-3xl">☰</button>
            <button id="account-btn" className="text-3xl">👤</button>
            <button id="theme-toggle" className="text-3xl">🌙</button>
          </div>
          <div className="text-3xl font-black tracking-tighter">YAT?STATS</div>
        </div>
      </header>

      {/* ROW 2 — SCHOOL CONTEXT BAR (sticky) — SEARCH ON RIGHT */}
      <div className="sticky top-[60px] z-50 bg-black border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <div className="text-lg font-semibold">{school.name}</div>
            <div className="text-sm text-white/70">{school.cityState}</div>
          </div>
          <button id="global-search-btn" className="text-3xl">🔍</button>
        </div>
      </div>

      {/* ROW 3 — INTERACTION STRIP (sticky) */}
      <div id="interaction-strip" className="sticky top-[108px] z-40 bg-black border-b border-white/10 px-4 py-3 overflow-x-auto">
        <div id="yatSectionLabel" className="text-lg font-medium">Page label goes here</div>
      </div>

      {/* PAGE CONTENT */}
      <main className="min-h-screen pb-20">
        {children}
      </main>

      {/* BOTTOM TABS CONTAINER (for player profile) */}
      <div id="bottom-tabs-container" className="fixed bottom-0 left-0 right-0 z-50 hidden bg-black border-t border-white/10" />

      {/* FOOTER */}
      <footer className="bg-black py-8 text-center text-sm text-white/50">
        © 2026 YAT?STATS • Presented by American Solutions for Business
      </footer>
    </>
  );
}
