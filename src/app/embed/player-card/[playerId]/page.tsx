// src/app/embed/player-card/[playerId]/page.tsx
// Server-renders one real <PlayerCard> for an arbitrary player, independent of
// which school subdomain is currently loaded. Not a page anyone navigates to -
// FavoritesDrawer.tsx fetches this route's HTML, pulls out the marked fragment,
// and injects it into a Super Fan's cross-school favorite gallery slot.
//
// This exists because PlayerCardBack renders PlayerSevenDaySnapshot, an async
// Server Component (queries the DB while rendering). Async components can only
// ever run on the server - rendering <PlayerCard> from client-side code (e.g.
// a React portal) throws "async Client Component" (React error #482) and takes
// the whole page down. Fetching this route's server-rendered HTML sidesteps
// that entirely: the same, unforked PlayerCard component renders the normal
// way, on the server, exactly like it already does on every native school page.
// When the game-log pipeline behind the 7-day snapshot gets real data, both
// native cards and these embedded ones pick it up automatically - same component.

import { notFound } from "next/navigation";
import {
  getFlipCardFrontStageByPlayerId,
  getActiveRosterRowByPlayerId,
  getBatchDesignatedPlayerImages,
  getSchoolByHsid,
} from "@/lib/db";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import PlayerCard from "@/components/yatstats/PlayerCard";

export const runtime = "nodejs";
export const metadata = { robots: { index: false, follow: false } };

export default async function PlayerCardEmbedPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const id = String(playerId || "").trim();
  if (!id) notFound();

  const stageRow = await getFlipCardFrontStageByPlayerId(id);
  if (!stageRow) notFound();

  const activeRow = await getActiveRosterRowByPlayerId(id);
  const player = activeRow
    ? { ...stageRow, ...activeRow, has_2026_stats: true }
    : { ...stageRow, has_2026_stats: false };

  const resolvedHsid = String(stageRow.hsid || "");

  // This route serves a player from a school OTHER than whichever
  // subdomain is fetching it (that's the entire point of Super Fan
  // cross-school favorites), so it needs its own school lookup - it can't
  // rely on the host it was fetched from the way the native school page
  // does. Same source (school_success) FunZone's Social tab share links
  // need to point at the real subdomain instead of a 404ing bare-domain URL.
  const [frontImageMap, headshotMap, school] = await Promise.all([
    getBatchDesignatedPlayerImages([id], "YATSTATS_FRONT"),
    getBatchDesignatedPlayerImages([id], "HEADSHOT"),
    getSchoolByHsid(resolvedHsid),
  ]);
  const shareBaseUrl = getCanonicalBaseUrl(school, resolvedHsid);
  const schoolName = school?.hsname ? String(school.hsname) : null;
  const schoolLocation = school?.hslocation ? String(school.hslocation) : null;

  return (
    <div data-card-embed-root="true">
      <PlayerCard
        player={player}
        resolvedHsid={resolvedHsid}
        frontImageUrl={frontImageMap.get(id)?.image_url ?? null}
        headshotUrl={headshotMap.get(id)?.image_url ?? null}
        shareBaseUrl={shareBaseUrl}
        schoolName={schoolName}
        schoolLocation={schoolLocation}
      />
    </div>
  );
}
