// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.
//
// APPROVED LAYOUT (matches printed card aesthetic from screenshot 51578):
//   ┌─────────────────────────────────────┐  ← cardboard texture, full card
//   │ ┌───────────────────────────────┐   │  ← 4-sided inset dark border
//   │ │  HERO IMAGE (action photo)    │   │
//   │ │  ┌── metadata overlay ──────┐ │   │  ← anchored TOP-LEFT
//   │ │  │ PLAYER NAME              │ │   │
//   │ │  │ Team Name                │ │   │
//   │ │  │ Org / Conference         │ │   │  ← separate line
//   │ │  │ Position · Level         │ │   │
//   │ │  │ B/T · H/W                │ │   │
//   │ │  └──────────────────────────┘ │   │
//   │ ├───────────────────────────────┤   │
//   │ │  FUNZONE (CTA + tabs + panel) │   │  ← black text on light cardboard
//   │ └───────────────────────────────┘   │
//   └─────────────────────────────────────┘
//
// KEY DESIGN DECISIONS:
//   - Cardboard texture covers the ENTIRE card face (top to bottom, edge to edge)
//   - 4-sided dark inset border frames the inner content area (all four sides)
//   - Hero image sits inside the border as an inset panel
//   - Metadata anchored TOP-LEFT of hero image (not bottom)
//   - Team name on one line; org/conference on the next line
//   - FunZone: black text, very light backgrounds
//   - No-image fallback: YatCrest screened back on cardboard (not dark silhouette)
//
// IMAGE ROLE RULES:
//   - players/back/{playerid}.jpg  → back-card hero ACTION image
//   - players/now/{playerid}.jpg   → NOT used here
//   - players/then/{playerid}.jpg  → front-card only
//   - headshotUrl prop             → NOT used as back hero
//
// RESPONSIVE SYSTEM:
//   container-type:inline-size on .yat-back-cq.
//   All sizing uses cqi (card-width-relative), not vw.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function getPlayerBackImageUrl(imageId: string): string {
  return `${S3_BASE}/players/back/${imageId}.jpg`;
}

// YatCrest used as screened-back placeholder when no back image exists
const YATCREST_URL = `${S3_BASE}/assets/YatCrest.png`;

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  headshotUrl: string | null;
  isAllTime?: boolean;
}

