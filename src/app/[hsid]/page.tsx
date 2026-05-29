// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite — Gallery Page (Row 5 content only)
// The shared shell (Rows 1-4, drawers, styles, scripts) is provided by [hsid]/layout.tsx.
// This page ONLY renders the gallery content that goes inside {children}.

import type { Metadata } from "next";
import { permanentRedirect, redirect, notFound } from "next/navigation";
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
import { formatSchoolName, sortActivePlayers, sortAllTimePlayers } from "@/lib/playerUtils";

import PlayerCard from "@/components/yatstats/PlayerCard";

export const runtime = "nodejs";

type Row = Record<string, unknown>;
type ImageMap = Map<string, { image_url?: string | null }>;

type TributeStatOverride = {
  targetHsid: string;
  targetPlayerId: string;
  sourceHsid: string;
  sourcePlayerId: string;
  note: string;
};

const TRIBUTE_STAT_OVERRIDES: TributeStatOverride[] = [
  {
    targetHsid: "12720",
    targetPlayerId: "YAT210000",
    sourceHsid: "5004",
    sourcePlayerId: "317316",
    note: "Tribute stat override: Nate Rogalski card displays Roch Cholowsky 2026 stats in honor of Nate.",
  },
];

const PRESERVE_TARGET_FIELDS = [
  "playerid",
  "hsid",
  "display_name",
  "firstname",
  "lastname",
  "first_name",
  "last_name",
  "slug",
  "class_of",
  "roster_years",
  "status_label",
  "display_status_label",
  "level_label",
  "display_level_label",
  "current_team_name",
  "current_org_or_conference_name",
  "current_teamid",
  "current_level_label",
  "current_team_level",
  "position",
  "height",
  "weight",
  "bats",
  "throws",
  "birthdate",
  "born_date",
  "birthplace",
  "place",
  "high_school",
];

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function emptyImageMap(): ImageMap {
  return new Map<string, { image_url?: string | null }>();
}

function hasReal2026Stats(p: Row): boolean {
  const statKeys = [
    "avg", "obp", "slg", "ops", "hr", "rbi", "h", "ab", "r", "sb", "bb",
    "era", "whip", "ip", "w", "l", "ko", "so9", "so_bb", "h9", "bb9", "saves", "pg",
  ];

  return statKeys.some((key) => {
    const value = p[key];
    if (value === null || value === undefined) return false;
    const text = String(value).trim();
    return text !== "" && text !== "--";
  });
}

function isHighSchoolPlayer(p: Row | undefined): boolean {
  if (!p) return false;

  const candidates = [
    p.level_label,
    p.display_level_label,
    p.level,
    p.highlevel,
    p.current_level,
    p.current_level_label,
  ];

  return candidates.some((value) => {
    const label = String(value || "").trim().toUpperCase();
    return label === "HIGH SCHOOL" || label === "HS";
  });
}

function getTributeOverride(resolvedHsid: string, playerId: string): TributeStatOverride | null {
  return TRIBUTE_STAT_OVERRIDES.find(
    (override) => override.targetHsid === resolvedHsid && override.targetPlayerId === playerId
  ) || null;
}

function applyTributeStatOverride(targetPlayer: Row, sourceStats: Row, override: TributeStatOverride): Row {
  const preserved = new Map<string, unknown>();
  for (const key of PRESERVE_TARGET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(targetPlayer, key)) preserved.set(key, targetPlayer[key]);
  }

  const merged: Row = {
    ...targetPlayer,
    ...sourceStats,
    has_2026_stats: true,
    tribute_stats_source_playerid: override.sourcePlayerId,
    tribute_stats_source_hsid: override.sourceHsid,
    tribute_stats_note: override.note,
  };

  for (const [key, value] of preserved.entries()) merged[key] = value;

  merged.playerid = targetPlayer.playerid;
  merged.hsid = targetPlayer.hsid;
  merged.has_2026_stats = true;
  return merged;
}

function addQueryValue(qs: URLSearchParams, key: string, value: unknown) {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  qs.set(key, text);
}

