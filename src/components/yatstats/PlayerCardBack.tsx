// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card.
//
// APPROVED LAYOUT:
// - Cardboard texture covers the full card face.
// - A 4-sided dark inset border frames the inner content area.
// - Hero image sits inside the border as an inset panel.
// - Metadata is anchored top-left over the hero image.
// - Team name, org/conference, position/level/status, and B/T + H/W render as separate lines.
// - FunZone uses black text on light cardboard.
// - No-image fallback uses YatCrest screened back on cardboard.
//
// IMAGE ROLE RULES:
// - players/back/{playerid}.jpg -> back-card hero action image.
// - players/now/{playerid}.jpg -> not used here.
// - players/then/{playerid}.jpg -> front-card only.
// - headshotUrl prop -> not used as back hero.
//
// RESPONSIVE SYSTEM:
// - container-type:inline-size on .yat-back-cq.
// - All sizing uses cqi (card-width-relative), not vw.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import FeaturedTeamNewsInjector from "@/components/yatstats/FeaturedTeamNewsInjector";
import FlipCardLiveVideoInjector from "@/components/yatstats/FlipCardLiveVideoInjector";
import PlayerSevenDaySnapshot from "@/components/yatstats/PlayerSevenDaySnapshot";
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

function isBlankStat(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    String(value).trim() === "--"
  );
}

function fmtFixedStat(value: unknown, digits = 2): string {
  if (isBlankStat(value)) return "--";

  const num = Number(value);
  if (!Number.isFinite(num)) return String(value).trim();

  return num.toFixed(digits);
}

function fmtWinLoss(wins: unknown, losses: unknown): string {
  if (isBlankStat(wins) || isBlankStat(losses)) return "--";
  return `${String(wins).trim()}-${String(losses).trim()}`;
}

interface RawStatBucket {
  label?: unknown;
  type?: unknown;
  stats?: Record<string, unknown> | null;
}

interface FunZoneStatBucket {
  label: string;
  stats: { k: string; v: string }[];
}

