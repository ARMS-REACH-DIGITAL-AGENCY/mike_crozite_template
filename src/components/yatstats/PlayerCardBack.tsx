// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.
//
// APPROVED LAYOUT (matches screenshot 51586):
//   ┌─────────────────────────────────────┐
//   │  HERO IMAGE BAND                    │
//   │  ┌─ metadata overlay (bottom-left) ─┤
//   │  │  PLAYER NAME                     │
//   │  │  Team · Org                      │
//   │  │  Position · Level · Status       │
//   │  │  B/T · H/W                       │
//   │  └──────────────────────────────────┤
//   ├─────────────────────────────────────┤
//   │  FUNZONE (CTA + tabs + panel)       │  ← flex:1, cardboard texture
//   └─────────────────────────────────────┘
//
// IMAGE ROLE RULES:
//   - players/back/{playerid}.jpg  → back-card hero ACTION image (dedicated slot)
//   - players/now/{playerid}.jpg   → NOT used here
//   - players/then/{playerid}.jpg  → front-card only — NOT used here
//   - headshotUrl prop             → HEADSHOT role — NOT used as back hero
//   Falls back to silhouette if players/back/ image is missing.
//
// METADATA: overlaid bottom-left of hero image with gradient scrim for legibility.
//   1. PLAYER NAME (large, bold)
//   2. Current Team · Pro Organization
//   3. POSITION · LEVEL · STATUS
//   4. B/T · H/W
//   (Draft and college lines omitted from overlay to keep it compact)
//
// RESPONSIVE SYSTEM:
//   container-type:inline-size on the card back establishes a CQ context.
//   All sizing uses cqi so values are relative to CARD WIDTH, not viewport.
//   Yield order: hero → CTA strip → tab strip → content panel (protected last).
//
// CARDBOARD TEXTURE:
//   Pure CSS — no image assets required.
//   Warm stone/grey tone (proof-of-concept; will become player-context-driven).
//   Applied to yat-back-content as the base; FunZone uses semi-transparent overlays.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function getPlayerBackImageUrl(imageId: string): string {
  return `${S3_BASE}/players/back/${imageId}.jpg`;
}

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  headshotUrl: string | null; // accepted for API compat; NOT used as back hero
  isAllTime?: boolean;
}