function buildSchoolNotLiveHref(school: Row, resolvedHsid: string, schoolState: "potential" | "inactive") {
  const qs = new URLSearchParams();
  const location = String(school.hslocation || "").trim();
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts.slice(0, -1).join(", ") : parts[0] || "";
  const state = parts.length > 1 ? parts[parts.length - 1] : "";
  const draftedHs = school.drafted_hs;
  const drafted = school.drafted;

  addQueryValue(qs, "school", school.hsname);
  addQueryValue(qs, "city", city);
  addQueryValue(qs, "state", state);
  addQueryValue(qs, "reason", schoolState);
  addQueryValue(qs, "hsid", school.hsid || resolvedHsid);
  addQueryValue(qs, "active", school.current_aa);
  addQueryValue(qs, "mlb", school.mlb);
  addQueryValue(qs, "natRank", school.yatstats_national_rank);
  addQueryValue(qs, "stateRank", school.yatstats_state_rank);
  addQueryValue(qs, "allTime", school.atnla);

  if ((draftedHs !== null && draftedHs !== undefined) || (drafted !== null && drafted !== undefined)) {
    qs.set("draftedRatio", `${draftedHs ?? 0}/${drafted ?? 0}`);
  }

  return `/school-not-live?${qs.toString()}`;
}

