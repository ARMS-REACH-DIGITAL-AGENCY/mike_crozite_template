// src/components/yatstats/PlayerCard.tsx
// Full flip card container: article element with front and back faces

import { levelLabel, gradClassInfo, varsityDots, normalizeOrg } from "@/lib/playerUtils";
import { toPlayerSlug } from "@/lib/slug";
import PlayerCardFront from "@/components/yatstats/PlayerCardFront";
import PlayerCardBack from "@/components/yatstats/PlayerCardBack";

interface PlayerCardProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /**
   * Explicitly designated YATSTATS_FRONT image URL (player_photos WHERE image_role='YATSTATS_FRONT').
   * Pass null when no designated row exists — front card falls back to legacy players/then/{imageId}.jpg,
   * then silhouette.
   */
  frontImageUrl?: string | null;
  /**
   * Explicitly designated HEADSHOT image URL (player_photos WHERE image_role='HEADSHOT').
   * Pass null when no designated HEADSHOT has been looked up — back card will show silhouette.
   * Do NOT pass the legacy players/now/{id}.jpg path here.
   */
  headshotUrl?: string | null;
  /** When true, applies all-time display differences (CAREER STATS label, etc.) */
  isAllTime?: boolean;
}

export default function PlayerCard({ player: p, resolvedHsid, frontImageUrl = null, headshotUrl = null, isAllTime }: PlayerCardProps) {
  // level_label comes from flip_card_front_stage (already normalized).
  // p.level comes from getActiveRosterByHsid (raw TBC value e.g. "JrCollege", "Indy").
  // levelLabel() maps raw TBC values to the canonical filter values ("JUCO", "INDY", etc.)
  // so data-level always matches the FiltersDrawer checkbox values for every school.
  const lvl = String(p.level_label || levelLabel(String(p.level || "")) || p.level || "");
  // gradClassInfo() returns { year, estimated }.
  // year: verified class_of from stage (human-set) OR estimated from first stat year - 1.
  // estimated: true when derived from TBC playyears, false when set by school/curator.
  // data-gradclass uses the bare year so the filter matches both verified and estimated.
  const { year: gc, estimated: gcEstimated } = gradClassInfo(p);
  const rosterYears = Array.isArray(p.roster_years) ? p.roster_years : varsityDots(p);
  const org = normalizeOrg(String(p.current_org_or_conference_name || ""));
  const status = String(
    p.status_label || (isAllTime ? (p.is_active_2025 ? "ACTIVE" : "RETIRED") : "ACTIVE")
  );
  const slug = toPlayerSlug(
    String(p.firstname || p.first_name || ""),
    String(p.lastname || p.last_name || "")
  );

  const playerWithSlug = { ...p, slug };

  return (
       <article
      id={`player-${String(p.playerid)}`}
      className="yat-card"
      data-name={`${String(p.firstname || p.first_name || "")} ${String(p.lastname || p.last_name || "")}`.toLowerCase()}
      data-playerid={String(p.playerid)}
      data-level={lvl}
      data-org={org}
      data-gradclass={gc}
      data-rosteryears={Array.isArray(rosterYears) ? rosterYears.join(",") : ""}
      data-status={status}
      data-slug={slug}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          <PlayerCardFront player={playerWithSlug} frontImageUrl={frontImageUrl} isAllTime={isAllTime} gradClassEstimated={gcEstimated} />
          <PlayerCardBack player={playerWithSlug} resolvedHsid={resolvedHsid} headshotUrl={headshotUrl} isAllTime={isAllTime} />
        </div>
      </div>
    </article>
  );
}
