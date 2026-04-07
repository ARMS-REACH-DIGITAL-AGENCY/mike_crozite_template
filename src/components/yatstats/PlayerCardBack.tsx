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
// HERO RATIO: fixed 20:7 (≈ 35% padding-bottom).
// Image fills the band with object-fit:cover; height never drifts with image dimensions.
//
// METADATA OVERLAY (top-left, 6 lines):
//   1. PLAYER NAME
//   2. Current Team | Pro Organization
//   3. POSITION · LEVEL · STATUS
//   4. B/T · H/W
//   5. Draft Information
//   6. Previous Colleges Attended (rendered only when field is present)

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
    <div className="yat-face yat-back">
      <div className="yat-back-content">
        {/*
          Hero band: fixed 20:7 ratio (padding-bottom: 35%).
          Image fills with object-fit:cover — height never drifts.
          Metadata overlay anchored top-left.
          Entire band links to the player profile page.
        */}
        <a
          href={`/${resolvedHsid}/player/${imageId}/${slug}`}
          className="yat-back-hero"
        >
          {/* Fixed-ratio container — 20:7 = 35% */}
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

          {/* Metadata overlay — top-left, 6 lines */}
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

      {/* Styles scoped to back-card shell only — no global changes */}
      <style>{`
        /* ── Hero band ──────────────────────────────────────────────── */
        .yat-back-hero{
          position:relative;
          display:block;
          text-decoration:none;
          overflow:hidden;
        }
        /* Fixed 20:7 ratio = 35% padding-bottom */
        .yat-back-img-wrap{
          position:relative;
          width:100%;
          padding-bottom:35%;
          background:#0a0a0a;
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
        /* Top-heavy: strong at top-left for text, fades toward bottom-right */
        .yat-back-scrim{
          position:absolute;
          inset:0;
          background:
            linear-gradient(
              to bottom right,
              rgba(0,0,0,.72) 0%,
              rgba(0,0,0,.45) 40%,
              rgba(0,0,0,.10) 100%
            );
          pointer-events:none;
          z-index:1;
        }

        /* ── Metadata overlay — top-left ────────────────────────────── */
        .yat-back-overlay{
          position:absolute;
          top:0;
          left:0;
          right:0;
          padding:7px 10px 6px;
          z-index:2;
          pointer-events:none;
          display:flex;
          flex-direction:column;
          gap:1px;
        }

        /* Line 1: Player Name — largest, bold, uppercase */
        .ybo-name{
          font:700 clamp(13px,3.8vw,17px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.05em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
        /* Line 2: Team / Org */
        .ybo-team{
          font:600 clamp(8px,2.2vw,10px)/1.25 Oswald,sans-serif;
          letter-spacing:.06em;
          color:rgba(255,255,255,.9);
          text-transform:uppercase;
          text-shadow:0 1px 2px rgba(0,0,0,.5);
          margin-top:1px;
        }
        /* Lines 3–6: secondary meta — smaller, lighter */
        .ybo-pos,
        .ybo-bthw,
        .ybo-draft,
        .ybo-college{
          font:400 clamp(7px,1.9vw,9px)/1.3 Oswald,sans-serif;
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
