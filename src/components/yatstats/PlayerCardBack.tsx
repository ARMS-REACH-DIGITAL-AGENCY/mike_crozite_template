// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card: ACTION image (players/back/), name, position, draft info, FunZone.
//
// IMAGE ROLE RULES (enforced here):
//   - players/back/{playerid}.jpg  → back-card hero ACTION image (new dedicated slot)
//   - players/now/{playerid}.jpg   → legacy general/timeline path — NOT used here
//   - players/then/{playerid}.jpg  → front-card / LEFT_ANCHOR path — NOT used here
//   - headshotUrl prop             → HEADSHOT role from player_photos — NOT used as back hero
//
// If players/back/{playerid}.jpg is missing, SafeImage falls back to the silhouette.
// Do NOT substitute players/now/ or headshotUrl as the back-card hero image.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

// S3 base — same constant used in playerImage.ts; inlined here to avoid touching that file.
const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

/**
 * Back-card hero ACTION image from the dedicated players/back/ S3 folder.
 * This is a separate image role from players/now/ (legacy general/timeline)
 * and from players/then/ (front card / LEFT_ANCHOR).
 */
function getPlayerBackImageUrl(imageId: string): string {
  return `${S3_BASE}/players/back/${imageId}.jpg`;
}

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /**
   * Explicitly designated HEADSHOT image URL from player_photos (image_role='HEADSHOT').
   * Accepted by this component for API compatibility but NOT used as the back-card hero image.
   * The back-card hero image always comes from players/back/{playerid}.jpg.
   */
  headshotUrl: string | null;
  /** When true, shows "CAREER STATS" label instead of the season year */
  isAllTime?: boolean;
}

export default function PlayerCardBack({ player: p, resolvedHsid, isAllTime }: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const imageId = String(p.playerid || "");
  const slug = String(p.slug || "");

  // Back-card hero: players/back/{playerid}.jpg — dedicated action image slot.
  // Falls back to silhouette only; never substitutes players/now/ or headshotUrl.
  const backImageSrc = getPlayerBackImageUrl(imageId);
  const backSilhouetteUrl = getNowSilhouetteUrl(isPitcher);

  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}${isPitcher ? "PITCHING" : "BATTING"}`;

  // Pre-format all stat values here (Server Component) so only serializable strings
  // are passed into FunZone ("use client"). Functions cannot cross the RSC boundary.
  const batterStats = [
    { k: "AVG", v: fmt("AVG", p.avg) }, { k: "OBP", v: fmt("OBP", p.obp) },
    { k: "SLG", v: fmt("SLG", p.slg) }, { k: "OPS", v: fmt("OPS", p.ops) },
    { k: "HR", v: fmt("HR", p.hr) }, { k: "RBI", v: fmt("RBI", p.rbi) },
    { k: "H", v: fmt("H", p.h) }, { k: "AB", v: fmt("AB", p.ab) },
    { k: "R", v: fmt("R", p.r) }, { k: "SB", v: fmt("SB", p.sb) },
    { k: "2B", v: fmt("2B", p["2b"]) }, { k: "BB", v: fmt("BB", p.bb) },
  ];
  const pitcherStats = [
    { k: "ERA", v: fmt("ERA", p.era) }, { k: "WHIP", v: fmt("WHIP", p.whip) },
    { k: "IP", v: fmt("IP", p.ip) },
    { k: "W-L", v: (p.w !== null && p.l !== null) ? `${p.w}-${p.l}` : "--" },
    { k: "K", v: fmt("K", p.ko) },
    { k: "BB", v: fmt("BB", isAllTime ? (p.pbb ?? p.bb) : p.pbb) },
    { k: "K/9", v: fmt("K/9", p.k9) }, { k: "K/BB", v: fmt("K/BB", p.kbb) },
    { k: "H/9", v: fmt("H/9", p.h9) }, { k: "BB/9", v: fmt("BB/9", p.bb9) },
    { k: "SV", v: fmt("SV", p.saves) }, { k: "G", v: fmt("G", p.pg) },
  ];
  // stats is now { k: string, v: string }[] — fully serializable
  const stats = isPitcher ? pitcherStats : batterStats;

  // Player identity strings — pre-computed here (Server Component) for serialization safety
  const displayName = String(p.display_name || `${p.firstname} ${p.lastname}`);
  const teamName = String(
    p.current_team_name ||
    p.current_org_or_conference_name ||
    p.level_label ||
    ""
  );
  const positionLine = [
    p.position,
    p.bats && p.throws ? `B/T ${p.bats}/${p.throws}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="yat-face yat-back">
      <div className="yat-back-content">
        {/*
          Hero band: action image fills the band.
          Player identity text is overlaid in the bottom-left of the image area.
          The entire band links to the player profile page.
        */}
        <a
          href={`/${resolvedHsid}/player/${imageId}/${slug}`}
          className="yat-back-hero"
          style={{ position: "relative", display: "block", textDecoration: "none" }}
        >
          <div className="yat-back-img-wrap">
            <SafeImage
              src={backImageSrc}
              alt={displayName}
              className="yat-back-img"
              placeholderSrc={backSilhouetteUrl}
            />
          </div>
          {/* Identity overlay — bottom-left of hero image, matching approved layout */}
          <div className="yat-back-overlay">
            <div className="yat-back-name">{displayName}</div>
            {teamName && <div className="yat-back-team">{teamName}</div>}
            {positionLine && <div className="yat-back-details">{positionLine}</div>}
            {draft && <div className="yat-back-draft">{draft}</div>}
          </div>
        </a>

        {/* FunZone: CTA strip + six-tab interactive area */}
        <FunZone
          player={p}
          isPitcher={isPitcher}
          isAllTime={isAllTime ?? false}
          resolvedHsid={resolvedHsid}
          stats={stats}
          statBarLabel={statBarLabel}
          displayName={displayName}
        />
      </div>

      {/* Styles scoped to back-card shell — overlay positioning only */}
      <style>{`
        .yat-back-hero{position:relative;display:block;text-decoration:none;overflow:hidden;border-radius:0}
        .yat-back-img-wrap{position:relative;width:100%;padding-bottom:56%;overflow:hidden;background:#0a0a0a}
        .yat-back-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center}
        /* Gradient scrim so text is readable over any image */
        .yat-back-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.35) 45%,transparent 100%);pointer-events:none}
        /* Identity overlay — sits above the scrim */
        .yat-back-overlay{position:absolute;bottom:0;left:0;right:0;padding:8px 10px 7px;z-index:1;pointer-events:none}
        .yat-back-name{font:700 clamp(14px,4vw,18px)/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;color:#fff;text-transform:uppercase}
        .yat-back-team{font:400 10px/1.3 Oswald,sans-serif;letter-spacing:.04em;color:rgba(255,255,255,.8);text-transform:uppercase;margin-top:1px}
        .yat-back-details{font:300 9px/1.3 Oswald,sans-serif;color:rgba(255,255,255,.65);margin-top:1px}
        .yat-back-draft{font:300 9px/1.3 Oswald,sans-serif;color:rgba(255,255,255,.5);margin-top:1px}
      `}</style>
    </div>
  );
}
