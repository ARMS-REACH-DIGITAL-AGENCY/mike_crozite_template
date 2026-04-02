// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite — Gallery Page (Row 5 content only)
// The shared shell (Rows 1-4, drawers, styles, scripts) is provided by [hsid]/layout.tsx.
// This page ONLY renders the gallery content that goes inside {children}.

import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { gradClass, formatSchoolName, type NavItem } from "@/lib/playerUtils";

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

const [allTimeRoster, flipFrontStageRows] = await Promise.all([
  getAllTimeRosterByHsid(resolvedHsid),
  getFlipCardFrontStageByHsid(resolvedHsid),
]);

// Level sort rank — higher level = lower number = appears first
const LEVEL_RANK: Record<string, number> = {
  'MLB': 1, 'TRIPLE-A': 2, 'DOUBLE-A': 3, 'HIGH-A': 4, 'LOW-A': 5,
  'ROOKIE': 6, 'INDY': 7, "INT'L": 8,
  'NCAA-D1': 9, 'NCAA-D2': 10, 'NCAA-D3': 11, 'NAIA': 12, 'JUCO': 13,
  'HIGH SCHOOL': 14,
};

function sortPlayers(players: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...players].sort((a, b) => {
    // 1. Level (high → low)
    const la = LEVEL_RANK[String(a.level_label || '')] ?? 99;
    const lb = LEVEL_RANK[String(b.level_label || '')] ?? 99;
    if (la !== lb) return la - lb;
    // 2. Grad class (oldest first — lower number first)
    const ga = parseInt(String(a.class_of || '9999'), 10);
    const gb = parseInt(String(b.class_of || '9999'), 10);
    if (ga !== gb) return ga - gb;
    // 3. Roster years count (most first)
    const ra = Array.isArray(a.roster_years) ? a.roster_years.length : 0;
    const rb = Array.isArray(b.roster_years) ? b.roster_years.length : 0;
    if (ra !== rb) return rb - ra;
    // 4. Last name A→Z
    return String(a.last_name || '').localeCompare(String(b.last_name || ''));
  });
}

// Active section: render directly from flip_card_front_stage (ACTIVE only)
// This includes YAT?STATS temp players who have no TBC record
const activeFrontRoster = sortPlayers(
  (flipFrontStageRows as Record<string, unknown>[]).filter(
    (p) => String(p.status_label || '').toUpperCase() === 'ACTIVE'
  )
);

// Batch-fetch images for all players
const allRosterIds = Array.from(
  new Set(
    [
      ...activeFrontRoster,
      ...(allTimeRoster as Record<string, unknown>[]),
    ].map((p) => String(p.playerid))
  )
);

const [frontImageMap, headshotMap] = await Promise.all([
  getBatchDesignatedPlayerImages(allRosterIds, "YATSTATS_FRONT"),
  getBatchDesignatedPlayerImages(allRosterIds, "HEADSHOT"),
]);

const flipFrontStageMap = new Map(
  (flipFrontStageRows as Record<string, unknown>[]).map((row) => [
    String(row.playerid),
    row,
  ])
);

const allTimeFrontRoster = (allTimeRoster as Record<string, unknown>[]).map((p) => ({
  ...p,
  ...(flipFrontStageMap.get(String(p.playerid)) || {}),
}));

  return (
    <>
      {/* ACTIVE ALUMNI — Row 5 content */}
      <section id="sec-active" className="yat-section visible">
        <div className="yat-grid" id="active-grid">
          {activeFrontRoster.length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No active players found</div>
              <div className="yat-empty-sub">Check back once the 2026 season begins</div>
            </div>
          ) : activeFrontRoster.map((p) => (
  <PlayerCard
    key={String(p.playerid)}
    player={p}
    resolvedHsid={resolvedHsid}
    frontImageUrl={frontImageMap.get(String(p.playerid))?.image_url ?? null}
    headshotUrl={headshotMap.get(String(p.playerid))?.image_url ?? null}
  />
))}
        </div>
      </section>

      {/* ALL-TIME LIST */}
      <section id="sec-alltime" className="yat-section visible">
        <div className="yat-grid" id="alltime-grid">
          {(allTimeRoster as Record<string, unknown>[]).length === 0 ? (
            <div className="yat-empty">
              <div className="yat-empty-icon">⚾</div>
              <div className="yat-empty-title">No alumni found</div>
              <div className="yat-empty-sub">Check back as we continue building the database</div>
            </div>
          ) : allTimeFrontRoster.map((p) => (
            <PlayerCard
              key={String(p.playerid)}
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
      <section id="sec-news" className="yat-section visible">
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
      <section id="sec-current" className="yat-section visible">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏟️</div>
          <div className="yat-placeholder-title">Current Team Roster</div>
          <div className="yat-placeholder-body">
            The current {schoolName} varsity roster will appear here once the season begins.
          </div>
        </div>
      </section>
     
      {/* FANTASY BRACKET */}
      <section id="sec-fantasy" className="yat-section visible">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🏆</div>
          <div className="yat-placeholder-title">Fantasy Bracket Tournament</div>
          <div className="yat-placeholder-body">
            School-vs-school bracket gameplay and alumni performance tournament experience. Coming soon.
          </div>
        </div>
      </section>

      {/* MENTOR */}
      <section id="sec-mentor" className="yat-section visible">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">🤝</div>
          <div className="yat-placeholder-title">Mentorship Marketplace</div>
          <div className="yat-placeholder-body">
            Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.
          </div>
        </div>
      </section>

      {/* PARTNER */}
      <section id="sec-partner" className="yat-section visible">
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
      <section id="sec-about" className="yat-section visible">
        <div className="yat-placeholder">
          <div className="yat-placeholder-icon">ℹ️</div>
          <div className="yat-placeholder-title">About YAT?STATS</div>
          <div className="yat-placeholder-body">
            YAT?STATS helps schools, families, fans, and sponsors follow where players go after high school and celebrate their next-level journeys.
          </div>
        </div>
      </section>
      
      {/* FAQ */}
      <section id="sec-faq" className="yat-section visible">
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
