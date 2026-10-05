// src/app/[hsid]/connect-contribute/page.tsx
// Connect & Contribute Portal — renders ONLY the gallery content inside {children}.
// The shared shell (header, logo, headshot strip, drawers, styles) comes from [hsid]/layout.tsx.
// This page shows the same first 3 flip cards as the homepage gallery, plus the
// upload drawer trigger. Build 2: all drawer components present.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getSchoolByUrl,
  getActiveRosterByHsid,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { isNeverASchoolSegment } from "@/lib/schoolSegment";
import { isRetiredAtHighSchoolLevel, sortActivePlayers } from "@/lib/playerUtils";
import PlayerCard from "@/components/yatstats/PlayerCard";
import ConnectContributeLauncher from "@/components/yatstats/ConnectContributeLauncher";

export const runtime = "nodejs";

type Row = Record<string, unknown>;
type ImageMap = Map<string, { image_url?: string | null }>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function emptyImageMap(): ImageMap {
  return new Map<string, { image_url?: string | null }>();
}

async function resolveSchool(hsid: string, host: string): Promise<Row | null> {
  try {
    const isNumericHsid = /^\d+$/.test(hsid);
    const requestedSchool = isNumericHsid ? await getSchoolByHsid(hsid) : null;
    const hostSchool = host ? await getSchoolByUrl(`https://${host}`) : null;
    if (requestedSchool && (!hostSchool || String(requestedSchool.hsid) !== String(hostSchool.hsid))) {
      return requestedSchool as Row;
    }
    if (hostSchool) return hostSchool as Row;
    if (requestedSchool) return requestedSchool as Row;
    return (await getSchoolByHsid(hsid)) as Row | null;
  } catch (error) {
    console.error("school lookup failed", { hsid, host, error });
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string }>;
}): Promise<Metadata> {
  const { hsid } = await params;
  return {
    title: "Connect & Contribute Portal | YAT?STATS",
    description:
      "Share photos, memories and news tips about your school's alumni, request a personalized message from a player, and support a player or the school.",
  };
}

export default async function ConnectContributePage({
  params,
}: {
  params: Promise<{ hsid: string }>;
}) {
  const { hsid } = await params;
  if (isNeverASchoolSegment(hsid)) notFound();
  const headersList = await headers();
  const host = headersList.get("host") || "";

  const school = await resolveSchool(hsid, host);
  if (!school) notFound();

  const resolvedHsid = String(school.hsid ?? hsid);
  const shareBaseUrl = getCanonicalBaseUrl(school, resolvedHsid);
  const shareSchoolName = String(school.hsname || "");
  const shareSchoolLocation = String(school.hslocation || "");

  const [activeRosterResult, flipFrontStageResult] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid).catch((error) => {
      console.error("getActiveRosterByHsid failed", { resolvedHsid, error });
      return [];
    }),
    getFlipCardFrontStageByHsid(resolvedHsid).catch((error) => {
      console.error("getFlipCardFrontStageByHsid failed", { resolvedHsid, error });
      return [];
    }),
  ]);

  const activeRosterRows = asRows(activeRosterResult);
  const stageRows = asRows(flipFrontStageResult).filter((p) => !isRetiredAtHighSchoolLevel(p));
  const stageMap = new Map(stageRows.map((p) => [String(p.playerid), p]));

  const activeMerged: Row[] = [];
  const seenIds = new Set<string>();
  for (const p of activeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    activeMerged.push(stageRow ? { ...stageRow, ...p } : { ...p });
    seenIds.add(id);
  }
  for (const p of stageRows) {
    const id = String(p.playerid);
    if (!seenIds.has(id) && String(p.status_label || "").toUpperCase() === "ACTIVE") {
      activeMerged.push({ ...p });
    }
  }

  const threePlayers = sortActivePlayers(activeMerged).slice(0, 3);
  const playerIds = threePlayers.map((p) => String(p.playerid));

  const [frontImageMap, headshotMap] = await Promise.all([
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "YATSTATS_FRONT").catch(() => emptyImageMap())
      : Promise.resolve(emptyImageMap()),
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "HEADSHOT").catch(() => emptyImageMap())
      : Promise.resolve(emptyImageMap()),
  ]);

  return (
    <>
      <section id="sec-connect-gallery" className="yat-section visible">
        <div className="yat-grid" id="connect-grid">
          {threePlayers.map((p) => {
            const playerId = String(p.playerid);
            return (
              <div
                key={`connect-wrap-${playerId}`}
                data-player-card-wrap="true"
                data-playerid={playerId}
              >
                <PlayerCard
                  key={`connect-${playerId}`}
                  player={p}
                  resolvedHsid={resolvedHsid}
                  frontImageUrl={frontImageMap.get(playerId)?.image_url ?? null}
                  headshotUrl={headshotMap.get(playerId)?.image_url ?? null}
                  shareBaseUrl={shareBaseUrl}
                  schoolName={shareSchoolName}
                  schoolLocation={shareSchoolLocation}
                />
              </div>
            );
            );
          })}
        </div>
      </section>
      <ConnectContributeLauncher hsid={resolvedHsid} />
    </>
  );
}