async function resolveSchool(hsid: string, host: string): Promise<Row | null> {
  try {
    const hostSchool = host ? await getSchoolByUrl(`https://${host}`) : null;
    if (hostSchool) return hostSchool as Row;
    return (await getSchoolByHsid(hsid)) as Row | null;
  } catch (error) {
    console.error("school lookup failed", { hsid, host, error });
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const school = await resolveSchool(hsid, host);

  const name = String(school?.hsname || "Your School");
  const loc = String(school?.hslocation || "");
  const locParts = loc.split(",").map((s) => s.trim());
  const stateAbbr = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase() : "";
  const titleParts = [name.toUpperCase(), stateAbbr, "YAT?STATS - Where They YAT?"].filter(Boolean);
  const schoolHsid = String(school?.hsid || hsid);
  const crestUrl = getSchoolCrestUrl(schoolHsid);
  const canonicalUrl = getCanonicalBaseUrl(school, schoolHsid);

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

function Placeholder({ icon, title, body }: { icon: string; title: string; body: React.ReactNode }) {
  return (
    <div className="yat-placeholder">
      <div className="yat-placeholder-icon">{icon}</div>
      <div className="yat-placeholder-title">{title}</div>
      <div className="yat-placeholder-body">{body}</div>
    </div>
  );
}

function EmptyGrid({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="yat-empty">
      <div className="yat-empty-icon">{icon}</div>
      <div className="yat-empty-title">{title}</div>
      <div className="yat-empty-sub">{sub}</div>
    </div>
  );
}

export default async function SchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ hsid: string }>;
  searchParams: Promise<{ schoolState?: string }>;
}) {
  const { hsid } = await params;
  const qp = await searchParams;
  const headersList = await headers();
  const host = headersList.get("host") || "";

  const school = await resolveSchool(hsid, host);
  if (!school) notFound();

  const micrositeUrl = school.microsite_url as string | undefined;
  const isNumericHsid = /^\d+$/.test(hsid);
  const isPreview = host.includes("vercel.app") || host.includes("localhost");
  if (micrositeUrl && isNumericHsid && !isPreview) {
    permanentRedirect(micrositeUrl.replace(/\/$/, ""));
  }

  const resolvedHsid = String(school.hsid ?? hsid);
  const schoolName = formatSchoolName(String(school.hsname || ""));
  const schoolState =
    qp.schoolState === "inactive"
      ? "inactive"
      : qp.schoolState === "potential"
        ? "potential"
        : null;
  const isFallbackSchoolState = schoolState === "potential" || schoolState === "inactive";

  if (isFallbackSchoolState) {
    redirect(buildSchoolNotLiveHref(school, resolvedHsid, schoolState));
  }

  const tributeSourceHsids = Array.from(new Set(
    TRIBUTE_STAT_OVERRIDES
      .filter((override) => override.targetHsid === resolvedHsid)
      .map((override) => override.sourceHsid)
  ));

  const [activeRosterResult, allTimeRosterResult, flipFrontStageResult, tributeSourceRosterResults] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid).catch((error) => {
      console.error("getActiveRosterByHsid failed", { resolvedHsid, error });
      return [];
    }),
    getAllTimeRosterByHsid(resolvedHsid).catch((error) => {
      console.error("getAllTimeRosterByHsid failed", { resolvedHsid, error });
      return [];
    }),
    getFlipCardFrontStageByHsid(resolvedHsid).catch((error) => {
      console.error("getFlipCardFrontStageByHsid failed", { resolvedHsid, error });
      return [];
    }),
    Promise.all(
      tributeSourceHsids.map((sourceHsid) =>
        getActiveRosterByHsid(sourceHsid).catch((error) => {
          console.error("getActiveRosterByHsid failed for tribute source", { sourceHsid, error });
          return [];
        })
      )
    ),
  ]);

  const activeRosterRows = asRows(activeRosterResult);
  const allTimeRosterRows = asRows(allTimeRosterResult);
  const stageRows = asRows(flipFrontStageResult);
  const tributeSourceRows = tributeSourceRosterResults.flatMap((rows) => asRows(rows));

  const currentTeamRoster = sortActivePlayers(stageRows.filter(isHighSchoolPlayer).map((p) => ({ ...p })));
  const stageMap = new Map(stageRows.map((p) => [String(p.playerid), p]));

  const activeSeenIds = new Set<string>();
  const activeMerged: Row[] = [];
  for (const p of activeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    const mergedRow = stageRow ? { ...stageRow, ...p } : { ...p };
    if (isHighSchoolPlayer(mergedRow)) continue;
    activeMerged.push(mergedRow);
    activeSeenIds.add(id);
  }

  for (const p of stageRows) {
    const id = String(p.playerid);
    if (!activeSeenIds.has(id) && String(p.status_label || "").toUpperCase() === "ACTIVE" && !isHighSchoolPlayer(p)) {
      activeMerged.push({ ...p });
    }
  }

  const allTimeSeenIds = new Set<string>();
  const allTimeMerged: Row[] = [];
  for (const p of allTimeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    const mergedRow = stageRow ? { ...stageRow, ...p } : { ...p };
    if (isHighSchoolPlayer(mergedRow)) continue;
    allTimeMerged.push(mergedRow);
    allTimeSeenIds.add(id);
  }

  for (const p of stageRows) {
    const id = String(p.playerid);
    if (!allTimeSeenIds.has(id) && !isHighSchoolPlayer(p)) {
      allTimeMerged.push({ ...p });
    }
  }

  const allTimeFrontRoster = sortAllTimePlayers(allTimeMerged);
  const activeStatsMap = new Map(
    [...activeMerged, ...tributeSourceRows]
      .filter(hasReal2026Stats)
      .map((p) => [String(p.playerid), p])
  );

  const activeDisplayRoster = allTimeMerged.map((p) => {
    const id = String(p.playerid);
    const tributeOverride = getTributeOverride(resolvedHsid, id);
    const tributeStatsRow = tributeOverride ? activeStatsMap.get(tributeOverride.sourcePlayerId) : null;

    if (tributeOverride && tributeStatsRow) {
      return applyTributeStatOverride(p, tributeStatsRow, tributeOverride);
    }

    const activeStatsRow = activeStatsMap.get(id);
    return activeStatsRow ? { ...p, ...activeStatsRow, has_2026_stats: true } : { ...p, has_2026_stats: false };
  });

  const activeSortedRoster = sortActivePlayers(activeDisplayRoster);
  const allRosterIds = Array.from(new Set([
    ...allTimeMerged.map((p) => String(p.playerid)),
    ...currentTeamRoster.map((p) => String(p.playerid)),
  ])).filter(Boolean);

  const [frontImageMap, headshotMap] = await Promise.all([
    allRosterIds.length
      ? getBatchDesignatedPlayerImages(allRosterIds, "YATSTATS_FRONT").catch((error) => {
          console.error("getBatchDesignatedPlayerImages failed", { resolvedHsid, imageType: "YATSTATS_FRONT", error });
          return emptyImageMap();
        })
      : Promise.resolve(emptyImageMap()),
    allRosterIds.length
      ? getBatchDesignatedPlayerImages(allRosterIds, "HEADSHOT").catch((error) => {
          console.error("getBatchDesignatedPlayerImages failed", { resolvedHsid, imageType: "HEADSHOT", error });
          return emptyImageMap();
        })
      : Promise.resolve(emptyImageMap()),
  ]);

  return (
    <>
      <section id="sec-active" className="yat-section visible">
        <div className="yat-grid" id="active-grid">
          {activeSortedRoster.length === 0 ? (
            <EmptyGrid icon="⚾" title="No players found" sub="Check back as we continue building the database" />
          ) : (
            activeSortedRoster.map((p) => {
              const status = String(p.status_label || p.status || '').toUpperCase().trim();
              const isRetired = status === 'RETIRED';
              const playerId = String(p.playerid);

              return (
                <div
                  key={`active-wrap-${playerId}`}
                  data-player-card-wrap="true"
                  data-playerid={playerId}
                  data-default-hidden={isRetired ? 'retired' : undefined}
                  style={{ display: isRetired ? 'none' : undefined }}
                >
                  <PlayerCard
                    key={`active-${playerId}`}
                    player={p}
                    resolvedHsid={resolvedHsid}
                    frontImageUrl={frontImageMap.get(playerId)?.image_url ?? null}
                    headshotUrl={headshotMap.get(playerId)?.image_url ?? null}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      <section id="sec-alltime" className="yat-section">
        <div className="yat-grid" id="alltime-grid">
          {allTimeFrontRoster.length === 0 ? (
            <EmptyGrid icon="⚾" title="No alumni found" sub="Check back as we continue building the database" />
          ) : (
            allTimeFrontRoster.map((p) => {
              const playerId = String(p.playerid);
              return (
                <PlayerCard
                  key={`alltime-${playerId}`}
                  player={p}
                  resolvedHsid={resolvedHsid}
                  frontImageUrl={frontImageMap.get(playerId)?.image_url ?? null}
                  headshotUrl={headshotMap.get(playerId)?.image_url ?? null}
                  isAllTime
                />
              );
            })
          )}
        </div>
      </section>

      <section id="sec-news" className="yat-section">
        <div className="yat-news-wrap">
          <div className="yat-news-header"><div /></div>
          <div className="yat-grid" id="news-grid">
            <div className="yat-news-loading">
              <div className="yat-news-loading-spinner" />
              <div className="yat-news-loading-text">LOADING ALUMNI NEWS&hellip;</div>
            </div>
          </div>
        </div>
      </section>

      <section id="sec-current" className="yat-section">
        <div className="yat-grid" id="current-grid">
          {currentTeamRoster.length === 0 ? (
            <EmptyGrid icon="🏟️" title="Current Team Roster" sub={`The current ${schoolName} varsity roster will appear here once the season begins.`} />
          ) : (
            currentTeamRoster.map((p) => {
              const playerId = String(p.playerid);
              return (
                <PlayerCard
                  key={`current-${playerId}`}
                  player={p}
                  resolvedHsid={resolvedHsid}
                  frontImageUrl={frontImageMap.get(playerId)?.image_url ?? null}
                  headshotUrl={headshotMap.get(playerId)?.image_url ?? null}
                />
              );
            })
          )}
        </div>
      </section>

      <section id="sec-fantasy" className="yat-section">
        <Placeholder icon="🏆" title="Fantasy Bracket Tournament" body="School-vs-school bracket gameplay and alumni performance tournament experience. Coming soon." />
      </section>

      <section id="sec-mentor" className="yat-section">
        <Placeholder icon="🤝" title="Mentorship Marketplace" body={`Connect with ${schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.`} />
      </section>

      <section id="sec-partner" className="yat-section">
        <Placeholder
          icon="🤝"
          title="PCD Action Partner Program"
          body={
            <>
              Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
              <br /><br />
              <a
                href="mailto:pete@yatstats.com"
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
            </>
          }
        />
      </section>

      <section id="sec-about" className="yat-section">
        <Placeholder icon="ℹ️" title="About YAT?STATS" body="YAT?STATS helps schools, families, fans, and sponsors follow where players go after high school and celebrate their next-level journeys." />
      </section>

      <section id="sec-faq" className="yat-section">
        <Placeholder icon="❓" title="FAQ&apos;s" body="Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon." />
      </section>
    </>
  );
}