export default function PlayerCardBack({ player: p, resolvedHsid, isAllTime }: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const imageId = String(p.playerid || "");
  const slug = String(p.slug || "");
  void draft;

  const backImageSrc = getPlayerBackImageUrl(imageId);

  // ── Stats for FunZone ──────────────────────────────────────────────────────
const statusLabel = String(p.status_label || "").toUpperCase();
const useCareerStats = statusLabel === "RETIRED";

const statYear = isPitcher ? p.pitch_year : p.stat_year;
const statBarLabel = useCareerStats
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
  { k: "BB", v: fmt("BB", p.bb) },
  { k: "K/9", v: fmt("K/9", p.so9) }, { k: "K/BB", v: fmt("K/BB", p.so_bb) },
  { k: "H/9", v: fmt("H/9", p.h9) }, { k: "BB/9", v: fmt("BB/9", p.bb9) },
  { k: "SV", v: fmt("SV", p.saves) }, { k: "G", v: fmt("G", p.pg) },
];
  const stats = isPitcher ? pitcherStats : batterStats;

  // ── Metadata overlay lines ─────────────────────────────────────────────────
  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  // Team and org/conference are now SEPARATE lines
  const teamName = asText(p.current_team_name);
  const orgConf = asText(p.current_org_or_conference_name);

  const posLevelStatus = [
    asText(p.position),
    asText(p.level_label) || asText(p.level),
    asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : ""),
  ].filter(Boolean).join(" · ");

  const bats = asText(p.bats);
  const throws_ = asText(p.throws);
  const height = asText(p.height);
  const weight = asText(p.weight);
  const btPart = bats && throws_ ? `B/T ${bats}/${throws_}` : "";
  const hwPart = height && weight ? `${height} / ${weight}` : height || weight ? `${height}${weight}` : "";
  const btHw = [btPart, hwPart].filter(Boolean).join(" · ");

  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;

  // ── Cardboard texture noise SVG ────────────────────────────────────────────
  const noiseSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.72 0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0.18'/></filter><rect width='200' height='200' filter='url(#n)' opacity='0.55'/></svg>`;
  const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")` as string;

  return (
    <div className="yat-face yat-back yat-back-cq">
      {/*
        yat-back-texture: full-card cardboard base (texture + 4-sided border)
        yat-back-inner:   inset content column (hero + FunZone)
      */}
      <div className="yat-back-texture">
        <div className="yat-back-inner">

          {/* Hero image with metadata overlay anchored TOP-LEFT */}
          <a href={profileHref} className="yat-back-hero" aria-label={`View ${displayName}'s profile`}>
            {/*
              SafeImage fallback: YatCrest screened back on cardboard.
              The hero bg is set to the cardboard colour so the fallback
              blends naturally — no dark silhouette.
            */}
            <SafeImage
              src={backImageSrc}
              alt={displayName}
              className="yat-back-img"
              placeholderSrc={YATCREST_URL}
            />
            {/* Cardboard fallback bg — visible only when image fails to load */}
            <div className="yat-back-hero-fallback" aria-hidden="true" />
            {/* Gradient scrim — top-to-bottom dark so top text stays legible */}
            <div className="yat-back-scrim" aria-hidden="true" />
            {/* Metadata overlay — anchored TOP-LEFT */}
            <div className="yat-back-meta">
              {displayName && <div className="ybm-name">{displayName}</div>}
              {teamName && <div className="ybm-team">{teamName}</div>}
              {orgConf && <div className="ybm-org">{orgConf}</div>}
              {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
              {btHw && <div className="ybm-bthw">{btHw}</div>}
            </div>
          </a>

          {/* FunZone — black text on light cardboard */}
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
      </div>

      <style>{`
        /* ── Container query context ─────────────────────────────────── */
        .yat-back-cq{
          container-type:inline-size;
          container-name:yat-back;
        }

        /* ── Full-card cardboard texture layer ───────────────────────── */
        .yat-back-texture{
          width:100%;
          height:100%;
          position:relative;
          overflow:hidden;
          background-color:#c2b9ae;
          background-image:
            repeating-linear-gradient(
              168deg,
              transparent 0px, transparent 3px,
              rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px
            ),
            repeating-linear-gradient(
              78deg,
              transparent 0px, transparent 5px,
              rgba(0,0,0,0.04) 5px, rgba(0,0,0,0.04) 6px
            );
        }
        .yat-back-texture::before{
          content:"";
          position:absolute;
          inset:0;
          background-image:${noiseUrl};
          background-size:200px 200px;
          background-repeat:repeat;
          mix-blend-mode:multiply;
          opacity:0.5;
          pointer-events:none;
          z-index:0;
        }

        /* ── Inset content column — 4-SIDED border ───────────────────── */
        .yat-back-inner{
          position:relative;
          z-index:1;
          display:flex;
          flex-direction:column;
          /* Use height minus bottom margin so bottom border is visible */
          height:calc(100% - clamp(4px,2cqi,10px) * 2);
          margin:clamp(4px,2cqi,10px);
          border:clamp(1.5px,0.7cqi,3px) solid rgba(30,22,14,0.65);
          border-radius:clamp(2px,1cqi,5px);
          overflow:hidden;
        }

        /* ── Hero image band ─────────────────────────────────────────── */
        .yat-back-hero{
          display:block;
          text-decoration:none;
          overflow:hidden;
          flex-shrink:1;
          aspect-ratio:20/7;
          min-height:clamp(60px,28cqi,155px);
          max-height:clamp(85px,40cqi,215px);
          width:100%;
          /* Cardboard colour as bg — shows when image fails */
          background:#c2b9ae;
          position:relative;
        }
        .yat-back-img{
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          object-fit:cover;
          object-position:top center;
          display:block;
          z-index:1;
        }

        /* Fallback layer: YatCrest screened back on cardboard.
           Visible only when .yat-back-img fails to load (z-index below img). */
        .yat-back-hero-fallback{
          position:absolute;
          inset:0;
          z-index:0;
          background-color:#c2b9ae;
          background-image:url("${YATCREST_URL}");
          background-repeat:no-repeat;
          background-position:center center;
          background-size:55% auto;
          opacity:0.22;
        }

        /* Gradient scrim — left-side only so text pops on left,
           player's face/action shows in full colour on the right */
        .yat-back-scrim{
          position:absolute;
          inset:0;
          z-index:2;
          background:linear-gradient(
            to right,
            rgba(0,0,0,0.72) 0%,
            rgba(0,0,0,0.55) 35%,
            rgba(0,0,0,0.20) 60%,
            rgba(0,0,0,0.0) 80%
          );
          pointer-events:none;
        }

        /* Metadata overlay — anchored TOP-LEFT */
        .yat-back-meta{
          position:absolute;
          top:0; left:0; right:0;
          z-index:3;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(5px,2cqi,10px);
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.5cqi,3px);
        }

        /* Line 1: Player Name */
        .ybm-name{
          font:700 clamp(11px,5cqi,22px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 4px rgba(0,0,0,.7);
        }
        /* Line 2: Team Name */
        .ybm-team{
          font:600 clamp(6px,2.6cqi,12px)/1.25 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.95);
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
        /* Line 3: Org / Conference (separate line, slightly smaller) */
        .ybm-org{
          font:600 clamp(5.5px,2.4cqi,11px)/1.25 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.90);
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
        /* Lines 4–5: secondary meta */
        .ybm-pos,
        .ybm-bthw{
          font:400 clamp(5px,2.1cqi,9px)/1.35 Oswald,sans-serif;
          letter-spacing:.04em;
          color:rgba(255,255,255,.80);
          text-transform:uppercase;
          text-shadow:0 1px 2px rgba(0,0,0,.5);
        }
      `}</style>
    </div>
  );
}
