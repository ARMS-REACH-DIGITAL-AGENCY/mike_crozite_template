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
//
// HERO RATIO: intrinsically responsive — uses aspect-ratio:20/7 with max-height clamp.
// Image fills the band with object-fit:cover; height shrinks with width (not fixed px).
// Hero yields vertical space first; FunZone content panel is protected.
//
// METADATA OVERLAY (top-left, 6 lines):
//   1. PLAYER NAME
//   2. Current Team | Pro Organization
//   3. POSITION · LEVEL · STATUS
//   4. B/T · H/W
//   5. Draft Information
//   6. Previous Colleges Attended (rendered only when field is present)
//
// RESPONSIVE VERTICAL SYSTEM:
//   All sizing uses cqi (container query inline-size) units so values are relative
//   to the CARD WIDTH, not the viewport. This ensures the 230px mobile card and
//   the 360px desktop card both get proportionally correct sizing.
//   Priority order (who yields space first):
//     1. Hero image band (shrinks with card width via aspect-ratio + cqi max-height)
//     2. Hero text overlay (font scales down via clamp with cqi)
//     3. CTA strip (padding tightens via clamp with cqi)
//     4. Tab strip (padding tightens via clamp with cqi)
//     5. FunZone content panel — protected last

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

// S3 base — same constant used in playerImage.ts; inlined here to avoid touching that file.
const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

/**
 * Back-card hero ACTION image from the dedicated players/back/ S3 folder.
 * Separate image role from players/now/ (legacy) and players/then/ (front card).
 */
function getPlayerBackImageUrl(imageId: string): string {
  return `${S3_BASE}/players/back/${imageId}.jpg`;
}