export default function PlayerCardBack({ player: p, resolvedHsid, isAllTime }: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const imageId = String(p.playerid || "");
  const slug = String(p.slug || "");

  // suppress unused warning — draft kept for future use
  void draft;

  // ── Hero image ─────────────────────────────────────────────────────────────
  const backImageSrc = getPlayerBackImageUrl(imageId);
  const backSilhouetteUrl = getNowSilhouetteUrl(isPitcher);

  // ── Stats for FunZone ──────────────────────────────────────────────────────
  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}${isPitcher ? "PITCHING" : "BATTING"}`;

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

  // ── Metadata overlay lines ─────────────────────────────────────────────────

  // Line 1: Player Name
  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  // Line 2: Current Team · Pro Organization
  const teamLine = [asText(p.current_team_name), asText(p.current_org_or_conference_name)]
    .filter(Boolean).join(" · ");

  // Line 3: POSITION · LEVEL · STATUS
  const posLevelStatus = [
    asText(p.position),
    asText(p.level_label) || asText(p.level),
    asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : ""),
  ].filter(Boolean).join(" · ");

  // Line 4: B/T · H/W
  const bats = asText(p.bats);
  const throws_ = asText(p.throws);
  const height = asText(p.height);
  const weight = asText(p.weight);
  const btPart = bats && throws_ ? `B/T ${bats}/${throws_}` : "";
  const hwPart = height && weight ? `${height} / ${weight}` : height || weight ? `${height}${weight}` : "";
  const btHw = [btPart, hwPart].filter(Boolean).join(" · ");

  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;

  // ── Cardboard texture: SVG noise filter encoded as data URI ───────────────
  // feTurbulence generates organic grain composited via ::before pseudo-element.
  const noiseSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.72 0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0.18'/></filter><rect width='200' height='200' filter='url(#n)' opacity='0.55'/></svg>`;
  const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")` as string;

  return (
    <div className="yat-face yat-back yat-back-cq">
      <div className="yat-back-content">

        {/*
          ── Hero image band with metadata overlay ────────────────────────
          Image fills the band. Metadata overlaid bottom-left with gradient scrim.
          flex-shrink:1 — yields vertical space first.
        */}
        <a href={profileHref} className="yat-back-hero" aria-label={`View ${displayName}'s profile`}>
          <SafeImage
            src={backImageSrc}
            alt={displayName}
            className="yat-back-img"
            placeholderSrc={backSilhouetteUrl}
          />
          {/* Gradient scrim for text legibility */}
          <div className="yat-back-scrim" aria-hidden="true" />
          {/* Metadata overlay — bottom-left of hero */}
          <div className="yat-back-meta">
            {displayName && <div className="ybm-name">{displayName}</div>}
            {teamLine && <div className="ybm-team">{teamLine}</div>}
            {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
            {btHw && <div className="ybm-bthw">{btHw}</div>}
          </div>
        </a>

        {/*
          ── FunZone ──────────────────────────────────────────────────────
          CTA strip + six-tab interactive area.
          flex:1 min-height:0 — gets all remaining vertical space.
          Cardboard texture shows through FunZone's semi-transparent overlays.
        */}
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

      {/* ── Styles scoped to back-card shell ── */}
      <style>{`
        /* Container query context — cqi units relative to card width */
        .yat-back-cq{
          container-type:inline-size;
          container-name:yat-back;
        }

        /* ─────────────────────────────────────────────────────────────────
           CARDBOARD TEXTURE SYSTEM (warm stone/grey proof-of-concept)
           Three CSS layers on yat-back-content:
             1. SVG feTurbulence noise via ::before (organic grain)
             2. Repeating diagonal fibre lines (directional paper texture)
             3. Solid warm stone base colour
           Hero band paints over this with its own image.
           FunZone uses semi-transparent overlays so texture bleeds through.
        ───────────────────────────────────────────────────────────────── */

        /* Card face shell — flex column, fills full card height */
        .yat-back-content{
          display:flex;
          flex-direction:column;
          height:100%;
          overflow:hidden;
          position:relative;

          /* Cardboard base colour: warm stone grey */
          background-color:#b8b0a4;

          /* Fibre lines: two sets simulate pressed paper grain */
          background-image:
            repeating-linear-gradient(
              168deg,
              transparent 0px,
              transparent 3px,
              rgba(255,255,255,0.04) 3px,
              rgba(255,255,255,0.04) 4px
            ),
            repeating-linear-gradient(
              78deg,
              transparent 0px,
              transparent 5px,
              rgba(0,0,0,0.03) 5px,
              rgba(0,0,0,0.03) 6px
            );
        }

        /* Noise overlay via pseudo-element */
        .yat-back-content::before{
          content:"";
          position:absolute;
          inset:0;
          background-image:${noiseUrl};
          background-size:200px 200px;
          background-repeat:repeat;
          mix-blend-mode:multiply;
          opacity:0.45;
          pointer-events:none;
          z-index:0;
        }

        /* ── Hero image band ─────────────────────────────────────────── */
        /* Tall enough to show the action image + hold the metadata overlay.
           flex-shrink:1 — yields vertical space first.
           aspect-ratio keeps height proportional to card width. */
        .yat-back-hero{
          display:block;
          text-decoration:none;
          overflow:hidden;
          flex-shrink:1;
          aspect-ratio:20/9;
          min-height:clamp(80px,38cqi,200px);
          max-height:clamp(110px,52cqi,280px);
          width:100%;
          background:#0a0a0a;
          position:relative;
          z-index:1;
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

        /* Gradient scrim — bottom 60% of hero, dark-to-transparent */
        .yat-back-scrim{
          position:absolute;
          inset:0;
          background:linear-gradient(
            to top,
            rgba(0,0,0,0.82) 0%,
            rgba(0,0,0,0.55) 35%,
            rgba(0,0,0,0.0) 65%
          );
          pointer-events:none;
        }

        /* Metadata overlay — bottom-left of hero image */
        .yat-back-meta{
          position:absolute;
          bottom:0;
          left:0;
          right:0;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(5px,2cqi,10px);
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.4cqi,2px);
        }

        /* Line 1: Player Name */
        .ybm-name{
          font:700 clamp(11px,5cqi,22px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 4px rgba(0,0,0,.6);
        }
        /* Line 2: Team / Org */
        .ybm-team{
          font:600 clamp(6px,2.6cqi,12px)/1.3 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.95);
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.5);
        }
        /* Lines 3–4: secondary meta */
        .ybm-pos,
        .ybm-bthw{
          font:400 clamp(5px,2.1cqi,9px)/1.35 Oswald,sans-serif;
          letter-spacing:.04em;
          color:rgba(255,255,255,.75);
          text-transform:uppercase;
          text-shadow:0 1px 2px rgba(0,0,0,.5);
        }
      `}</style>
    </div>
  );
}
