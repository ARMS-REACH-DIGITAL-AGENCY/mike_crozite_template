// src/components/yatstats/PlayerCard.tsx
// Full flip card container: article element with front and back faces

import { levelLabel, gradClassInfo, varsityDots, normalizeOrg } from "@/lib/playerUtils";
import { getPlayerThenImageUrl } from "@/lib/playerImage";
import { toPlayerSlug } from "@/lib/slug";
import PlayerCardFront from "@/components/yatstats/PlayerCardFront";
import PlayerCardBack from "@/components/yatstats/PlayerCardBack";
import PlayerCardFlipBehavior from "@/components/yatstats/PlayerCardFlipBehavior";

const YAT_ASSETS_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const HEADSHOT_FALLBACK_URL = "/img/headshot-silhouette.png";
const UNCOMMITTED_BADGE_URL = "/img/uncommitted.png";

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

function statValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const cleaned = String(value).replace(/[^0-9.-]/g, "").trim();
  return cleaned;
}

function truthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "t" || v === "1" || v === "yes" || v === "y";
  }
  return false;
}

function isYear2026(value: unknown): boolean {
  return String(value || "").trim() === "2026";
}

function imageText(value: unknown): string {
  const text = String(value || "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  return text;
}

export default function PlayerCard({ player: p, resolvedHsid, frontImageUrl = null, headshotUrl = null, isAllTime }: PlayerCardProps) {
  const lvl = String(p.level_label || levelLabel(String(p.level || "")) || p.level || "");
  const gc = String(p.class_of || "").trim();
  const { estimated: gcEstimated } = gradClassInfo(p);
  const rosterYears = Array.isArray(p.roster_years) ? p.roster_years : varsityDots(p);
  const org = normalizeOrg(String(p.current_org_or_conference_name || ""));
  const status = String(
    p.status_label || (p.is_active_2025 ? "ACTIVE" : "RETIRED")
  )
    .trim()
    .toUpperCase();
  const slug = toPlayerSlug(
    String(p.firstname || p.first_name || ""),
    String(p.lastname || p.last_name || "")
  );

  const playerWithSlug = { ...p, slug };
  const gp = statValue(p.g || p.pg);
  const has2026Stats = truthyFlag(p.has_2026_stats) || isYear2026(p.stat_year) || isYear2026(p.pitch_year);
  const playerId = String(p.playerid || "");

  // Block 3 mirrors Block 5 while using section-specific artwork:
  // active = current headshot, all-time = HS-era card front,
  // current team = the committed_teamid logo from flip_card_front_stage.
  const nowThumbnailUrl = imageText(headshotUrl) || `${YAT_ASSETS_BASE}/players/now/${encodeURIComponent(playerId)}.jpg`;
  const thenThumbnailUrl = imageText(frontImageUrl) || getPlayerThenImageUrl(playerId);
  const committedTeamId = imageText(
    p.committed_teamid || p.committed_team_id || p.commit_teamid || p.commit_team_id
  );
  const explicitCommittedLogoUrl = imageText(
    p.committed_team_logo_url || p.committed_logo_url || p.commit_logo_url || p.team_logo_url
  );
  const committedLogoUrl = explicitCommittedLogoUrl
    || (committedTeamId
      ? `${YAT_ASSETS_BASE}/teams/${encodeURIComponent(committedTeamId)}.png`
      : UNCOMMITTED_BADGE_URL);

  return (
    <article
      id={`player-${playerId}`}
      className="yat-card"
      data-name={`${String(p.firstname || p.first_name || "")} ${String(p.lastname || p.last_name || "")}`.toLowerCase()}
      data-playerid={playerId}
      data-level={lvl}
      data-org={org}
      data-gradclass={gc}
      data-rosteryears={Array.isArray(rosterYears) ? rosterYears.join(",") : ""}
      data-status={status}
      data-has-2026-stats={has2026Stats ? "true" : "false"}
      data-slug={slug}
      data-committed-teamid={committedTeamId}
      data-thumbnail-now={nowThumbnailUrl}
      data-thumbnail-then={thenThumbnailUrl}
      data-thumbnail-current={committedLogoUrl}
      data-thumbnail-now-fallback={HEADSHOT_FALLBACK_URL}
      data-thumbnail-then-fallback={HEADSHOT_FALLBACK_URL}
      data-thumbnail-current-fallback={UNCOMMITTED_BADGE_URL}
      data-stat-gp={gp}
      data-stat-avg={statValue(p.avg)}
      data-stat-obp={statValue(p.obp)}
      data-stat-slg={statValue(p.slg)}
      data-stat-ops={statValue(p.ops)}
      data-stat-hr={statValue(p.hr)}
      data-stat-rbi={statValue(p.rbi)}
      data-stat-r={statValue(p.r)}
      data-stat-h={statValue(p.h)}
      data-stat-sb={statValue(p.sb)}
      data-stat-ab={statValue(p.ab)}
      data-stat-era={statValue(p.era)}
      data-stat-er={statValue(p.er)}
      data-stat-whip={statValue(p.whip)}
      data-stat-k={statValue(p.ko)}
      data-stat-bb={statValue(p.bb)}
      data-stat-ip={statValue(p.ip)}
      data-stat-k9={statValue(p.so9)}
      data-stat-bb9={statValue(p.bb9)}
      data-stat-kbb={statValue(p.so_bb)}
      data-stat-w={statValue(p.w)}
      data-stat-wl={statValue(p.w)}
      data-stat-sv={statValue(p.saves)}
    >
      <PlayerCardFlipBehavior />
      <div className="yat-card-inner">
        <div className="yat-flip">
          <PlayerCardFront player={playerWithSlug} frontImageUrl={frontImageUrl} isAllTime={isAllTime} gradClassEstimated={gcEstimated} />
          <PlayerCardBack player={playerWithSlug} resolvedHsid={resolvedHsid} headshotUrl={headshotUrl} isAllTime={isAllTime} />
        </div>
      </div>
    </article>
  );
}
