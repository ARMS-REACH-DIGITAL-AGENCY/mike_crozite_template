// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite — Gallery Page (Row 5 content only)
// The shared shell (Rows 1-4, drawers, styles, scripts) is provided by [hsid]/layout.tsx.
// This page ONLY renders the gallery content that goes inside {children}.

import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { formatSchoolName, sortActivePlayers, sortAllTimePlayers, type NavItem } from "@/lib/playerUtils";

import PlayerCard from "@/components/yatstats/PlayerCard";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const hostSchool = host ? await getSchoolByUrl(`https://${host}`) : null;
  const school = hostSchool || await getSchoolByHsid(hsid);
  const name = (school as Record<string, unknown>)?.hsname as string || "Your School";
  const loc = (school as Record<string, unknown>)?.hslocation as string || "";
  const locParts = loc.split(",").map((s: string) => s.trim());
  const stateAbbr = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase() : "";
  const titleParts = [name.toUpperCase(), stateAbbr, "YAT?STATS - Where They YAT?"].filter(Boolean);
  const schoolHsid = (school as Record<string, unknown>)?.hsid as string || hsid;
  const crestUrl = getSchoolCrestUrl(schoolHsid);
  const canonicalUrl = getCanonicalBaseUrl(school as Record<string, unknown> | null, schoolHsid);
  return {
    title: titleParts.join(" | "),
    description: `Track active and all-time baseball alumni from ${name} (${loc}).`,
    alternates: { canonical: canonicalUrl },
    icons: {
      icon: [
        { url: crestUrl, type: "image/png" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ],
      apple: crestUrl,
    },
  };
}

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
  const schoolName = formatSchoolName(String(school.hsname || ""));

  const [activeRoster, allTimeRoster, flipFrontStageRows] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
    getFlipCardFrontStageByHsid(resolvedHsid),
  ]);

  // ---------------------------------------------------------------------------
  // Build union datasets — TBC rows + stage-only rows, merged by playerid.
  // Stage-only players (YAT00001–YAT00008 etc.) are included even with no TBC row.
  // Stage fields overlay TBC fields when both exist.
  // ---------------------------------------------------------------------------
  const stageMap = new Map(
    (flipFrontStageRows as Record<string, unknown>[]).map((p) => [String(p.playerid), p])
  );

  // activeFrontRoster: union of TBC active + stage-ACTIVE rows, merged by playerid.
  // TBC base first, stage overlay on top. Stage-only ACTIVE players included.
  const activeSeenIds = new Set<string>();
  const activeMerged: Record<string, unknown>[] = [];
  // TBC active rows, enriched with stage if present
  for (const p of activeRoster as Record<string, unknown>[]) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    activeMerged.push(stageRow ? { ...p, ...stageRow } : { ...p });
    activeSeenIds.add(id);
  }
  // Stage-only ACTIVE rows not already in TBC active
  for (const p of flipFrontStageRows as Record<string, unknown>[]) {
    const id = String(p.playerid);
    if (!activeSeenIds.has(id) && String(p.status_label || "").toUpperCase() === "ACTIVE") {
      activeMerged.push({ ...p });
    }
  }
 const activeFrontRoster = sortActivePlayers(allTimeMerged);
  // allTimeFrontRoster: union of TBC all-time + all stage rows, merged by playerid.
  // TBC base first, stage overlay on top. Stage-only players included.
  const allTimeSeenIds = new Set<string>();
  const allTimeMerged: Record<string, unknown>[] = [];
  // TBC all-time rows, enriched with stage if present
  for (const p of allTimeRoster as Record<string, unknown>[]) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    allTimeMerged.push(stageRow ? { ...p, ...stageRow } : { ...p });
    allTimeSeenIds.add(id);
  }
  // Stage-only rows not already in TBC all-time
  for (const p of flipFrontStageRows as Record<string, unknown>[]) {
    const id = String(p.playerid);
    if (!allTimeSeenIds.has(id)) {
      allTimeMerged.push({ ...p });
    }
  }
  const allTimeFrontRoster = sortAllTimePlayers(allTimeMerged);

  // Active section uses Active sort: Level → Grad Class → Roster Years → Last Name.
  // allTimeMerged is the full universe; we sort a copy so allTimeFrontRoster is unaffected.
  

  // ---------------------------------------------------------------------------
  // Batch-fetch images — include all IDs from the full universe.
  // ---------------------------------------------------------------------------
  const allRosterIds = Array.from(
    new Set(allTimeMerged.map((p) => String(p.playerid)))
  );

  const [frontImageMap, headshotMap] = await Promise.all([
    getBatchDesignatedPlayerImages(allRosterIds, "YATSTATS_FRONT"),
    getBatchDesignatedPlayerImages(allRosterIds, "HEADSHOT"),
  ]);

  return (
    <>
      {/* ACTIVE ALUMNI — Row 5 content */}
      {/* Full school universe rendered here. Default ACTIVE-only view is enforced */}
      {/* by JS filter initial state (resetFiltersForCurrentSection on load). */}
      {/* Active sort: Level → Grad Class → Roster Years → Last Name. */}
  <section id="sec-active" className="yat-section visible">
  {activeFrontRoster.length === 0 ? (
    <div className="yat-empty">
      <div className="yat-empty-title">No Active Players Found</div>
    </div>
  ) : (
    <div className="yat-grid">
      {activeFrontRoster.map((p) => (
        <PlayerCard
          key={`active-${String(p.playerid)}`}
          player={p}
          resolvedHsid={resolvedHsid}
          frontImageUrl={frontImageMap.get(String(p.playerid))?.image_url ?? null}
          headshotUrl={headshotMap.get(String(p.playerid))?.image_url ?? null}
        />
      ))}
    </div>
  )}

</section>

      {/* ALL-TIME LIST */}
      <section id="sec-alltime" className="yat-section">
        <div className="yat-grid" id="alltime-grid">
          {allTimeFrontRoster.length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No alumni found</div>
              <div className="yat-empty-sub">Check back as we continue building the database</div>
            </div>
          ) : allTimeFrontRoster.map((p) => (
            <PlayerCard
              key={`alltime-${String(p.playerid)}`}
              player={p}
              resolvedHsid={resolvedHsid}
              frontImageUrl={frontImageMap.get(String(p.playerid))?.image_url ?? null}
              headshotUrl={headshotMap.get(String(p.playerid))?.image_url ?? null}
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
              <div className="yat-news-sub">Latest news mentions for {schoolName} baseball alumni</div>
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

      {/* CURRENT TEAM */}
      <section id="sec-current" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏟️</div>
          <div className="yat-placeholder-title">Current Team Roster</div>
          <div className="yat-placeholder-body">
            The current {schoolName} varsity roster will appear here once the season begins.
          </div>
        </div>
      </section>
     
      {/* FANTASY BRACKET */}
      <section id="sec-fantasy" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏆</div>
          <div className="yat-placeholder-title">Fantasy Bracket Tournament</div>
          <div className="yat-placeholder-body">
            School-vs-school bracket gameplay and alumni performance tournament experience. Coming soon.
          </div>
        </div>
      </section>

      {/* MENTOR */}
      <section id="sec-mentor" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🤝</div>
          <div className="yat-placeholder-title">Mentorship Marketplace</div>
          <div className="yat-placeholder-body">
            Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.
          </div>
        </div>
      </section>

      {/* PARTNER */}
      <section id="sec-partner" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🤝</div>
          <div className="yat-placeholder-title">PCD Action Partner Program</div>
          <div className="yat-placeholder-body">
            Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
            <br /><br />
            <a
              href="mailto:sponsor@yatstats.com"
              style={{
                display: "inline-block",
                background: "#00e676",
                color: "#000",
                fontFamily: '"Bebas Neue",Oswald,sans-serif',
                fontSize: "14px",
                letterSpacing: ".1em",
                padding: "10px 24px",
                borderRadius: "4px",
              }}
            >
              Get In Touch
            </a>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="sec-about" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">ℹ️</div>
          <div className="yat-placeholder-title">About YAT?STATS</div>
          <div className="yat-placeholder-body">
            YAT?STATS helps schools, families, fans, and sponsors follow where players go after high school and celebrate their next-level journeys.
          </div>
        </div>
      </section>
      
      {/* FAQ */}
      <section id="sec-faq" className="yat-section">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">❓</div>
          <div className="yat-placeholder-title">FAQ&apos;s</div>
          <div className="yat-placeholder-body">
            Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon.
          </div>
        </div>
      </section>
    </>
  );
}