function asBucketArray(value: unknown): RawStatBucket[] {
  if (Array.isArray(value)) return value as RawStatBucket[];

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as RawStatBucket[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeBucketFamily(value: unknown): string {
  const raw = asText(value).toUpperCase();

  if (raw.includes("MLB") || raw.includes("MAJOR")) return "MLB";
  if (raw.includes("MILB") || raw.includes("MINOR") || raw.includes("TRIPLE") || raw.includes("DOUBLE") || raw.includes("HIGH-A") || raw.includes("LOW-A") || raw.includes("ROOKIE")) return "MiLB";
  if (raw.includes("COLLEGE") || raw.includes("NCAA") || raw.includes("NAIA") || raw.includes("JUCO") || raw.includes("NJCAA")) return "College";

  const cleaned = raw
    .replace(/2026/g, "")
    .replace(/SEASON/g, "")
    .replace(/CAREER/g, "")
    .replace(/BATTING/g, "")
    .replace(/PITCHING/g, "")
    .replace(/STATS/g, "")
    .replace(/TOTALS/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Stats";
}

function bucketLabel(bucket: RawStatBucket, fallback: string, has2026Stats: boolean): string {
  const family = normalizeBucketFamily(bucket.label || fallback);
  return has2026Stats ? `${family} 2026` : `${family} CAREER`;
}

function buildBatterBucketStats(stats: Record<string, unknown>) {
  return [
    { k: "AVG", v: fmt("AVG", stats.avg) },
    { k: "AB", v: fmt("AB", stats.ab) },
    { k: "H", v: fmt("H", stats.h) },
    { k: "OBP", v: fmt("OBP", stats.obp) },
    { k: "R", v: fmt("R", stats.r) },
    { k: "BB", v: fmt("BB", stats.bb) },
    { k: "SLG", v: fmt("SLG", stats.slg) },
    { k: "HR", v: fmt("HR", stats.hr) },
    { k: "RBI", v: fmt("RBI", stats.rbi) },
    { k: "OPS", v: fmt("OPS", stats.ops) },
    { k: "SB", v: fmt("SB", stats.sb) },
    { k: "GP", v: fmt("GP", stats.g) },
  ];
}

function buildPitcherBucketStats(stats: Record<string, unknown>) {
  return [
    { k: "IP", v: fmt("IP", stats.ip) },
    { k: "ER", v: fmt("ER", stats.er) },
    { k: "ERA", v: fmtFixedStat(stats.era, 2) },
    { k: "K", v: fmt("K", stats.ko) },
    { k: "BB", v: fmt("BB", stats.bb) },
    { k: "WHIP", v: fmtFixedStat(stats.whip, 2) },
    { k: "K/9", v: fmtFixedStat(stats.so9, 2) },
    { k: "BB/9", v: fmtFixedStat(stats.bb9, 2) },
    { k: "K/BB", v: fmtFixedStat(stats.so_bb, 2) },
    { k: "W-L", v: fmtWinLoss(stats.w, stats.l) },
    { k: "SAVES", v: fmt("SV", stats.saves) },
    { k: "GP", v: fmt("GP", stats.pg ?? stats.g) },
  ];
}

function buildFunZoneBuckets(
  buckets: RawStatBucket[],
  fallbackLabel: string,
  fallbackStats: { k: string; v: string }[],
  expectedType: "batting" | "pitching",
  has2026Stats: boolean
): FunZoneStatBucket[] {
  const mapped = buckets
    .filter((bucket) => !bucket.type || String(bucket.type).toLowerCase() === expectedType)
    .map((bucket) => {
      const stats = bucket.stats || {};
      return {
        label: bucketLabel(bucket, fallbackLabel, has2026Stats),
        stats: expectedType === "pitching"
          ? buildPitcherBucketStats(stats)
          : buildBatterBucketStats(stats),
      };
    })
    .filter((bucket) => bucket.stats.some((item) => item.v !== "--"));

  if (mapped.length > 1) return mapped;
  if (mapped.length === 1) return [{ label: fallbackLabel, stats: mapped[0].stats }];

  return [{ label: fallbackLabel, stats: fallbackStats }];
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
  const statBarLabel = has2026Stats ? "2026 SEASON STATS" : "CAREER STATS";

  const batterStats = [
    { k: "AVG", v: fmt("AVG", p.avg) },
    { k: "AB", v: fmt("AB", p.ab) },
    { k: "H", v: fmt("H", p.h) },
    { k: "OBP", v: fmt("OBP", p.obp) },
    { k: "R", v: fmt("R", p.r) },
    { k: "BB", v: fmt("BB", p.bb) },
    { k: "SLG", v: fmt("SLG", p.slg) },
    { k: "HR", v: fmt("HR", p.hr) },
    { k: "RBI", v: fmt("RBI", p.rbi) },
    { k: "OPS", v: fmt("OPS", p.ops) },
    { k: "SB", v: fmt("SB", p.sb) },
    { k: "GP", v: fmt("GP", p.g) },
  ];

  const pitcherStats = [
    { k: "IP", v: fmt("IP", p.ip) },
    { k: "ER", v: fmt("ER", p.er) },
    { k: "ERA", v: fmtFixedStat(p.era, 2) },
    { k: "K", v: fmt("K", p.ko) },
    { k: "BB", v: fmt("BB", p.bb) },
    { k: "WHIP", v: fmtFixedStat(p.whip, 2) },
    { k: "K/9", v: fmtFixedStat(p.so9, 2) },
    { k: "BB/9", v: fmtFixedStat(p.bb9, 2) },
    { k: "K/BB", v: fmtFixedStat(p.so_bb, 2) },
    { k: "W-L", v: fmtWinLoss(p.w, p.l) },
    { k: "SAVES", v: fmt("SV", p.saves) },
    { k: "GP", v: fmt("GP", p.pg ?? p.g) },
  ];
  const stats = isPitcher ? pitcherStats : batterStats;

  const seasonPitchingBuckets = asBucketArray(p.season_pitching_buckets);
  const seasonBattingBuckets = asBucketArray(p.season_batting_buckets);
  const careerPitchingBuckets = asBucketArray(p.career_pitching_buckets);
  const careerBattingBuckets = asBucketArray(p.career_batting_buckets);

  const statBuckets =
    has2026Stats && isPitcher
      ? buildFunZoneBuckets(seasonPitchingBuckets, statBarLabel, pitcherStats, "pitching", true)
      : has2026Stats
        ? buildFunZoneBuckets(seasonBattingBuckets, statBarLabel, batterStats, "batting", true)
        : isPitcher
          ? buildFunZoneBuckets(careerPitchingBuckets, statBarLabel, pitcherStats, "pitching", false)
          : buildFunZoneBuckets(careerBattingBuckets, statBarLabel, batterStats, "batting", false);

  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  // Same sourced-fact override as PlayerCardFront.tsx — keep the card
  // back consistent with the front rather than flipping to a stale team
  // name. See scripts/apply-mlb-transaction-status.ts and
  // scripts/refresh-flip-card-front-stage-from-mlb.ts (flagRosterAbsences).
  const rawTeamName = asText(p.current_team_name);
  const teamAffiliationStatus = asText(p.team_affiliation_status).toUpperCase();
  const lastTransactionType = asText(p.last_transaction_type);
  const lastTransactionTeamName = asText(p.last_transaction_team_name);
  const lastTransactionDateRaw = p.last_transaction_date;
  const lastTransactionDateIso =
    lastTransactionDateRaw instanceof Date
      ? lastTransactionDateRaw.toISOString()
      : asText(lastTransactionDateRaw);
  const lastTransactionDateLabel = (() => {
    if (!lastTransactionDateIso) return "";
    const parsed = new Date(lastTransactionDateIso);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  })();

  const isSourcedDeparture =
    (teamAffiliationStatus === "FREE AGENT" || teamAffiliationStatus === "RETIRED") &&
    !!lastTransactionType;
  const isUnconfirmedAbsence = !isSourcedDeparture && teamAffiliationStatus === "UNCONFIRMED";

  const teamName = isSourcedDeparture
    ? lastTransactionType.toUpperCase()
    : isUnconfirmedAbsence
      ? "STATUS UNCONFIRMED"
      : rawTeamName;

  const orgConf = isSourcedDeparture
    ? [lastTransactionTeamName, lastTransactionDateLabel].filter(Boolean).join(" — ")
    : isUnconfirmedAbsence
      ? (rawTeamName ? `Last known: ${rawTeamName}` : "")
      : asText(p.current_org_or_conference_name);

  const posLevelStatus = [
    asText(p.position),
    asText(p.level_label) || asText(p.level),
    isSourcedDeparture
      ? teamAffiliationStatus
      : isUnconfirmedAbsence
        ? "UNCONFIRMED"
        : asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : ""),
  ].filter(Boolean).join(" - ");

  const bats = asText(p.bats);
  const throws_ = asText(p.throws);
  const height = asText(p.height);
  const weight = asText(p.weight);
  const btPart = bats && throws_ ? `B/T ${bats}/${throws_}` : "";
  const hwPart = height && weight ? `${height} / ${weight}` : height || weight ? `${height}${weight}` : "";
  const btHw = [btPart, hwPart].filter(Boolean).join(" - ");

  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;

  const noiseSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.72 0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0.18'/></filter><rect width='200' height='200' filter='url(#n)' opacity='0.55'/></svg>`;
  const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")` as string;

  return (
    <div className="yat-face yat-back yat-back-cq" data-player-card-id={imageId}>
      <FlipCardLiveVideoInjector displayName={displayName} teamName={teamName} />
      <FeaturedTeamNewsInjector player={p} />
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

          <PlayerSevenDaySnapshot playerId={imageId} displayName={displayName} profileHref={profileHref} />

          <FunZone
            player={p}
            isPitcher={isPitcher}
            isAllTime={isAllTime ?? false}
            resolvedHsid={resolvedHsid}
            stats={stats}
            statBarLabel={statBarLabel}
            statBuckets={statBuckets}
            displayName={displayName}
          />
        </div>
      </div>

      <style>{`
        .yat-back-cq{ container-type:inline-size; container-name:yat-back; }
        .yat-back-texture{ width:100%; height:100%; position:relative; overflow:hidden; background-color:#c2b9ae; background-image:repeating-linear-gradient(168deg,transparent 0px,transparent 3px,rgba(255,255,255,0.05) 3px,rgba(255,255,255,0.05) 4px),repeating-linear-gradient(78deg,transparent 0px,transparent 5px,rgba(0,0,0,0.04) 5px,rgba(0,0,0,0.04) 6px); }
        .yat-back-texture::before{ content:""; position:absolute; inset:0; background-image:${noiseUrl}; background-size:200px 200px; background-repeat:repeat; mix-blend-mode:multiply; opacity:0.5; pointer-events:none; z-index:0; }
        .yat-back-inner{ position:relative; z-index:1; display:flex; flex-direction:column; height:calc(100% - clamp(4px,2cqi,10px) * 2); margin:clamp(4px,2cqi,10px); border:clamp(1.5px,0.7cqi,3px) solid rgba(30,22,14,0.65); border-radius:clamp(2px,1cqi,5px); overflow:hidden; }
        .yat-back-hero{ display:block; text-decoration:none; overflow:hidden; flex-shrink:1; aspect-ratio:20/7; min-height:clamp(60px,28cqi,155px); max-height:clamp(85px,40cqi,215px); width:100%; background:#c2b9ae; position:relative; }
        .yat-back-img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:top center; display:block; z-index:1; }
        .yat-back-hero-fallback{ position:absolute; inset:0; z-index:0; background-color:#c2b9ae; background-image:url("${YATCREST_URL}"); background-repeat:no-repeat; background-position:center center; background-size:55% auto; opacity:0.22; }
        .yat-back-scrim{ position:absolute; inset:0; z-index:2; background:linear-gradient(to right,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.55) 35%,rgba(0,0,0,0.20) 60%,rgba(0,0,0,0.0) 80%); pointer-events:none; }
        .yat-back-meta{ position:absolute; top:0; left:0; right:0; z-index:3; padding:clamp(4px,1.8cqi,10px) clamp(5px,2.2cqi,12px) clamp(5px,2cqi,10px); display:flex; flex-direction:column; gap:clamp(0px,.5cqi,3px); }
        .ybm-name{ font:700 clamp(11px,5cqi,22px)/1.1 "Bebas Neue",sans-serif; letter-spacing:.04em; color:#fff; text-transform:uppercase; text-shadow:0 1px 4px rgba(0,0,0,.7); }
        .ybm-team{ font:600 clamp(6px,2.6cqi,12px)/1.25 Oswald,sans-serif; letter-spacing:.05em; color:rgba(255,255,255,.95); text-transform:uppercase; text-shadow:0 1px 3px rgba(0,0,0,.6); }
        .ybm-org{ font:600 clamp(5.5px,2.4cqi,11px)/1.25 Oswald,sans-serif; letter-spacing:.05em; color:rgba(255,255,255,.90); text-transform:uppercase; text-shadow:0 1px 3px rgba(0,0,0,.6); }
        .ybm-pos,.ybm-bthw{ font:400 clamp(5px,2.1cqi,9px)/1.35 Oswald,sans-serif; letter-spacing:.04em; color:rgba(255,255,255,.80); text-transform:uppercase; text-shadow:0 1px 2px rgba(0,0,0,.5); }
      `}</style>
    </div>
  );
}