/** Coerce unknown player field to a trimmed string, or "" if absent/null. */
function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /**
   * Explicitly designated HEADSHOT image URL from player_photos (image_role='HEADSHOT').
   * Accepted for API compatibility but NOT used as the back-card hero image.
   * The back-card hero always comes from players/back/{playerid}.jpg.
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

  // ── Hero image ─────────────────────────────────────────────────────────────
  // players/back/{playerid}.jpg — dedicated action image slot.
  // Falls back to silhouette only; never substitutes players/now/ or headshotUrl.
  const backImageSrc = getPlayerBackImageUrl(imageId);
  const backSilhouetteUrl = getNowSilhouetteUrl(isPitcher);

  // ── Stats for FunZone ──────────────────────────────────────────────────────
  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}${isPitcher ? "PITCHING" : "BATTING"}`;

  // Pre-format all stat values here (Server Component) — functions cannot cross the RSC boundary.
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
  const stats = isPitcher ? pitcherStats : batterStats;

  // ── Metadata overlay — 6 lines ─────────────────────────────────────────────
  // All values pre-computed here (Server Component) as serializable strings.

  // Line 1: Player Name
  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  // Line 2: Current Team | Pro Organization
  const currentTeamName = asText(p.current_team_name);
  const currentOrgOrConf = asText(p.current_org_or_conference_name);
  const teamLine = [currentTeamName, currentOrgOrConf].filter(Boolean).join(" · ");

  // Line 3: POSITION · LEVEL · STATUS
  const position = asText(p.position);
  const levelLabel = asText(p.level_label) || asText(p.level);
  const statusLabel = asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : "");
  const posLevelStatus = [position, levelLabel, statusLabel].filter(Boolean).join(" · ");

  // Line 4: B/T · H/W
  const bats = asText(p.bats);
  const throws_ = asText(p.throws);
  const height = asText(p.height);
  const weight = asText(p.weight);
  const btPart = bats && throws_ ? `B/T ${bats}/${throws_}` : "";
  const hwPart = height && weight ? `${height} / ${weight}` : height || weight ? `${height}${weight}` : "";
  const btHw = [btPart, hwPart].filter(Boolean).join(" · ");

  // Line 5: Draft Info (via parseDraft)
  // draft is already a formatted string or null

  // Line 6: Previous Colleges Attended
  // Field does not yet exist in the data model — check multiple candidate names.
  // Renders only when present; forward-compatible when field is added.
  const collegeListRaw =
    p.college_list ||
    p.prev_colleges ||
    p.college_history ||
    p.colleges_attended ||
    null;
  const collegeLine: string = (() => {
    if (!collegeListRaw) return "";
    if (Array.isArray(collegeListRaw)) {
      return (collegeListRaw as unknown[])
        .map((c) => asText(c))
        .filter(Boolean)
        .join(" · ");
    }
    return asText(collegeListRaw);
  })();

  return (
    <div className="yat-face yat-back yat-back-cq">
      {/*
        yat-back-content is a flex column that fills the full card face height.
        The hero band is flex-shrink:1 (yields first).
        FunZone (fz-root) is flex:1 min-height:0 (protected last).
      */}
      <div className="yat-back-content">
        {/*
          Hero band: aspect-ratio:20/7 with max-height clamp using cqi.
          Shrinks naturally with card width — yields vertical space first.
          Metadata overlay anchored top-left with clamp() font sizes using cqi.
          Entire band links to the player profile page.
        */}
        <a
          href={`/${resolvedHsid}/player/${imageId}/${slug}`}
          className="yat-back-hero"
        >
          {/* Aspect-ratio container — 20:7, shrinks with card width */}
          <div className="yat-back-img-wrap">
            <SafeImage
              src={backImageSrc}
              alt={displayName}
              className="yat-back-img"
              placeholderSrc={backSilhouetteUrl}
            />
          </div>

          {/* Gradient scrim — top-heavy so top-left text is always readable */}
          <div className="yat-back-scrim" aria-hidden="true" />

          {/* Metadata overlay — top-left, 6 lines, font sizes clamp with cqi */}
          <div className="yat-back-overlay">
            {/* Line 1: Player Name */}
            {displayName && (
              <div className="ybo-name">{displayName}</div>
            )}
            {/* Line 2: Current Team | Pro Organization */}
            {teamLine && (
              <div className="ybo-team">{teamLine}</div>
            )}
            {/* Line 3: Position · Level · Status */}
            {posLevelStatus && (
              <div className="ybo-pos">{posLevelStatus}</div>
            )}
            {/* Line 4: B/T · H/W */}
            {btHw && (
              <div className="ybo-bthw">{btHw}</div>
            )}
            {/* Line 5: Draft Information */}
            {draft && (
              <div className="ybo-draft">{draft}</div>
            )}
            {/* Line 6: Previous Colleges Attended — only when field is present */}
            {collegeLine && (
              <div className="ybo-college">{collegeLine}</div>
            )}
          </div>
        </a>

        {/* FunZone: CTA strip + six-tab interactive area — flex:1, protected */}
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

      {/* ── Styles scoped to back-card shell only — no global changes ── */}
      <style>{`
        /* ── Container query context ────────────────────────────────── */
        /* Establishes inline-size container so cqi units are relative
           to the CARD WIDTH, not the viewport. This means a 230px card
           and a 360px card both get proportionally correct sizing. */
        .yat-back-cq{
          container-type:inline-size;
          container-name:yat-back;
        }

        /* ── Card face shell ────────────────────────────────────────── */
        .yat-back-content{
          display:flex;
          flex-direction:column;
          height:100%;
          overflow:hidden;
        }

        /* ── Hero band ──────────────────────────────────────────────── */
        /* flex-shrink:1 — hero yields vertical space before FunZone does.
           aspect-ratio:20/7 means height = card-width * 35%.
           max-height uses cqi so it scales with card width, not viewport. */
        .yat-back-hero{
          position:relative;
          display:block;
          text-decoration:none;
          overflow:hidden;
          flex-shrink:1;
          aspect-ratio:20/7;
          min-height:50px;
          /* cqi = % of container (card) inline-size */
          max-height:clamp(55px,30cqi,140px);
          width:100%;
          background:#0a0a0a;
        }

        /* Image fills the hero band completely */
        .yat-back-img-wrap{
          position:absolute;
          inset:0;
          overflow:hidden;
        }
        .yat-back-img{
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          object-fit:cover;
          object-position:top center;
          display:block;
        }

        /* ── Gradient scrim ─────────────────────────────────────────── */
        .yat-back-scrim{
          position:absolute;
          inset:0;
          background:
            linear-gradient(
              to bottom right,
              rgba(0,0,0,.78) 0%,
              rgba(0,0,0,.50) 40%,
              rgba(0,0,0,.14) 100%
            );
          pointer-events:none;
          z-index:1;
        }

        /* ── Metadata overlay — top-left ────────────────────────────── */
        /* All padding/gap/font use cqi so they scale with card width */
        .yat-back-overlay{
          position:absolute;
          top:0;
          left:0;
          right:0;
          padding:clamp(3px,1.5cqi,8px) clamp(4px,2cqi,12px) clamp(3px,1.5cqi,8px);
          z-index:2;
          pointer-events:none;
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.4cqi,2px);
        }

        /* Line 1: Player Name — cqi-based font size */
        .ybo-name{
          font:700 clamp(9px,4.2cqi,17px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.05em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
        /* Line 2: Team / Org */
        .ybo-team{
          font:600 clamp(6px,2.4cqi,11px)/1.25 Oswald,sans-serif;
          letter-spacing:.06em;
          color:rgba(255,255,255,.9);
          text-transform:uppercase;
          text-shadow:0 1px 2px rgba(0,0,0,.5);
        }
        /* Lines 3–6: secondary meta */
        .ybo-pos,
        .ybo-bthw,
        .ybo-draft,
        .ybo-college{
          font:400 clamp(5px,2cqi,9px)/1.3 Oswald,sans-serif;
          letter-spacing:.04em;
          color:rgba(255,255,255,.75);
          text-shadow:0 1px 2px rgba(0,0,0,.5);
          text-transform:uppercase;
        }
        .ybo-college{
          color:rgba(255,255,255,.6);
          font-style:italic;
        }
      `}</style>
    </div>
  );
}
