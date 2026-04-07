// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.
//
// APPROVED LAYOUT (matches printed card aesthetic from screenshot 51578):
//   ┌─────────────────────────────────────┐  ← cardboard texture, full card
//   │ ┌───────────────────────────────┐   │  ← inset dark border all around
//   │ │  HERO IMAGE (action photo)    │   │
//   │ │  ┌── metadata overlay ──────┐ │   │
//   │ │  │ PLAYER NAME              │ │   │
//   │ │  │ Team · Org               │ │   │
//   │ │  │ Position · Level         │ │   │
//   │ │  │ B/T · H/W                │ │   │
//   │ │  └──────────────────────────┘ │   │
//   │ ├───────────────────────────────┤   │
//   │ │  FUNZONE (CTA + tabs + panel) │   │  ← dark text on cardboard
//   │ └───────────────────────────────┘   │
//   └─────────────────────────────────────┘
//
// KEY DESIGN DECISIONS:
//   - Cardboard texture covers the ENTIRE card face (top to bottom, edge to edge)
//   - A dark inset border frames the inner content area like a real printed card
//   - Hero image sits inside the border as an inset panel
//   - FunZone uses dark text directly on the cardboard (no dark overlay)
//   - The texture is pure CSS: SVG feTurbulence + fibre lines + solid base
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
  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();
  const teamLine = [asText(p.current_team_name), asText(p.current_org_or_conference_name)]
    .filter(Boolean).join(" · ");
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
        yat-back-texture: full-card cardboard base (texture + border)
        yat-back-inner:   inset content column (hero + FunZone)
      */}
      <div className="yat-back-texture">
        <div className="yat-back-inner">

          {/* Hero image with metadata overlay */}
          <a href={profileHref} className="yat-back-hero" aria-label={`View ${displayName}'s profile`}>
            <SafeImage
              src={backImageSrc}
              alt={displayName}
              className="yat-back-img"
              placeholderSrc={backSilhouetteUrl}
            />
            <div className="yat-back-scrim" aria-hidden="true" />
            <div className="yat-back-meta">
              {displayName && <div className="ybm-name">{displayName}</div>}
              {teamLine && <div className="ybm-team">{teamLine}</div>}
              {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
              {btHw && <div className="ybm-bthw">{btHw}</div>}
            </div>
          </a>

          {/* FunZone — dark text on cardboard */}
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
        /* Covers the entire card face edge-to-edge, top to bottom.
           Three CSS layers: solid base + fibre lines + SVG noise (::before). */
        .yat-back-texture{
          width:100%;
          height:100%;
          position:relative;
          overflow:hidden;

          /* Warm stone/grey cardboard base */
          background-color:#c2b9ae;

          /* Directional fibre lines */
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

        /* SVG noise grain via pseudo-element */
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

        /* ── Inset content column ────────────────────────────────────── */
        /* Dark border all the way around — like a real printed card frame.
           Sits above the noise layer (z-index:1). */
        .yat-back-inner{
          position:relative;
          z-index:1;
          display:flex;
          flex-direction:column;
          height:100%;
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
          aspect-ratio:20/9;
          min-height:clamp(80px,38cqi,200px);
          max-height:clamp(110px,52cqi,280px);
          width:100%;
          background:#0a0a0a;
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
        }

        /* Gradient scrim for text legibility */
        .yat-back-scrim{
          position:absolute;
          inset:0;
          background:linear-gradient(
            to top,
            rgba(0,0,0,0.80) 0%,
            rgba(0,0,0,0.50) 35%,
            rgba(0,0,0,0.0) 65%
          );
          pointer-events:none;
        }

        /* Metadata overlay — bottom-left of hero */
        .yat-back-meta{
          position:absolute;
          bottom:0; left:0; right:0;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(5px,2cqi,10px);
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.4cqi,2px);
        }
        .ybm-name{
          font:700 clamp(11px,5cqi,22px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 4px rgba(0,0,0,.7);
        }
        .ybm-team{
          font:600 clamp(6px,2.6cqi,12px)/1.3 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.95);
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
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
