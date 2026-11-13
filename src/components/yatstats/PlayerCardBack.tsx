import "./PlayerCardBack.css";
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

import PlayerCardBackHero from "@/components/yatstats/PlayerCardBackHero";
import FunZone from "@/components/yatstats/FunZone";
import PlayerSevenDaySnapshot from "@/components/yatstats/PlayerSevenDaySnapshot";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { resolvePlayerDisplay } from "@/lib/playerDisplay";
import { familyEvidence, orderByPrimaryStatFamily, primaryStatFamily } from "@/lib/flipCardStatSelection";


// Card-size WebP copy of the back photo (Build Web Cutouts job, 800px
// wide): ~15-30KB instead of the ~1MB original, which stays as the
// fallback until the job has made the copy.

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
  family?: "batting" | "pitching";
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
  if (raw.includes("MILB") || raw.includes("MINOR") || raw.includes("TRIPLE") || raw.includes("DOUBLE") || raw.includes("HIGH-A") || raw.includes("SINGLE-A") || raw.includes("LOW-A") || raw.includes("ROOKIE")) return "MiLB";
  if (raw.includes("COLLEGE") || raw.includes("NCAA") || raw.includes("NAIA") || raw.includes("JUCO") || raw.includes("NJCAA") || raw.includes("CCCAA") || raw.includes("NWAC")) return "College";

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
  if (mapped.length === 1) return mapped; // Keep the actual level label, even without level choices.

  return [{ label: fallbackLabel, stats: fallbackStats }];
}

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  headshotUrl: string | null;
  isAllTime?: boolean;
  /** School's real canonical URL (school_success.microsite_url), for FunZone's share links. */
  shareBaseUrl?: string | null;
  /** School display name (school_success.hsname), for FunZone's share message. */
  schoolName?: string | null;
  /** School location (school_success.hslocation), for FunZone's share message. */
  schoolLocation?: string | null;
  deferScheduleSnapshot?: boolean;
}

export default function PlayerCardBack({ player: p, resolvedHsid, isAllTime, shareBaseUrl, schoolName, schoolLocation, deferScheduleSnapshot = false }: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const imageId = String(p.playerid || "");
  const slug = String(p.slug || "");
  void draft;

  const has2026Stats = p.has_2026_stats === true;
  const seasonStatsPending = !isAllTime && p.season_stats_pending === true;
  const statBarLabel = seasonStatsPending
    ? "2026 STATS PENDING"
    : has2026Stats ? "2026 SEASON STATS" : "CAREER STATS";

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
  // Select each stat family independently for every player; never suppress
  // one because the latest year happened to be a pitching appearance.
  const seasonPitchingBuckets = asBucketArray(p.season_pitching_buckets);
  const seasonBattingBuckets = asBucketArray(p.season_batting_buckets);
  const careerPitchingBuckets = asBucketArray(p.career_pitching_buckets);
  const careerBattingBuckets = asBucketArray(p.career_batting_buckets);
  const hittingSource = has2026Stats ? seasonBattingBuckets : careerBattingBuckets;
  const pitchingSource = has2026Stats ? seasonPitchingBuckets : careerPitchingBuckets;
  const hitting = familyEvidence(hittingSource, "batting", { games: p.g, appearances: p.ab });
  const pitching = familyEvidence(pitchingSource, "pitching", { games: p.pg, appearances: p.ip });
  const primaryFamily = primaryStatFamily({
    position: p.position,
    legacyIsPitcher: isPitcher,
    battingGames: hitting.games,
    pitchingGames: pitching.games,
  });
  const primaryPitcher = primaryFamily === "pitching";
  const stats = primaryPitcher ? pitcherStats : batterStats;
  const battingTabs: FunZoneStatBucket[] = hitting.present
    ? buildFunZoneBuckets(hittingSource, statBarLabel, batterStats, "batting", has2026Stats)
        .map((bucket) => ({ ...bucket, family: "batting" }))
    : [];
  const pitchingTabs: FunZoneStatBucket[] = pitching.present
    ? buildFunZoneBuckets(pitchingSource, statBarLabel, pitcherStats, "pitching", has2026Stats)
        .map((bucket) => ({ ...bucket, family: "pitching" }))
    : [];
  // Family selection is an outer pair of tabs; existing per-level buckets
  // remain accessible within each family (MLB/MiLB/College, etc.).
  const statBuckets: FunZoneStatBucket[] = battingTabs.length || pitchingTabs.length
    ? orderByPrimaryStatFamily<FunZoneStatBucket>([...battingTabs, ...pitchingTabs], primaryFamily)
    : [{ label: statBarLabel, stats }];

  const displayName = asText(p.display_name) || `${asText(p.firstname)} ${asText(p.lastname)}`.trim();

  const display = resolvePlayerDisplay(p);
  const posLevelStatus = [
    asText(p.position),
    display.levelLabel,
    display.statusLabel,
  ].filter(Boolean).join(" - ");

  const bats = asText(p.bats);
  const throws_ = asText(p.throws);
  const height = asText(p.height);
  const weight = asText(p.weight);
  const btPart = bats && throws_ ? `B/T ${bats}/${throws_}` : "";
  const hwPart = height && weight ? `${height} / ${weight}` : height || weight ? `${height}${weight}` : "";
  const btHw = [btPart, hwPart].filter(Boolean).join(" - ");

  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;


  return (
    <div className="yat-face yat-back yat-back-cq" data-player-card-id={imageId}>
      <div className="yat-back-texture">
        <div className="yat-back-inner">
          <PlayerCardBackHero
            playerId={imageId}
            displayName={displayName}
            profileHref={profileHref}
            teamName={display.teamName}
            orgConf={display.orgConferenceName}
            posLevelStatus={posLevelStatus}
            btHw={btHw}
          />

          <FunZone
            player={p}
            isPitcher={primaryPitcher}
            isAllTime={isAllTime ?? false}
            resolvedHsid={resolvedHsid}
            stats={seasonStatsPending ? stats.map((stat) => ({ ...stat, v: "—" })) : stats}
            statBarLabel={statBarLabel}
            statBuckets={seasonStatsPending ? [] : statBuckets}
            displayName={displayName}
            shareBaseUrl={shareBaseUrl}
            schoolName={schoolName}
            schoolLocation={schoolLocation}
            scheduleSnapshot={deferScheduleSnapshot ? undefined :
              <PlayerSevenDaySnapshot playerId={imageId} displayName={displayName} profileHref={profileHref} />
            }
            lazySchedulePlayerId={deferScheduleSnapshot ? imageId : undefined}
          />
        </div>
      </div>

      
    </div>
  );
}
