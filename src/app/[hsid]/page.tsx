// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite
// Minimal orchestration: fetch school + players, pass props to components.

import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
} from "@/lib/db";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import PlayerCard from "@/components/yatstats/PlayerCard";

export const runtime = "nodejs";

export default async function SchoolPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  
  let school: Record<string, unknown> | null = null;
  try {
    school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
    if (!school) school = await getSchoolByHsid(hsid) as Record<string, unknown> | null;
  } catch {
    notFound();
  }
  if (!school) notFound();

  // Redirect numeric hsid paths to the school's custom domain (skip on preview deployments)
  const micrositeUrl = (school as Record<string, unknown>).microsite_url as string | undefined;
  const isNumericHsid = /^\d+$/.test(hsid);
  const isPreview = host.includes("vercel.app") || host.includes("localhost");
  if (micrositeUrl && isNumericHsid && !isPreview) {
    permanentRedirect(micrositeUrl.replace(/\/$/, ""));
  }

  const resolvedHsid = String(school.hsid ?? hsid);
  const [activeRoster, allTimeRoster] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
  ]);

  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
  const photoDefaultUrl = `${canonicalBase}/assets/img/now_players/default.jpg`;

  return (
    <main id="main-content">
      {/* ACTIVE ALUMNI */}
      <section id="sec-active" className="yat-section visible">
        <div className="yat-grid" id="active-grid">
          {(activeRoster as Record<string, unknown>[]).length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No active players found</div>
              <div className="yat-empty-sub">Check back once the 2026 season begins</div>
            </div>
          ) : (activeRoster as Record<string, unknown>[]).map((p) => (
            <PlayerCard
              key={String(p.playerid)}
              player={p}
              resolvedHsid={resolvedHsid}
              photoDefaultUrl={photoDefaultUrl}
            />
          ))}
        </div>
      </section>

      {/* ALL-TIME LIST */}
      <section id="sec-alltime" className="yat-section">
        <div className="yat-grid" id="alltime-grid">
          {(allTimeRoster as Record<string, unknown>[]).length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No alumni found</div>
              <div className="yat-empty-sub">Check back as we continue building the database</div>
            </div>
          ) : (allTimeRoster as Record<string, unknown>[]).map((p) => (
            <PlayerCard
              key={String(p.playerid)}
              player={p}
              resolvedHsid={resolvedHsid}
              photoDefaultUrl={photoDefaultUrl}
              isAllTime
            />
          ))}
        </div>
      </section>

      {/* NEWS */}
      <section id="sec-news" className="yat-section">
        <div className="yat-news-wrap">
          <div className="yat-news-header">
            <div>
              <div className="yat-news-title">ACTIVE ALUMNI NEWS</div>
              <div className="yat-news-sub">Latest news mentions for alumni</div>
            </div>
          </div>
          <div className="yat-news-filters" id="newsFilters">
            <input id="newsFilterName" className="yat-news-filter-input" type="search" placeholder="Filter by player name…" />
            <span className="yat-news-filter-label">Level:</span>
            <div className="yat-news-filter-chips" id="newsFilterLevels" />
            <span className="yat-news-filter-label">Class:</span>
            <div className="yat-news-filter-chips" id="newsFilterGradClass" />
            <button id="newsFilterActive" className="yat-news-chip" type="button">Active Only</button>
            <button id="newsFilterReset" className="yat-news-filter-reset" type="button">Reset</button>
          </div>
          <div className="yat-news-grid" id="news-grid">
            <div className="yat-news-loading">
              <div className="yat-news-loading-spinner" />
              <div className="yat-news-loading-text">LOADING ALUMNI NEWS&hellip;</div>
            </div>
          </div>
        </div>
      </section>

      {/* Other sections omitted for brevity, they can be added back if needed */}
      <section id="sec-team" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏟️</div>
          <div className="yat-placeholder-title">Current Team Roster</div>
          <div className="yat-placeholder-body">The current varsity roster will appear here once the season begins.</div>
        </div>
      </section>
    </main>
  );
}
