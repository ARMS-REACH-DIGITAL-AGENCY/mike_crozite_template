// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.
//
// LAYOUT (matches approved screenshot 51574):
//   ┌─────────────────────────────────────┐
//   │  HERO IMAGE BAND (image only)       │  ← aspect-ratio 20:7, no text overlay
//   ├─────────────────────────────────────┤
//   │  METADATA BAND (dark bg, 6 lines)   │  ← separate band, NOT overlaid on image
//   ├─────────────────────────────────────┤
//   │  FUNZONE (CTA + tabs + panel)       │  ← flex:1, protected
//   └─────────────────────────────────────┘
//
// IMAGE ROLE RULES:
//   - players/back/{playerid}.jpg  → back-card hero ACTION image (dedicated slot)
//   - players/now/{playerid}.jpg   → NOT used here
//   - players/then/{playerid}.jpg  → front-card only — NOT used here
//   - headshotUrl prop             → HEADSHOT role — NOT used as back hero
//   Falls back to silhouette if players/back/ image is missing.
//
// METADATA (6 lines, separate band below hero):
//   1. PLAYER NAME
//   2. Current Team | Pro Organization
//   3. POSITION · LEVEL · STATUS
//   4. B/T · H/W
//   5. Draft Information
//   6. Previous Colleges Attended (only when field is present)
//
// RESPONSIVE SYSTEM:
//   container-type:inline-size on the card back establishes a CQ context.
//   All sizing uses cqi so values are relative to CARD WIDTH, not viewport.
//   Yield order: hero → meta → CTA strip → tab strip → content panel (protected last).
//
// CARDBOARD TEXTURE (proof-of-concept — warm stone/grey):
//   Pure CSS + inline SVG noise filter — no image assets required.
//   Three layers: SVG feTurbulence grain (::before) + diagonal fibre lines + solid base.
//   Hero and meta bands paint over the texture with their own bg.
//   FunZone inherits the texture through its transparent background.

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

  // ── Metadata — 6 lines, pre-computed as serializable strings ──────────────

  // Line 1: Player Name
  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  // Line 2: Current Team | Pro Organization
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

  // Line 6: Previous Colleges (forward-compatible — renders when field is added)
  const collegeListRaw = p.college_list || p.prev_colleges || p.college_history || p.colleges_attended || null;
  const collegeLine: string = (() => {
    if (!collegeListRaw) return "";
    if (Array.isArray(collegeListRaw)) return (collegeListRaw as unknown[]).map(asText).filter(Boolean).join(" · ");
    return asText(collegeListRaw);
  })();

  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;

  // ── Cardboard texture: SVG noise filter encoded as data URI ───────────────
  // feTurbulence generates organic grain; feColorMatrix desaturates + tints warm stone.
  // Rendered via ::before pseudo-element with mix-blend-mode:multiply.
  const noiseSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.72 0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0.18'/></filter><rect width='200' height='200' filter='url(#n)' opacity='0.55'/></svg>`;
  const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")` as string;

  return (
    <div className="yat-face yat-back yat-back-cq">
      <div className="yat-back-content">

        {/*
          ── Band 1: Hero image only ──────────────────────────────────────
          No text overlay. No scrim. Pure image fill.
          Links to player profile page.
          aspect-ratio:20/7 — height = card-width × 35%.
          flex-shrink:1 — yields vertical space first.
        */}
        <a href={profileHref} className="yat-back-hero" aria-label={`View ${displayName}'s profile`}>
          <SafeImage
            src={backImageSrc}
            alt={displayName}
            className="yat-back-img"
            placeholderSrc={backSilhouetteUrl}
          />
        </a>

        {/*
          ── Band 2: Metadata band ────────────────────────────────────────
          Separate dark-background band below the hero image.
          All 6 lines. flex-shrink:1 — yields before FunZone does.
          Font sizes use cqi so they scale with card width.
        */}
        <div className="yat-back-meta">
          {displayName && <div className="ybm-name">{displayName}</div>}
          {teamLine && <div className="ybm-team">{teamLine}</div>}
          {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
          {btHw && <div className="ybm-bthw">{btHw}</div>}
          {draft && <div className="ybm-draft">{draft}</div>}
          {collegeLine && <div className="ybm-college">{collegeLine}</div>}
        </div>

        {/*
          ── Band 3: FunZone ──────────────────────────────────────────────
          CTA strip + six-tab interactive area.
          flex:1 min-height:0 — gets all remaining vertical space.
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
           CARDBOARD TEXTURE SYSTEM
           Proof-of-concept: warm stone / grey (like recycled printed card stock).
           Three CSS background layers on yat-back-content:
             1. SVG feTurbulence noise via ::before pseudo-element (organic grain)
             2. Repeating diagonal fibre lines (directional paper texture)
             3. Solid cardboard base colour (bottom layer)
           Hero and meta bands paint over this with their own opaque bg.
           FunZone sits above the texture via z-index, inheriting the look.
        ───────────────────────────────────────────────────────────────── */

        /* Card face shell — flex column, fills full card height */
        .yat-back-content{
          display:flex;
          flex-direction:column;
          height:100%;
          overflow:hidden;
          position:relative;

          /* ── Cardboard base colour: warm stone grey ──
             HSL 38 12% 72% ≈ warm, slightly yellowish grey — recycled card stock */
          background-color:#b8b0a4;

          /* ── Fibre lines: two sets of near-parallel lines simulate pressed paper grain */
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

        /* ── Noise overlay via pseudo-element ──
           SVG feTurbulence grain composited with multiply blend mode.
           pointer-events:none so it never blocks clicks or taps. */
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

        /* Ensure content bands sit above the noise pseudo-element */
        .yat-back-hero,
        .yat-back-meta{
          position:relative;
          z-index:1;
        }

        /* ── Band 1: Hero image ──────────────────────────────────────── */
        /* aspect-ratio:20/7 = height is always 35% of card width.
           flex-shrink:1 — yields vertical space first.
           No text, no overlay, no scrim. */
        .yat-back-hero{
          display:block;
          text-decoration:none;
          overflow:hidden;
          flex-shrink:1;
          aspect-ratio:20/7;
          min-height:clamp(44px,22cqi,100px);
          max-height:clamp(60px,32cqi,150px);
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

        /* ── Band 2: Metadata band ───────────────────────────────────── */
        /* Separate dark band below the hero. flex-shrink:1 — yields before FunZone.
           All font sizes and spacing use cqi for card-relative scaling.
           Semi-transparent dark bg so a hint of cardboard peeks at the border edge. */
        .yat-back-meta{
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.5cqi,2px);
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(3px,1.5cqi,8px);
          background:rgba(20,18,16,0.96);
          border-bottom:1px solid rgba(184,176,164,0.25);
          flex-shrink:1;
        }

        /* Line 1: Player Name */
        .ybm-name{
          font:700 clamp(10px,4.5cqi,18px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#fff;
          text-transform:uppercase;
        }
        /* Line 2: Team / Org */
        .ybm-team{
          font:600 clamp(6px,2.5cqi,11px)/1.3 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.9);
          text-transform:uppercase;
        }
        /* Lines 3–5: secondary meta */
        .ybm-pos,
        .ybm-bthw,
        .ybm-draft{
          font:400 clamp(5px,2cqi,9px)/1.35 Oswald,sans-serif;
          letter-spacing:.04em;
          color:rgba(255,255,255,.65);
          text-transform:uppercase;
        }
        /* Line 6: Previous colleges */
        .ybm-college{
          font:300 clamp(5px,1.8cqi,8px)/1.3 Oswald,sans-serif;
          letter-spacing:.03em;
          color:rgba(255,255,255,.45);
          font-style:italic;
        }
      `}</style>
    </div>
  );
}
