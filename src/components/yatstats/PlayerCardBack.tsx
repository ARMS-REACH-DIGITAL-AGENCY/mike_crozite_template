// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import SportsBlazeFlipBoxscore from "@/components/yatstats/SportsBlazeFlipBoxscore";
import { fmt, parseDraft } from "@/lib/playerUtils";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function getPlayerBackImageUrl(imageId: string): string {
  return `${S3_BASE}/players/back/${imageId}.jpg`;
}

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

  const has2026Stats = p.has_2026_stats === true;
  const careerBucketLabel = String(p.career_bucket_label || "CAREER").toUpperCase();
  const statYear = isPitcher ? p.pitch_year : p.stat_year;

  const statBarLabel = has2026Stats
    ? `${statYear ? `${statYear} ` : "2026 "}${isPitcher ? "PITCHING" : "BATTING"}`
    : `${careerBucketLabel} ${isPitcher ? "PITCHING" : "BATTING"}`;

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

  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();
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

  const noiseSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.72 0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0.18'/></filter><rect width='200' height='200' filter='url(#n)' opacity='0.55'/></svg>`;
  const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")` as string;

  return (
    <div className="yat-face yat-back yat-back-cq">
      <div className="yat-back-texture">
        <div className="yat-back-inner">
          <a href={profileHref} className="yat-back-hero" aria-label={`View ${displayName}'s profile`}>
            <SafeImage
              src={backImageSrc}
              alt={displayName}
              className="yat-back-img"
              placeholderSrc={YATCREST_URL}
            />
            <div className="yat-back-hero-fallback" aria-hidden="true" />
            <div className="yat-back-scrim" aria-hidden="true" />
            <div className="yat-back-meta">
              {displayName && <div className="ybm-name">{displayName}</div>}
              {teamName && <div className="ybm-team">{teamName}</div>}
              {orgConf && <div className="ybm-org">{orgConf}</div>}
              {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
              {btHw && <div className="ybm-bthw">{btHw}</div>}
            </div>
          </a>

          <SportsBlazeFlipBoxscore playerName={displayName} playerTeam={teamName} />

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
        .yat-back-cq{
          container-type:inline-size;
          container-name:yat-back;
        }
        .yat-back-texture{
          width:100%;
          height:100%;
          position:relative;
          overflow:hidden;
          background-color:#c2b9ae;
          background-image:
            repeating-linear-gradient(168deg, transparent 0px, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px),
            repeating-linear-gradient(78deg, transparent 0px, transparent 5px, rgba(0,0,0,0.04) 5px, rgba(0,0,0,0.04) 6px);
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
        .yat-back-inner{
          position:relative;
          z-index:1;
          display:flex;
          flex-direction:column;
          height:calc(100% - clamp(4px,2cqi,10px) * 2);
          margin:clamp(4px,2cqi,10px);
          border:clamp(1.5px,0.7cqi,3px) solid rgba(30,22,14,0.65);
          border-radius:clamp(2px,1cqi,5px);
          overflow:hidden;
        }
        .yat-back-hero{
          display:block;
          text-decoration:none;
          overflow:hidden;
          flex-shrink:1;
          aspect-ratio:20/7;
          min-height:clamp(56px,24cqi,128px);
          max-height:clamp(72px,32cqi,170px);
          width:100%;
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
        .yat-back-scrim{
          position:absolute;
          inset:0;
          z-index:2;
          background:linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.20) 60%, rgba(0,0,0,0.0) 80%);
          pointer-events:none;
        }
        .yat-back-meta{
          position:absolute;
          top:0; left:0; right:0;
          z-index:3;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(5px,2cqi,10px);
          display:flex;
          flex-direction:column;
          gap:clamp(0px,.5cqi,3px);
        }
        .ybm-name{
          font:700 clamp(11px,5cqi,22px)/1.1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#fff;
          text-transform:uppercase;
          text-shadow:0 1px 4px rgba(0,0,0,.7);
        }
        .ybm-team{
          font:600 clamp(6px,2.6cqi,12px)/1.25 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.95);
          text-transform:uppercase;
          text-shadow:0 1px 3px rgba(0,0,0,.6);
        }
        .ybm-org{
          font:600 clamp(5.5px,2.4cqi,11px)/1.25 Oswald,sans-serif;
          letter-spacing:.05em;
          color:rgba(255,255,255,.90);
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
