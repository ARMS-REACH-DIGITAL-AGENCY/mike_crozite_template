// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// YAT?STATS — Player Profile Page
// Dynamic route: /{hsid}/player/{playerId}/{slug}

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import AccountDrawer from "@/components/AccountDrawer";
import GlobalSearchModal from "@/components/yatstats/GlobalSearchModal";
import { toPlayerSlug } from "@/lib/slug";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import {
  getSchoolByHsid,
  getSchoolByUrl,
  getPlayerById,
  getPlayerSchool,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
  getTeamSchedule,
  getPlayerBattingGameLog,
  getPlayerPitchingGameLog,
  getTeamContext,
} from "@/lib/db";
import { formatSchoolName } from "@/lib/playerUtils";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}): Promise<Metadata> {
  try {
    const { hsid, playerId, slug } = await params;
    const idNum = parseInt(playerId, 10);
    if (!/^\d+$/.test(playerId) || idNum <= 0) {
      return { title: "Player Profile | YAT?STATS", description: "Player profile on YAT?STATS." };
    }
    const safePlayerId = String(idNum);
    const player = await getPlayerById(safePlayerId);
    const playerName = player
      ? `${player.firstname || ""} ${player.lastname || ""}`.trim()
      : "Player";
    // Resolve school for canonical URL
    const playerSchoolLink = await getPlayerSchool(safePlayerId);
    const playerHsid = playerSchoolLink?.hsid ? String(playerSchoolLink.hsid) : null;
    let school: Record<string, unknown> | null = null;
    if (playerHsid) school = (await getSchoolByHsid(playerHsid)) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
    const resolvedHsid = String(school?.hsid ?? hsid);
    const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
    const canonicalSlug = player ? toPlayerSlug(player.firstname, player.lastname) : slug;
    const canonical = `${canonicalBase}/player/${safePlayerId}/${canonicalSlug}`;
    return {
      title: `${playerName.toUpperCase()} | YAT?STATS - Player Profile`,
      description: `Full career stats and profile for ${playerName}.`,
      alternates: { canonical },
    };
  } catch {
    return {
      title: "Player Profile | YAT?STATS",
      description: "Player profile on YAT?STATS.",
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: format stat value
// ---------------------------------------------------------------------------
function fmt(v: any, decimals = 0): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (decimals > 0) return n.toFixed(decimals);
  return String(n);
}

function fmtAvg(v: any): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(3).replace(/^0/, "");
}

// ---------------------------------------------------------------------------
// Sponsor banner resolver — returns a per-player banner or null for the default.
// Future: replace this with a DB lookup keyed by playerId.
// ---------------------------------------------------------------------------
type SponsorBanner = { name: string; url: string; label?: string };
function resolveSponsorBanner(_playerId: string): SponsorBanner | null {
  return null;
}

type BattingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  ab?: any;
  r?: any;
  h?: any;
  "2b"?: any;
  "3b"?: any;
  hr?: any;
  rbi?: any;
  sb?: any;
  bb?: any;
  so?: any;
  avg?: any;
  obp?: any;
  slg?: any;
  ops?: any;
  draft_info?: string;
};

type PitchingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  gs?: any;
  w?: any;
  l?: any;
  saves?: any;
  ip?: any;
  er?: any;
  ko?: any;
  bb?: any;
  era?: any;
  whip?: any;
  k9?: any;
  kbb?: any;
  draft_info?: string;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}) {
  const { hsid, playerId, slug } = await params;

  // Validate that playerId is a positive integer — reject non-numeric params early.
  const playerIdNum = parseInt(playerId, 10);
  if (!/^\d+$/.test(playerId) || playerIdNum <= 0) {
    notFound();
  }
  const safePlayerId = String(playerIdNum);

  // Resolve school from subdomain host header
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Get school from player's hsid linkage as primary, host and URL params as fallback
  const playerSchoolLink = await getPlayerSchool(safePlayerId);
  const playerHsid = playerSchoolLink?.hsid ? String(playerSchoolLink.hsid) : null;
  let school: Record<string, unknown> | null = null;
  if (playerHsid) school = (await getSchoolByHsid(playerHsid)) as Record<string, unknown> | null;
  if (!school && host) school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
  if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school?.hsid ?? hsid);

  // Redirect numeric hsid player paths (/5004/player/...) to the school's custom domain
  // when one exists. Skip on Vercel preview deployments so previews remain accessible.
  const micrositeUrl = (school as Record<string, unknown>).microsite_url as string | undefined;
  const isNumericHsid = /^\d+$/.test(hsid);
  const isPreview = host.includes("vercel.app") || host.includes("localhost");
  if (micrositeUrl && isNumericHsid && !isPreview) {
    const base = micrositeUrl.replace(/\/$/, "");
    permanentRedirect(`${base}/player/${safePlayerId}/${slug}`);
  }

  const schoolName = formatSchoolName(String(school.hsname || ""));
  const location = String(school.hslocation || "").toUpperCase();

  // Resolve player
  const player = await getPlayerById(safePlayerId);
  if (!player) notFound();
  const canonicalSlug = toPlayerSlug(player.firstname, player.lastname);
  if (slug !== canonicalSlug) permanentRedirect(`/${hsid}/player/${safePlayerId}/${canonicalSlug}`);

  const playerSchool = playerSchoolLink;
  const [battingSeasons, pitchingSeasons, careerBatting, careerPitching] =
    (await Promise.all([
      getPlayerBattingStats(safePlayerId),
      getPlayerPitchingStats(safePlayerId),
      getPlayerCareerBatting(safePlayerId),
      getPlayerCareerPitching(safePlayerId),
    ])) as [BattingSeason[], PitchingSeason[], any, any];

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;
  const pos = player.position || "--";
  const ht = player.height || "--";
  const wt = player.weight || "--";
  const bt = `${player.bats || "-"}/${player.throws || "-"}`;
  const level = (player.career_highlevel || "--").toUpperCase();
  const college = player.college || "N/A";
  // draft_info and playyears don't exist in tbc_players_raw; derive from season stats
  const draftInfo =
    ([...battingSeasons, ...pitchingSeasons]).find((s) => s.draft_info)?.draft_info || "N/A";
  const playYears = "";

  // Determine if primarily a pitcher
  const isPitcher =
    pitchingSeasons.length > 0 &&
    (battingSeasons.length === 0 || pitchingSeasons.length >= battingSeasons.length);

  // Determine active status — "ACTIVE" without the year appended
  const latestYear = Math.max(
    ...battingSeasons.map((s: any) => Number(s.year) || 0),
    ...pitchingSeasons.map((s: any) => Number(s.year) || 0),
    0
  );
  const isActive = latestYear >= 2025;
  const statusLabel = isActive ? "ACTIVE" : "RETIRED";

  // Grad class from playyears
  const gcMatch = playYears.match(/\d{4}/);
  const gradClass = gcMatch ? gcMatch[0] : "--";

  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  // NOW image = .jpg, THEN image = .png
  const playerNowImg = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${safePlayerId}.jpg`;
  const playerThenImg = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${safePlayerId}.png`;

  // Player context line: TEAM · LEVEL from most recent season
  const mostRecentSeason = [...battingSeasons, ...pitchingSeasons]
    .sort((a: BattingSeason | PitchingSeason, b: BattingSeason | PitchingSeason) => (Number(b.year) || 0) - (Number(a.year) || 0))[0] as BattingSeason | PitchingSeason | undefined;
  const ctxTeam = mostRecentSeason?.team_name || "";
  const ctxLevel = mostRecentSeason?.level ? String(mostRecentSeason.level).toUpperCase() : "";
  const playerContext = [ctxTeam, ctxLevel].filter(Boolean).join(" · ");

  // Current team_id for schedule lookup — most recent season's teamid
  const currentTeamId = (mostRecentSeason as any)?.teamid ? String((mostRecentSeason as any).teamid) : null;

  // Fetch org/conference for the current team (graceful — returns null if columns absent)
  const teamCtx = currentTeamId ? await getTeamContext(currentTeamId) : null;
  const ctxOrg = (teamCtx?.organization || '').toUpperCase().trim();
  const ctxConference = (teamCtx?.conference || '').toUpperCase().trim();
  // For the identity line: professional players use org, college players use conference
  const isCollegeLevel = ctxLevel.includes('NCAA') || ctxLevel.includes('JUCO') || ctxLevel === 'NAIA' || ctxLevel.includes('COLLEGE');
  const ctxSecondary = isCollegeLevel ? ctxConference : ctxOrg;

  // Derive unique colleges from NCAA/JUCO-level season entries (chronological)
  const ncaaSeasonsList = [...battingSeasons, ...pitchingSeasons]
    .filter((s: any) => {
      const lv = String(s.level || '').toUpperCase();
      return lv.includes('NCAA') || lv === 'JUCO' || lv.includes('COLLEGE') || lv === 'NAIA';
    })
    .sort((a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0));
  const uniqueColleges: string[] = [];
  for (const s of ncaaSeasonsList) {
    const tn = ((s as any).team_name || '').trim();
    if (tn && !uniqueColleges.includes(tn)) uniqueColleges.push(tn);
  }
  // Only show prior colleges not already shown in the current playing context line
  const collegesToShow = uniqueColleges.filter(col => col !== ctxTeam);

  // Current season stats — always target the current calendar year for active players.
  // Show blanks ("--") if the season hasn't started yet so the "2026 SEASON STATS" header
  // still appears rather than silently omitting the grid.
  const CURRENT_SEASON = new Date().getFullYear();
  const currentBatSeason = (isActive
    ? (battingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0]
      ?? battingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0])
    : null) as BattingSeason | null;
  const currentPitSeason = (isActive
    ? (pitchingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0]
      ?? pitchingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0])
    : null) as PitchingSeason | null;

  // Fetch team schedule + player game logs (all gracefully return [] if tables absent)
  const [teamSchedule, battingGameLog, pitchingGameLog] = currentTeamId
    ? await Promise.all([
        getTeamSchedule(currentTeamId),
        getPlayerBattingGameLog(safePlayerId, currentTeamId),
        getPlayerPitchingGameLog(safePlayerId, currentTeamId),
      ])
    : [[], [], []];

  // Build per-game stat lookup keyed by ISO date string
  const batStatsByDate = new Map<string, any>();
  for (const row of battingGameLog) {
    const d = row.game_date ? String(row.game_date).slice(0, 10) : null;
    if (d) batStatsByDate.set(d, row);
  }
  const pitStatsByDate = new Map<string, any>();
  for (const row of pitchingGameLog) {
    const d = row.game_date ? String(row.game_date).slice(0, 10) : null;
    if (d) pitStatsByDate.set(d, row);
  }

  // Sponsor banner — null = default site sponsor.
  // Future: query a sponsor_banners table by playerId to allow per-player sponsor overrides.
  // Using `let` so TypeScript doesn't narrow to `never` in the JSX truthy branch.
  // eslint-disable-next-line prefer-const
  const sponsorBanner = resolveSponsorBanner(safePlayerId);

  // Extract subdomain for GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomain = host.replace(`.${ROOT_DOMAIN}`, "").replace(ROOT_DOMAIN, "") || resolvedHsid;

  const navItems = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  // Build career stats grid for the profile
  const careerBattingGrid = careerBatting
    ? [
        { k: "AVG", v: fmtAvg(careerBatting.avg) },
        { k: "OBP", v: fmtAvg(careerBatting.obp) },
        { k: "HR", v: fmt(careerBatting.hr) },
        { k: "RBI", v: fmt(careerBatting.rbi) },
        { k: "H", v: fmt(careerBatting.h) },
        { k: "R", v: fmt(careerBatting.r) },
        { k: "SB", v: fmt(careerBatting.sb) },
        { k: "BB", v: fmt(careerBatting.bb) },
        { k: "AB", v: fmt(careerBatting.ab) },
        { k: "2B", v: fmt(careerBatting["2b"]) },
        { k: "3B", v: fmt(careerBatting["3b"]) },
        { k: "G", v: fmt(careerBatting.g) },
      ]
    : [];

  const careerPitchingGrid = careerPitching
    ? [
        { k: "ERA", v: fmt(careerPitching.era, 2) },
        { k: "K/9", v: fmt(careerPitching.k9, 2) },
        { k: "K/BB", v: fmt(careerPitching.kbb, 2) },
        { k: "WHIP", v: fmt(careerPitching.whip, 2) },
        { k: "IP", v: fmt(careerPitching.ip, 1) },
        { k: "ER", v: fmt(careerPitching.er) },
        { k: "KO", v: fmt(careerPitching.ko) },
        { k: "BB", v: fmt(careerPitching.bb) },
        { k: "GP", v: fmt(careerPitching.g) },
        { k: "W-L", v: `${fmt(careerPitching.w)}-${fmt(careerPitching.l)}` },
        { k: "SAVES", v: fmt(careerPitching.saves) },
        { k: "FIP", v: "--" },
      ]
    : [];

  const careerGrid = isPitcher ? careerPitchingGrid : careerBattingGrid;

  // Top stats grid: active → current season; inactive → career totals
  const currentBattingGrid = currentBatSeason
    ? [
        { k: "AVG", v: fmtAvg(currentBatSeason.avg) },
        { k: "HR", v: fmt(currentBatSeason.hr) },
        { k: "RBI", v: fmt(currentBatSeason.rbi) },
        { k: "R", v: fmt(currentBatSeason.r) },
        { k: "SB", v: fmt(currentBatSeason.sb) },
        { k: "OPS", v: fmtAvg(currentBatSeason.ops) },
        { k: "H", v: fmt(currentBatSeason.h) },
        { k: "BB", v: fmt(currentBatSeason.bb) },
        { k: "AB", v: fmt(currentBatSeason.ab) },
        { k: "2B", v: fmt(currentBatSeason["2b"]) },
        { k: "3B", v: fmt(currentBatSeason["3b"]) },
        { k: "G", v: fmt(currentBatSeason.g) },
      ]
    : (isActive
        ? [
            { k: "AVG", v: "--" }, { k: "HR", v: "--" }, { k: "RBI", v: "--" },
            { k: "R", v: "--" }, { k: "SB", v: "--" }, { k: "OPS", v: "--" },
            { k: "H", v: "--" }, { k: "BB", v: "--" }, { k: "AB", v: "--" },
            { k: "2B", v: "--" }, { k: "3B", v: "--" }, { k: "G", v: "--" },
          ]
        : []);
  const currentPitchingGrid = currentPitSeason
    ? [
        { k: "ERA", v: fmt(currentPitSeason.era, 2) },
        { k: "W", v: fmt(currentPitSeason.w) },
        { k: "L", v: fmt(currentPitSeason.l) },
        { k: "IP", v: fmt(currentPitSeason.ip, 1) },
        { k: "K", v: fmt(currentPitSeason.ko) },
        { k: "BB", v: fmt(currentPitSeason.bb) },
        { k: "WHIP", v: fmt(currentPitSeason.whip, 2) },
        { k: "SV", v: fmt(currentPitSeason.saves) },
        { k: "G", v: fmt(currentPitSeason.g) },
        { k: "GS", v: fmt(currentPitSeason.gs) },
        { k: "ER", v: fmt(currentPitSeason.er) },
        { k: "K/9", v: fmt(currentPitSeason.k9, 2) },
      ]
    : (isActive
        ? [
            { k: "ERA", v: "--" }, { k: "W", v: "--" }, { k: "L", v: "--" },
            { k: "IP", v: "--" }, { k: "K", v: "--" }, { k: "BB", v: "--" },
            { k: "WHIP", v: "--" }, { k: "SV", v: "--" }, { k: "G", v: "--" },
            { k: "GS", v: "--" }, { k: "ER", v: "--" }, { k: "K/9", v: "--" },
          ]
        : []);
  // Top grid: active → current season (or blank placeholders), inactive/retired → career totals
  const topStatsGrid = isActive
    ? (isPitcher ? currentPitchingGrid : currentBattingGrid)
    : careerGrid;
  const topStatsLabel = isActive ? `${CURRENT_SEASON} SEASON STATS` : "CAREER TOTALS";

  // Career level ladder — ordered progression for the timeline
  const LEVEL_ORDER = ["HS", "COLL", "ROK", "SS", "A", "A+", "AA", "AAA", "MLB", "IND"];
  const allSeasonLevels = new Set(
    [...battingSeasons, ...pitchingSeasons]
      .map((s: any) => (s.level || "").toUpperCase().trim())
      .filter(Boolean)
  );
  const levelLadder = [
    ...LEVEL_ORDER.filter((l) => allSeasonLevels.has(l)),
    ...[...allSeasonLevels].filter((l) => !LEVEL_ORDER.includes(l)).sort(),
  ];
  // Peak level comes from career_highlevel; mark that stop as gold in the timeline
  const peakLevel = level.replace(/[^A-Z0-9+]/g, "").toUpperCase() || (levelLadder[levelLadder.length - 1] ?? "");

  // Helper: CSS class suffix for a career level string
  function levelClass(lv: string): string {
    return `level-${(lv || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  }

  // Caption shown under THEN image
  const thenCaption = gradClass !== "--" ? `CLASS OF ${gradClass}` : (latestYear > 0 ? String(latestYear) : "THEN");

  return (
    <>
      <style>{`
        :root{--bg:#0d0d0d;--fg:#f5f5f5;--muted:#999;--line:rgba(255,255,255,.08);--header-bg:rgba(13,13,13,.97);--crestH:60px;--logo-filter:invert(1);--card-bg:#1a1a1a;--footerH:clamp(56px,8vh,77px)}
        body.light-theme{--bg:#f4f4f4;--fg:#121212;--muted:#555;--line:rgba(0,0,0,.1);--header-bg:rgba(244,244,244,.97);--logo-filter:none;--card-bg:#fff}
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;transition:background-color .3s,color .3s;padding-bottom:var(--footerH)}
        a{color:inherit;text-decoration:none}
        .yat-container{max-width:1100px;margin:0 auto;padding:0 16px}
        /* HEADER */
        .yat-header{position:sticky;top:0;z-index:50;background:var(--header-bg);backdrop-filter:blur(8px);transition:background-color .3s}
        .yat-topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
        .yat-left-icons{display:flex;align-items:center;gap:8px;margin-left:4px}
        .yat-icon-btn{background:none;border:none;color:var(--fg);opacity:.9;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0 2px;cursor:pointer}
        .yat-icon-btn i{font-size:20px}
        .yat-topnav{display:flex;gap:18px;align-items:center}
        .yat-nav-pair{white-space:nowrap;cursor:pointer;text-decoration:none}
        .yat-nav-pair .thin{font:300 11px Oswald,sans-serif;letter-spacing:.02em;color:var(--muted);margin-right:2px}
        .yat-nav-pair .bold{font:400 11px "Bebas Neue",sans-serif}
        .yat-wordmark-wrap{display:flex;align-items:center;justify-content:flex-end;min-width:120px}
        @media(max-width:1200px){.yat-topnav{display:none!important}}
        .yat-hr{border-top:1px solid var(--line)}
        .yat-schoolrow{display:flex;align-items:center;gap:12px;padding:6px 16px;max-width:1100px;margin:0 auto}
        .yat-crest{height:var(--crestH);width:auto;object-fit:contain;display:block;flex-shrink:0;transition:border-radius .2s,object-fit .2s}
        .yat-crest.is-headshot{width:var(--crestH);object-fit:cover;object-position:top center;border-radius:4px}
        .yat-schooltext{line-height:1;min-width:0;flex:1}
        .yat-schooltext .small{font:300 11px/1 Oswald;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        .yat-schooltext .big1{font:700 18px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        .yat-schooltext .big2{font:700 22px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        /* Player context lines in hero utility row */
        .yat-hero-ctx{display:flex;flex-direction:column;gap:2px;justify-content:center;margin-left:8px;min-width:0}
        .yat-player-ctx{font:300 10px/1.4 Oswald,sans-serif;letter-spacing:.06em;color:var(--fg);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .yat-player-ctx.dim{color:var(--muted)}
        @media(max-width:640px){.yat-player-ctx{font-size:9px;letter-spacing:.04em}.yat-hero-ctx{display:none}}
        /* Image captions below NOW/THEN */
        .player-img-caption{font:700 8px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;text-align:center;text-transform:uppercase;color:var(--muted);margin-top:4px;padding:2px 0}
        /* HERO ACTION ROW */
        .yat-hero{padding:2px 0}
        .yat-hero-grid{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0}
        .yat-hero-left{display:flex;align-items:center;gap:6px;padding-left:10px}
        .yat-hero-right{display:flex;gap:10px;align-items:center;padding-right:4px}
        .fav-btn-hero{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid rgba(255,255,255,.22);border-radius:999px;font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;cursor:pointer;background:none;color:var(--fg);transition:all .2s;white-space:nowrap}
        body.light-theme .fav-btn-hero{border-color:rgba(0,0,0,.18)}
        .fav-btn-hero i{font-size:13px;transition:color .2s;color:gold}
        .fav-btn-hero:hover{background:rgba(255,209,102,.12);border-color:rgba(255,209,102,.5)}
        .fav-btn-hero.active{background:gold;color:#000;border-color:gold}
        .fav-btn-hero.active i{color:#000}
        /* PLAYER HERO / META SECTION — compact summary only */
        .player-hero-meta{background:linear-gradient(160deg,#07071a 0%,#0d0d1f 50%,#07071a 100%);padding:12px 0;position:relative;border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#ffd166,#ff9800,#ffd166) 1}
        body.light-theme .player-hero-meta{background:linear-gradient(160deg,#dde0f5 0%,#e8eaf6 50%,#dde0f5 100%)}
        .player-meta-inner{max-width:1100px;margin:0 auto;padding:0 16px;display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:start}
        .player-meta-bio{min-width:0;display:flex;flex-direction:column;gap:6px}
        .player-bio-name{font:700 clamp(22px,4vw,40px)/1 "Bebas Neue",sans-serif;letter-spacing:.02em;text-transform:uppercase}
        .player-bio-school{font:300 11px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;display:inline-flex;align-items:center;gap:3px;transition:color .2s}
        .player-bio-school:hover{color:var(--fg)}
        .player-bio-badges{display:flex;gap:5px;flex-wrap:wrap}
        .chip{font:700 10px/1 "Bebas Neue",sans-serif;padding:3px 8px;border-radius:4px;letter-spacing:.06em;display:inline-block}
        .chip-level{background:#1a6b3c;color:#fff}
        .chip-mlb{background:#002D72;color:#fff}
        .chip-aaa{background:#c8102e;color:#fff}
        .chip-aa{background:#e31937;color:#fff}
        .chip-a{background:#ff6900;color:#fff}
        .chip-ind{background:#6a0dad;color:#fff}
        .chip-status{background:rgba(255,255,255,.1);color:var(--fg);border:1px solid var(--line)}
        body.light-theme .chip-status{background:rgba(0,0,0,.07);border-color:rgba(0,0,0,.12)}
        .player-bio-table{display:flex;flex-direction:column}
        .player-bio-row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--line);align-items:baseline}
        .player-bio-row:last-child{border-bottom:none}
        .player-bio-key{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;min-width:80px;flex-shrink:0}
        .player-bio-val{font:500 11px/1 Oswald,sans-serif}
        .player-meta-media{flex-shrink:0;width:min(80px,18vw)}
        .player-now-img,.player-then-img{width:100%;aspect-ratio:3/4;object-fit:cover;object-position:top center;border-radius:5px;border:1px solid var(--line);display:block}
        /* TABS — sticky under header */
        .profile-tabs{display:flex;gap:0;border-bottom:2px solid var(--line);max-width:1100px;margin:12px auto 0;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:sticky;top:var(--stickyHeaderH,120px);z-index:40;background:var(--header-bg);backdrop-filter:blur(8px)}
        .profile-tabs::-webkit-scrollbar{display:none}
        .profile-tab{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:10px 18px;cursor:pointer;color:var(--muted);border-bottom:3px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;white-space:nowrap;flex-shrink:0}
        .profile-tab.active{color:var(--fg);border-bottom-color:gold}
        .profile-tab:hover:not(.active){color:var(--fg)}
        /* STATS */
        .stats-section{max-width:1100px;margin:0 auto;padding:20px 16px}
        .stats-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;text-align:center;padding:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase}
        body.light-theme .stats-title{background:rgba(0,0,0,.03)}
        .stats-grid{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid var(--line);border-top:none;margin-bottom:16px}
        @media(max-width:660px){.stats-grid{grid-template-columns:repeat(3,1fr)}}
        .stat-cell{text-align:center;padding:14px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
        .stats-grid .stat-cell:nth-child(6n){border-right:none}
        @media(max-width:660px){.stats-grid .stat-cell:nth-child(6n){border-right:1px solid var(--line)}.stats-grid .stat-cell:nth-child(3n){border-right:none}}
        .stat-label{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
        .stat-value{font:700 22px/1 "Bebas Neue",sans-serif;margin-top:6px}
        .season-note{text-align:center;font:300 12px/1.3 Oswald,sans-serif;color:var(--muted);margin:8px 0}
        /* TABLES */
        .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px;margin-top:4px}
        .season-table{width:100%;border-collapse:collapse;font:300 12px/1.4 Oswald,sans-serif}
        .season-table thead{position:sticky;top:calc(var(--stickyHeaderH,0px) + var(--tabBarH,42px));z-index:2}
        .season-table th{font:700 10px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:8px 6px;text-align:center;color:var(--muted);text-transform:uppercase;white-space:nowrap;background:var(--card-bg);box-shadow:0 1px 0 var(--line),0 2px 0 var(--line)}
        body.light-theme .season-table th{background:#e8eaf0}
        .season-table td{padding:8px 6px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
        .season-table tr:last-child td{border-bottom:none}
        .season-table tbody tr:hover{background:rgba(255,209,102,.05)}
        /* TAB CONTENT — ensure enough height for sparse tabs to allow full scroll collapse */
        .tab-content{display:none}
        .tab-content.active{display:block;min-height:calc(100svh - var(--stickyHeaderH,120px) - var(--tabBarH,42px) - var(--footerH))}
        .coming-soon{text-align:center;padding:48px 20px;color:var(--muted);font:300 14px/1.5 Oswald,sans-serif}
        .coming-soon i{font-size:36px;display:block;margin-bottom:12px;opacity:.4}
        /* FAVORITES MODAL */
        .fav-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:60}
        .fav-modal{background:var(--card-bg);border:1px solid var(--line);border-radius:16px;padding:24px;max-width:380px;width:90%;color:var(--fg);box-shadow:0 20px 40px rgba(0,0,0,.4);position:relative}
        .fav-modal h3{font:700 20px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;margin-bottom:8px}
        .fav-modal p{font:300 13px/1.5 Oswald,sans-serif;color:var(--muted);margin-bottom:16px}
        .fav-modal-actions{display:flex;flex-direction:column;gap:8px}
        .fav-modal-actions button{padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--fg);font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;cursor:pointer;transition:background .15s}
        body.light-theme .fav-modal-actions button{background:rgba(0,0,0,.04)}
        .fav-modal-actions button.cta{background:gold;color:#000;border-color:gold}
        .fav-modal-close{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;line-height:1}
        /* FOOTER — fixed at bottom */
        .yat-footer{position:fixed;left:0;right:0;bottom:0;height:var(--footerH);background:var(--bg);border-top:1px solid var(--line);z-index:40;display:flex;align-items:center;justify-content:center;gap:20px;padding:0 16px}
        .yat-footer .sponsor-text{font:300 10px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
        .yat-footer .sponsor-name{font:400 16px "Bebas Neue",sans-serif;letter-spacing:.06em;color:var(--fg)}
        .yat-footer a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none}
        .yat-footer a:hover{opacity:.8}
        .yat-footer .sponsor-cta-link{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;border:1px solid var(--line);border-radius:4px;padding:4px 10px}
        .yat-footer .sponsor-cta-link:hover{color:gold;border-color:rgba(255,209,102,.5)}
        /* PLAYER CONTEXT LINE */
        .player-context-line{font:300 11px/1.3 Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
        .player-context-line .ctx-team{color:var(--fg);font-weight:500}
        /* COMPACT PLAYER IDENTITY BLOCK */
        .player-id-block{display:flex;flex-direction:column;gap:4px}
        .player-id-line{font:400 11px/1.5 Oswald,sans-serif;letter-spacing:.04em;color:var(--fg);text-transform:uppercase;white-space:normal}
        .player-id-line .dim{color:var(--muted);font-weight:300}
        .player-id-line .sep{color:var(--muted);margin:0 5px}
        .player-id-label{font-weight:600;color:var(--fg)}
        /* DRAWERS */
        .yat-drawer{position:fixed;top:0;width:290px;height:100vh;background:var(--header-bg);z-index:100;padding:24px 20px;overflow-y:auto;transition:transform .3s cubic-bezier(.4,0,.2,1);border-right:1px solid var(--line)}
        .yat-drawer-left{left:0;transform:translateX(-100%)}
        .yat-drawer-right{right:0;transform:translateX(100%);border-right:none;border-left:1px solid var(--line)}
        body.drawer-left-open .yat-drawer-left{transform:translateX(0)}
        body.drawer-account-open #drawerAccount{transform:translateX(0)}
        body.drawer-open{overflow:hidden}
        .yat-close-btn{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--fg);cursor:pointer;font-size:22px;display:flex;align-items:center;opacity:.7}
        .yat-close-btn:hover{opacity:1}
        .drawer-mask{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}
        body.drawer-left-open .drawer-mask,body.drawer-account-open .drawer-mask{display:block}
        .drawer-nav-link{display:block;font:300 14px/1 Oswald,sans-serif;padding:10px 0;border-bottom:1px solid var(--line);transition:color .2s}
        .drawer-nav-link:hover{color:gold}
        /* OVERVIEW TAB */
        .overview-section{max-width:1100px;margin:0 auto;padding:20px 16px}
        .ov-card{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;padding:18px 20px;margin-bottom:16px}
        .ov-card-title{font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
        .overview-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:16px}
        @media(max-width:700px){.overview-grid{grid-template-columns:1fr}}
        .ov-bio-list{display:flex;flex-direction:column;gap:0}
        .ov-bio-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line)}
        .ov-bio-row:last-child{border-bottom:none}
        .ov-bio-key{font:300 11px/1 Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;flex-shrink:0;margin-right:8px}
        .ov-bio-val{font:500 13px/1 Oswald,sans-serif;text-align:right}
        /* LEVEL LADDER */
        .level-ladder-wrap{margin-bottom:16px}
        .level-ladder{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
        .level-ladder::-webkit-scrollbar{display:none}
        .level-stop{display:flex;flex-direction:column;align-items:center;position:relative;min-width:56px}
        .level-line-wrap{display:flex;align-items:center;width:100%;position:relative;height:20px}
        .level-dot{width:12px;height:12px;border-radius:50%;background:var(--line);border:2px solid var(--muted);flex-shrink:0;transition:background .2s}
        .level-stop.peak .level-dot{background:gold;border-color:gold;width:16px;height:16px}
        .level-connector{flex:1;height:2px;background:var(--line)}
        .level-stop:last-child .level-connector{display:none}
        .level-name{font:700 9px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;margin-top:6px;color:var(--muted);white-space:nowrap}
        .level-stop.peak .level-name{color:gold}
        /* CAREER LOG TABLE */
        .career-log-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:8px}
        body.light-theme .career-log-title{background:rgba(0,0,0,.03)}
        .career-log .year-cell{font:700 12px/1 Oswald,sans-serif;color:var(--fg)}
        .career-log .team-cell{font:400 11px/1.3 Oswald,sans-serif;color:var(--muted);text-align:left;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .career-log tbody tr.level-row{border-left:3px solid transparent}
        .career-log tbody tr.level-mlb{border-left-color:#1d6fa4}
        .career-log tbody tr.level-aaa{border-left-color:#c8102e}
        .career-log tbody tr.level-aa{border-left-color:#e07b39}
        .career-log tbody tr[class*="level-a"]{border-left-color:#f5a623}
        .career-log tbody tr.level-ind{border-left-color:#6a0dad}
        .career-log tbody tr.level-coll{border-left-color:#2ecc71}
        .career-log tbody tr.level-rok{border-left-color:#27ae60}
        .career-log tbody .career-totals-row{background:rgba(255,209,102,.08);font-weight:700}
        body.light-theme .career-log tbody .career-totals-row{background:rgba(255,209,102,.12)}
        .career-log tbody .career-totals-row td{font:700 12px/1.4 Oswald,sans-serif;border-top:2px solid rgba(255,209,102,.3)}
        .career-log tbody .career-totals-row .year-cell{color:gold}
        .log-section{margin-bottom:20px}
        /* RECENT GAME LOG (overview) */
        .recent-log-card{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;margin-bottom:16px;overflow:hidden}
        .recent-log-grid{display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid var(--line)}
        @media(max-width:700px){.recent-log-grid{grid-template-columns:repeat(4,1fr)}}
        .recent-log-cell{text-align:center;padding:12px 6px;border-right:1px solid var(--line)}
        .recent-log-cell:last-child{border-right:none}
        .recent-log-label{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
        .recent-log-val{font:700 18px/1 "Bebas Neue",sans-serif;margin-top:4px}
        /* GAME LOG FEED */
        .gl-feed{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px}
        .gl-feed-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.04)}
        body.light-theme .gl-feed-header{background:rgba(0,0,0,.03)}
        .gl-feed-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:6px}
        .gl-feed-team{font:400 12px/1 Oswald,sans-serif;color:var(--fg);letter-spacing:.04em}
        .gl-row{display:flex;align-items:baseline;gap:0;padding:8px 14px;border-bottom:1px solid var(--line);min-height:36px}
        .gl-row:last-child{border-bottom:none}
        .gl-row.gl-row-past{background:rgba(255,255,255,.01)}
        .gl-row.gl-row-today{background:rgba(255,209,102,.07);border-left:3px solid gold}
        body.light-theme .gl-row.gl-row-today{background:rgba(255,209,102,.1)}
        .gl-date{font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.04em;min-width:38px;flex-shrink:0;color:var(--fg)}
        .gl-row.gl-row-past .gl-date{color:var(--muted)}
        .gl-matchup{font:400 11px/1 Oswald,sans-serif;min-width:120px;flex-shrink:0;color:var(--fg)}
        .gl-row.gl-row-past .gl-matchup{color:var(--muted)}
        .gl-result{font:700 11px/1 "Bebas Neue",sans-serif;min-width:28px;flex-shrink:0;margin-left:4px}
        .gl-result.win{color:#00e676}
        .gl-result.loss{color:#ff5252}
        .gl-stat-line{font:400 11px/1 Oswald,sans-serif;color:var(--fg);flex:1;padding-left:8px;border-left:1px solid var(--line);margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gl-status{font:700 8px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:3px 7px;border-radius:3px;background:rgba(255,209,102,.15);color:gold;border:1px solid rgba(255,209,102,.3);flex-shrink:0;margin-left:6px;white-space:nowrap;align-self:center}
        .gl-status.live{background:rgba(0,230,118,.15);color:#00e676;border-color:rgba(0,230,118,.4)}
        .gl-empty{padding:32px 16px;text-align:center;font:300 12px/1.4 Oswald,sans-serif;color:var(--muted)}
        @media(max-width:640px){
          .gl-row{padding:7px 10px;gap:0}
          .gl-date{min-width:32px;font-size:10px}
          .gl-matchup{min-width:90px;font-size:10px}
          .gl-result{font-size:10px}
          .gl-stat-line{font-size:10px}
        }
        /* GLOBAL SEARCH MODAL */
        .yat-gs-modal{display:none;position:fixed;inset:0;z-index:90;align-items:flex-start;justify-content:center;padding:10vh 16px 16px}
        .yat-gs-modal.open{display:flex}
        .yat-gs-overlay{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}
        .yat-gs-panel{position:relative;width:100%;max-width:620px;background:#111;border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.7);display:flex;flex-direction:column;overflow:hidden;max-height:82vh}
        body.light-theme .yat-gs-panel{background:#fff;border-color:rgba(0,0,0,.12)}
        .yat-gs-header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 20px 0}
        .yat-gs-title{font:700 24px "Bebas Neue",sans-serif;letter-spacing:.08em;color:var(--fg);text-transform:uppercase}
        .yat-gs-sub{font:300 11px Oswald,sans-serif;color:var(--muted);margin-top:2px;letter-spacing:.05em;text-transform:uppercase}
        .yat-gs-body{padding:14px 16px 14px;display:flex;flex-direction:column;gap:10px;min-height:0}
        .yat-gs-input-wrap{position:relative;display:flex;align-items:center}
        .yat-gs-input-wrap .ri-search-line{position:absolute;left:14px;font-size:16px;color:var(--muted);pointer-events:none}
        .yat-gs-input{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:var(--fg);font:400 14px Oswald,sans-serif;padding:10px 14px 10px 40px;outline:none;transition:border-color .2s}
        body.light-theme .yat-gs-input{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.15)}
        .yat-gs-input:focus{border-color:rgba(255,255,255,.38)}
        body.light-theme .yat-gs-input:focus{border-color:rgba(0,0,0,.3)}
        .yat-gs-results{overflow-y:auto;max-height:calc(82vh - 180px);display:flex;flex-direction:column;gap:6px;padding-bottom:6px}
        .yat-gs-region{font:700 9px Oswald,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);padding:14px 2px 6px;border-top:1px solid var(--line);margin-top:2px;flex-shrink:0}
        .yat-gs-region:first-child{border-top:none;margin-top:0;padding-top:4px}
        .yat-gs-result{display:flex;flex-direction:column;gap:0;padding:0;border-radius:12px;text-decoration:none;color:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s;overflow:hidden;flex-shrink:0}
        .yat-gs-result:hover,.yat-gs-result:focus{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2);outline:none}
        body.light-theme .yat-gs-result{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.08)}
        body.light-theme .yat-gs-result:hover{background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.14)}
        .yat-gs-result[data-status="inactive"]{opacity:.6}
        .yat-gs-result-top{display:flex;align-items:center;gap:12px;padding:12px 14px 10px}
        .yat-gs-result-crest{width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,.06);flex-shrink:0;border:1px solid rgba(255,255,255,.1);padding:2px}
        body.light-theme .yat-gs-result-crest{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.1)}
        .yat-gs-result-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
        .yat-gs-result-name{font:700 16px "Bebas Neue",sans-serif;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);line-height:1.15}
        .yat-gs-result-loc{font:300 10px Oswald,sans-serif;letter-spacing:.06em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
        .yat-gs-status{font:700 8px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:5px;white-space:nowrap;flex-shrink:0;display:inline-block;line-height:1.5;align-self:flex-start}
        .yat-gs-status-live{background:rgba(0,230,118,.14);border:1px solid rgba(0,230,118,.6);color:#00e676}
        .yat-gs-status-potential{background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.5);color:#ffc107}
        .yat-gs-status-inactive{background:rgba(158,158,158,.07);border:1px solid rgba(158,158,158,.25);color:#888}
        .yat-gs-stats{display:flex;flex-wrap:nowrap;gap:0;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.25);overflow-x:auto}
        body.light-theme .yat-gs-stats{border-top-color:rgba(0,0,0,.08);background:rgba(0,0,0,.04)}
        .yat-gs-chip{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 12px;min-width:52px;flex:1;border-right:1px solid rgba(255,255,255,.06)}
        .yat-gs-chip:last-child{border-right:none}
        body.light-theme .yat-gs-chip{border-right-color:rgba(0,0,0,.07)}
        .yat-gs-chip-val{font:700 16px "Bebas Neue",sans-serif;letter-spacing:.04em;color:var(--fg);line-height:1;white-space:nowrap}
        .yat-gs-chip-val.hi{color:#00e676}
        .yat-gs-chip-lbl{font:300 8px Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);line-height:1;white-space:nowrap}
        .yat-gs-msg{padding:28px 12px;text-align:center;font:300 13px Oswald,sans-serif;color:var(--muted)}
        .yat-gs-coming{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center;padding:8px 0 4px;border-top:1px solid var(--line);opacity:.5}
        /* MOBILE */
        @media(max-width:640px){
          /* Shrink sticky header crest/text */
          :root{--crestH:44px}
          .yat-schoolrow{padding:4px 12px;gap:8px}
          .yat-schooltext .small{font-size:9px;letter-spacing:.08em}
          .yat-schooltext .big1{font-size:14px}
          .yat-schooltext .big2{font-size:16px}
          .yat-hero{padding:2px 0}
          .fav-btn-hero{padding:5px 10px;font-size:10px}
          /* Hero/meta: compact 3-col */
          .player-hero-meta{padding:8px 0}
          .player-meta-inner{grid-template-columns:1fr auto auto;gap:8px;align-items:start}
          /* Hide large player name on mobile — already shown in sticky header */
          .player-bio-name{display:none}
          .player-meta-bio{gap:3px}
          .player-bio-badges{gap:3px}
          .chip{padding:2px 6px;font-size:9px}
          /* Keep compact identity visible but smaller on mobile */
          .player-id-line{font-size:10px;letter-spacing:.03em}
          /* Compact images on mobile */
          .player-meta-media{width:min(64px,16vw)}
          .player-now-img,.player-then-img{border-radius:4px}
          .yat-hero-left{padding-left:6px}
          /* Recent game log grid on mobile */
          .recent-log-grid{grid-template-columns:repeat(4,1fr)}
        }
      `}</style>

      {/* HEADER — sticky global shell */}
      <header className="yat-header" id="site-header">
        {/* Row 1: Global controls */}
        <div className="yat-container yat-topbar">
          <div className="yat-left-icons">
            <a href={`/${resolvedHsid}`} className="yat-icon-btn" aria-label="Back to school"><i className="ri-arrow-left-line" /></a>
            <button className="yat-icon-btn" id="btnMenu" aria-label="Menu"><i className="ri-menu-line" /></button>
            <button className="yat-icon-btn" id="btnAccount" aria-label="Account"><i className="ri-user-3-line" /></button>
            <button className="yat-icon-btn" id="theme-toggle" aria-label="Toggle Theme"><i className="ri-sun-line" /></button>
          </div>
          <nav className="yat-topnav" aria-label="Top Navigation">
            {navItems.map((item) => (
              <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="yat-nav-pair">
                {item.thin && <span className="thin">{item.thin} </span>}
                <span className="bold">{item.bold}</span>
              </a>
            ))}
          </nav>
          <div className="yat-wordmark-wrap">
            <a href="https://home.yatstats.com" style={{textDecoration:'none',display:'flex',alignItems:'center'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png" alt="YAT?STATS" style={{height:'28px',width:'auto',filter:'var(--logo-filter)'}} />
            </a>
          </div>
        </div>

        <div className="yat-hr" />

        {/* Unified school identity block: crest + city/state + school name + player name */}
        <div className="yat-schoolrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="stickyIdentityImg"
            className="yat-crest"
            src={crestUrl}
            alt={`${schoolName} crest`}
            data-crest={crestUrl}
            data-headshot={playerThenImg}
          />
          <div className="yat-schooltext">
            <div className="small">{location}</div>
            <div className="big1">{schoolName}</div>
            <div className="big2">{displayName}</div>
          </div>
        </div>

        <div className="yat-hr" />

        {/* Hero utility row: ADD FAVORITE + player metadata + search */}
        <div className="yat-hero">
          <div className="yat-container yat-hero-grid">
            <div className="yat-hero-left">
              <button id="btnFanFav" className="fav-btn-hero" aria-label="Add Favorite">
                <i className="ri-star-line" /> ADD FAVORITE
              </button>
              {/* Player identity lines: TEAM|ORG|LEVEL and POS|B/T|HT|WT */}
              {(ctxTeam || ctxSecondary || ctxLevel) && (
                <div className="yat-hero-ctx">
                  <div className="yat-player-ctx">
                    {[ctxTeam, ctxSecondary, ctxLevel].filter(Boolean).join(' | ')}
                  </div>
                  {(pos !== "--" || bt !== "-/-" || ht !== "--") && (
                    <div className="yat-player-ctx dim">
                      {[
                        pos !== "--" ? pos : null,
                        bt !== "-/-" ? `B/T - ${bt}` : null,
                        ht !== "--" ? ht : null,
                        wt !== "--" ? `${wt} LBS` : null,
                      ].filter(Boolean).join(' | ')}
                    </div>
                  )}
                </div>
              )}
            </div>
            <GlobalSearchModal />
          </div>
        </div>
      </header>

      {/* DRAWER MASK */}
      <div className="drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER */}
      <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft"><i className="ri-close-line" /></button>
        <h3 style={{font:'700 16px "Bebas Neue",sans-serif',letterSpacing:'.1em',marginBottom:'16px',paddingTop:'8px'}}>NAVIGATION</h3>
        <div style={{display:'flex',flexDirection:'column'}}>
          <a href={`/${resolvedHsid}`} className="drawer-nav-link">&#8592; BACK TO {schoolName}</a>
          {navItems.map((item) => (
            <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="drawer-nav-link">
              {item.thin ? `${item.thin} ` : ""}{item.bold}
            </a>
          ))}
        </div>
      </aside>

      {/* ACCOUNT DRAWER */}
      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
        <h3 style={{font:'700 16px "Bebas Neue",sans-serif',letterSpacing:'.1em',marginBottom:'16px',paddingTop:'8px'}}>ACCOUNT</h3>
        <AccountDrawer subdomain={subdomain} />
      </aside>

      {/* PLAYER HERO / META — scrollable, not sticky */}
      <section id="playerHeroMeta" className="player-hero-meta">
        <div className="player-meta-inner">
          {/* Col 1: supplemental history — prior colleges + draft only (core identity moved to sticky header) */}
          <div className="player-meta-bio">
            <div className="player-id-block">
              {/* Prior college history — schools not shown in the sticky header context line */}
              {collegesToShow.length > 0 && collegesToShow.map((col, i) => (
                <div key={i} className="player-id-line dim">{col}</div>
              ))}
              {/* Draft info — theme-safe */}
              {draftInfo !== "N/A" && (
                <div className="player-id-line">
                  <span className="player-id-label">DRAFTED</span>
                  <span className="sep">|</span>
                  <span className="dim">{draftInfo}</span>
                </div>
              )}
              {/* Fallback: show level badge if no other content */}
              {collegesToShow.length === 0 && draftInfo === "N/A" && (
                <div style={{marginTop:'4px'}}>
                  <span className="chip chip-level">{level}</span>
                </div>
              )}
            </div>
          </div>
          {/* Col 2: NOW image + status caption */}
          <div className="player-meta-media">
            <SafeImage
              className="player-now-img"
              src={playerNowImg}
              alt={`${displayName} — NOW`}
              fallbackSrc="/img/player-silhouette.png"
              placeholderSrc="/img/player-silhouette.png"
            />
            <div className="player-img-caption">{statusLabel}</div>
          </div>
          {/* Col 3: THEN image + grad year caption */}
          <div className="player-meta-media">
            <SafeImage
              className="player-then-img"
              src={playerThenImg}
              alt={`${displayName} — THEN`}
              fallbackSrc="/img/player-silhouette.png"
              placeholderSrc="/img/player-silhouette.png"
            />
            <div className="player-img-caption">{thenCaption}</div>
          </div>
        </div>
      </section>

      {/* TABS */}
      <div className="profile-tabs" role="tablist">
        <div role="tab" className="profile-tab active" data-profile-tab="overview" tabIndex={0}>GAME LOG</div>
        <div role="tab" className="profile-tab" data-profile-tab="stats" tabIndex={0}>STATS</div>
        <div role="tab" className="profile-tab" data-profile-tab="news" tabIndex={0}>NEWS &amp; VIDEOS</div>
        <div role="tab" className="profile-tab" data-profile-tab="social" tabIndex={0}>SOCIAL MEDIA</div>
        <div role="tab" className="profile-tab" data-profile-tab="mentor" tabIndex={0}>MENTORSHIP MARKETPLACE</div>
        <div role="tab" className="profile-tab" data-profile-tab="gallery" tabIndex={0}>PHOTO GALLERY</div>
      </div>

      {/* TAB: GAME LOG */}
      <div className="tab-content active" id="tab-overview" role="tabpanel">
        <div className="overview-section">

          {/* GAME LOG FEED — chronological schedule + stat lines */}
          {(function(){
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Format date as M/D
            function fmtDate(raw: any): string {
              if (!raw) return '?';
              const d = new Date(raw);
              if (isNaN(d.getTime())) return String(raw);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }

            // Normalize home_away to 'H' or 'A'
            function homeAway(raw: any): 'H' | 'A' {
              const v = String(raw || '').toLowerCase();
              return (v === 'h' || v === 'home') ? 'H' : 'A';
            }

            // Build hitter stat line: "2-4 | HR, 2 RBI, R"
            function hitterLine(row: any): string {
              const parts: string[] = [];
              const h = Number(row.h ?? row.hits ?? 0);
              const ab = Number(row.ab ?? 0);
              if (ab > 0) parts.push(`${h}-${ab}`);
              const dbl = Number(row.dbl ?? row["2b"] ?? 0);
              const tpl = Number(row.tpl ?? row["3b"] ?? 0);
              const hr = Number(row.hr ?? 0);
              const rbi = Number(row.rbi ?? 0);
              const r = Number(row.r ?? row.runs ?? 0);
              const so = Number(row.so ?? row.k ?? 0);
              const bb = Number(row.bb ?? 0);
              const sf = Number(row.sf ?? 0);
              const sb = Number(row.sb ?? 0);
              const hits: string[] = [];
              if (dbl) hits.push(dbl > 1 ? `${dbl} 2B` : '2B');
              if (tpl) hits.push(tpl > 1 ? `${tpl} 3B` : '3B');
              if (hr) hits.push(hr > 1 ? `${hr} HR` : 'HR');
              if (rbi) hits.push(rbi === 1 ? 'RBI' : `${rbi} RBI`);
              if (r) hits.push(r === 1 ? 'R' : `${r} R`);
              if (so) hits.push(so === 1 ? 'SO' : `${so} SO`);
              if (bb) hits.push(bb === 1 ? 'BB' : `${bb} BB`);
              if (sf) hits.push(sf === 1 ? 'SF' : `${sf} SF`);
              if (sb) hits.push(sb === 1 ? 'SB' : `${sb} SB`);
              if (hits.length) parts.push(hits.join(', '));
              return parts.join(' | ');
            }

            // Build pitcher stat line: "2.0 IP, 3 H, 3 R, 3 ER, 2 K, 2 BB, L"
            function pitcherLine(row: any): string {
              const parts: string[] = [];
              const ip = Number(row.ip ?? 0);
              const h = Number(row.h ?? row.hits ?? 0);
              const r = Number(row.r ?? row.runs ?? 0);
              const er = Number(row.er ?? 0);
              const k = Number(row.ko ?? row.so ?? row.k ?? 0);
              const bb = Number(row.bb ?? 0);
              if (ip) parts.push(`${ip.toFixed(1)} IP`);
              if (h) parts.push(`${h} H`);
              if (r) parts.push(`${r} R`);
              if (er) parts.push(`${er} ER`);
              if (k) parts.push(`${k} K`);
              if (bb) parts.push(`${bb} BB`);
              const dec = row.decision ? String(row.decision).toUpperCase() : '';
              if (dec) parts.push(dec);
              return parts.join(', ');
            }

            // Derive result display (W/L) and CSS class
            function resultInfo(row: any): { label: string; cls: string } {
              const res = String(row.result || '').toUpperCase().trim();
              if (!res) return { label: '', cls: '' };
              if (res.startsWith('W')) return { label: res, cls: 'win' };
              if (res.startsWith('L')) return { label: res, cls: 'loss' };
              return { label: res, cls: '' };
            }

            // Live status display
            function statusBadge(row: any): string | null {
              const s = String(row.status || '').toUpperCase().trim();
              if (!s || s === 'SCHEDULED' || s === 'FINAL') return null;
              return s;
            }

            if (teamSchedule.length === 0) {
              return (
                <div className="gl-feed">
                  <div className="gl-feed-header">
                    <span className="gl-feed-title"><i className="ri-calendar-line" />GAME LOG</span>
                    {ctxTeam && <span className="gl-feed-team">{ctxTeam}</span>}
                  </div>
                  <div className="gl-empty">
                    {currentTeamId
                      ? 'Schedule not yet available for this team.'
                      : 'No active team found. Check back once the season schedule is loaded.'}
                  </div>
                </div>
              );
            }

            return (
              <div className="gl-feed">
                <div className="gl-feed-header">
                  <span className="gl-feed-title"><i className="ri-calendar-line" />GAME LOG</span>
                  {ctxTeam && <span className="gl-feed-team">{ctxTeam}</span>}
                </div>
                {teamSchedule.map((game: any, i: number) => {
                  const isoDate = game.game_date ? String(game.game_date).slice(0, 10) : null;
                  const gameDate = isoDate ? new Date(isoDate + 'T12:00:00') : null;
                  const isPast = gameDate ? gameDate < today : false;
                  const isToday = gameDate ? gameDate.getTime() === today.getTime() : false;
                  const ha = homeAway(game.home_away);
                  const opp = game.opponent || game.opponent_name || game.opp || '?';
                  const matchup = ha === 'A' ? `@ ${opp}` : `vs ${opp}`;
                  const dateLabel = fmtDate(game.game_date);
                  const batRow = isoDate ? batStatsByDate.get(isoDate) : null;
                  const pitRow = isoDate ? pitStatsByDate.get(isoDate) : null;
                  const statLine = isPast
                    ? (isPitcher ? (pitRow ? pitcherLine(pitRow) : '') : (batRow ? hitterLine(batRow) : ''))
                    : '';
                  const res = resultInfo(game);
                  const liveStatus = statusBadge(game);
                  const rowClass = `gl-row${isToday ? ' gl-row-today' : isPast ? ' gl-row-past' : ''}`;
                  return (
                    <div key={i} className={rowClass}>
                      <span className="gl-date">{dateLabel}</span>
                      <span className="gl-matchup">{matchup}</span>
                      {res.label && <span className={`gl-result ${res.cls}`}>{res.label}</span>}
                      {statLine && <span className="gl-stat-line">{statLine}</span>}
                      {liveStatus && <span className={`gl-status${liveStatus === 'IN PROGRESS' || liveStatus === 'LIVE' ? ' live' : ''}`}>{liveStatus}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Career Path — level progression timeline (compact secondary) */}
          {levelLadder.length > 0 && (
            <div className="ov-card level-ladder-wrap">
              <div className="ov-card-title">CAREER PATH</div>
              <div className="level-ladder">
                {levelLadder.map((lvl, i) => (
                  <div key={lvl} className={`level-stop${lvl === peakLevel ? ' peak' : ''}`}>
                    <div className="level-line-wrap">
                      <div className="level-dot" />
                      {i < levelLadder.length - 1 && <div className="level-connector" />}
                    </div>
                    <div className="level-name">{lvl}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* TAB: STATS */}
      <div className="tab-content" id="tab-stats" role="tabpanel">
        <div className="overview-section">

          {/* Top stats grid: current season (active) or career totals (inactive) */}
          {topStatsGrid.length > 0 && (
            <div className="ov-card">
              <div className="ov-card-title">{topStatsLabel}</div>
              <div className="stats-grid" style={{border:'none',marginBottom:0}}>
                {topStatsGrid.map((s, i) => (
                  <div key={i} className="stat-cell" style={{border:'1px solid var(--line)',borderRadius:'4px'}}>
                    <div className="stat-label">{s.k}</div>
                    <div className="stat-value">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {battingSeasons.length > 0 && (
            <div className="log-section">
              <div className="table-wrap" style={{borderRadius:'6px'}}>
                <table className="season-table career-log">
                  <thead>
                    <tr>
                      <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th><th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {battingSeasons.map((b: BattingSeason, i: number) => (
                      <tr key={i} className={`level-row ${levelClass(b.level||'')}`}>
                        <td className="year-cell">{b.year}</td>
                        <td className="team-cell">{b.team_name || '--'}</td>
                        <td>{(b.level||'--').toUpperCase()}</td>
                        <td>{fmt(b.g)}</td><td>{fmt(b.ab)}</td><td>{fmt(b.h)}</td>
                        <td>{fmt(b["2b"])}</td><td>{fmt(b["3b"])}</td><td>{fmt(b.hr)}</td>
                        <td>{fmt(b.rbi)}</td><td>{fmt(b.r)}</td><td>{fmt(b.sb)}</td>
                        <td>{fmt(b.bb)}</td><td>{fmt(b.so)}</td>
                        <td>{fmtAvg(b.avg)}</td><td>{fmtAvg(b.obp)}</td>
                        <td>{fmtAvg(b.slg)}</td><td>{fmtAvg(b.ops)}</td>
                      </tr>
                    ))}
                    {careerBatting && (
                      <tr className="career-totals-row">
                        <td className="year-cell">CAREER</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(careerBatting.g)}</td><td>{fmt(careerBatting.ab)}</td><td>{fmt(careerBatting.h)}</td>
                        <td>{fmt(careerBatting["2b"])}</td><td>{fmt(careerBatting["3b"])}</td><td>{fmt(careerBatting.hr)}</td>
                        <td>{fmt(careerBatting.rbi)}</td><td>{fmt(careerBatting.r)}</td><td>{fmt(careerBatting.sb)}</td>
                        <td>{fmt(careerBatting.bb)}</td><td>{fmt(careerBatting.so)}</td>
                        <td>{fmtAvg(careerBatting.avg)}</td><td>{fmtAvg(careerBatting.obp)}</td>
                        <td>{fmtAvg(careerBatting.slg)}</td><td>{fmtAvg(careerBatting.ops)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pitchingSeasons.length > 0 && (
            <div className="log-section">
              <div className="table-wrap" style={{borderRadius:'6px'}}>
                <table className="season-table career-log">
                  <thead>
                    <tr>
                      <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>GS</th><th>W</th><th>L</th><th>SV</th><th>IP</th><th>ER</th><th>KO</th><th>BB</th><th>ERA</th><th>WHIP</th><th>K/9</th><th>K/BB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pitchingSeasons.map((p: PitchingSeason, i: number) => (
                      <tr key={i} className={`level-row ${levelClass(p.level||'')}`}>
                        <td className="year-cell">{p.year}</td>
                        <td className="team-cell">{p.team_name || '--'}</td>
                        <td>{(p.level||'--').toUpperCase()}</td>
                        <td>{fmt(p.g)}</td><td>{fmt(p.gs)}</td><td>{fmt(p.w)}</td><td>{fmt(p.l)}</td>
                        <td>{fmt(p.saves)}</td><td>{fmt(p.ip, 1)}</td><td>{fmt(p.er)}</td>
                        <td>{fmt(p.ko)}</td><td>{fmt(p.bb)}</td>
                        <td>{fmt(p.era, 2)}</td><td>{fmt(p.whip, 2)}</td>
                        <td>{fmt(p.k9, 2)}</td><td>{fmt(p.kbb, 2)}</td>
                      </tr>
                    ))}
                    {careerPitching && (
                      <tr className="career-totals-row">
                        <td className="year-cell">CAREER</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(careerPitching.g)}</td><td>{fmt(careerPitching.gs)}</td>
                        <td>{fmt(careerPitching.w)}</td><td>{fmt(careerPitching.l)}</td>
                        <td>{fmt(careerPitching.saves)}</td><td>{fmt(careerPitching.ip, 1)}</td>
                        <td>{fmt(careerPitching.er)}</td><td>{fmt(careerPitching.ko)}</td>
                        <td>{fmt(careerPitching.bb)}</td>
                        <td>{fmt(careerPitching.era, 2)}</td><td>{fmt(careerPitching.whip, 2)}</td>
                        <td>{fmt(careerPitching.k9, 2)}</td><td>{fmt(careerPitching.kbb, 2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {battingSeasons.length === 0 && pitchingSeasons.length === 0 && (
            <div className="season-note" style={{padding:'40px 0'}}>No career statistics available.</div>
          )}
        </div>
      </div>

      {/* TAB: NEWS */}
      <div className="tab-content" id="tab-news" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-newspaper-line" />
            NEWS &amp; VIDEO CLIPS — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: SOCIAL */}
      <div className="tab-content" id="tab-social" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-share-line" />
            SOCIAL MEDIA — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: MENTOR */}
      <div className="tab-content" id="tab-mentor" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-team-line" />
            MENTORSHIP MARKETPLACE — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: GALLERY */}
      <div className="tab-content" id="tab-gallery" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-image-line" />
            PHOTO GALLERY — Coming soon
          </div>
        </div>
      </div>

      {/* FAVORITES MODAL */}
      <div className="fav-modal-mask" id="favModalMask" role="dialog" aria-modal="true">
        <div className="fav-modal">
          <button className="fav-modal-close" id="favModalClose" aria-label="Close modal">&times;</button>
          <h3>Save this player</h3>
          <p>Register free to follow favorites from this school, or become a Superfan for access across all schools.</p>
          <div className="fav-modal-actions">
            <button id="favRegister">Register Free</button>
            <button id="favUpgrade">Become a Superfan</button>
          </div>
        </div>
      </div>

      {/* FOOTER — fixed sticky bar matching school page */}
      <footer className="yat-footer" data-player-id={safePlayerId}>
        {sponsorBanner ? (
          <a href={sponsorBanner.url} target="_blank" rel="noopener noreferrer">
            <span className="sponsor-text">{sponsorBanner.label || "PRESENTED BY"}</span>
            <span className="sponsor-name">{sponsorBanner.name}</span>
          </a>
        ) : (
          <a href="https://peteismyagent.com/products" target="_blank" rel="noopener noreferrer">
            <span className="sponsor-text">Presented by</span>
            <span className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</span>
          </a>
        )}
        <a href="mailto:sponsor@yatstats.com" className="sponsor-cta-link">
          Sponsor This Page
        </a>
      </footer>

      {/* CLIENT INTERACTIVITY */}
      <script dangerouslySetInnerHTML={{__html:`
(function(){
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  /* Theme */
  var saved=localStorage.getItem('yat-theme');
  if(saved==='light')document.body.classList.add('light-theme');
  var btn=document.getElementById('theme-toggle');
  if(btn){
    btn.addEventListener('click',function(){
      var isLight=document.body.classList.toggle('light-theme');
      localStorage.setItem('yat-theme',isLight?'light':'dark');
      var ic=btn.querySelector('i');
      if(ic)ic.className=isLight?'ri-moon-line':'ri-sun-line';
    });
    if(saved==='light'){var ic=btn.querySelector('i');if(ic)ic.className='ri-moon-line';}
  }
  /* Measure sticky header height and set CSS variables used by sticky tabs and min-height */
  (function setLayoutVars(){
    var header=document.getElementById('site-header');
    var tabBar=document.querySelector('.profile-tabs');
    function update(){
      var headerHeight=header?header.offsetHeight:0;
      var tabBarHeight=tabBar?tabBar.offsetHeight:0;
      document.documentElement.style.setProperty('--stickyHeaderH',headerHeight+'px');
      document.documentElement.style.setProperty('--tabBarH',tabBarHeight+'px');
    }
    update();
    window.addEventListener('resize',update,{passive:true});
  }());
  /* Profile tab switching */
  var VALID_TABS=['overview','stats','news','social','mentor','gallery'];
  function activateTab(name){
    if(VALID_TABS.indexOf(name)===-1)return;
    document.querySelectorAll('.profile-tab').forEach(function(t){t.classList.remove('active');});
    document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});
    var tab=document.querySelector('.profile-tab[data-profile-tab="'+name+'"]');
    var content=document.getElementById('tab-'+name);
    if(tab)tab.classList.add('active');
    if(content)content.classList.add('active');
  }
  document.querySelectorAll('.profile-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      var target=tab.getAttribute('data-profile-tab');
      activateTab(target);
      history.replaceState(null,'','#tab-'+target);
    });
  });
  /* Activate tab from URL hash on load (e.g. #tab-stats) */
  (function(){
    var hash=window.location.hash.slice(1);
    if(hash.slice(0,4)==='tab-'){activateTab(hash.slice(4));}
  }());
  /* Drawer toggles */
  var btnMenu=document.getElementById('btnMenu');
  var closeLeft=document.getElementById('closeLeft');
  if(btnMenu)btnMenu.addEventListener('click',function(){document.body.classList.toggle('drawer-left-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-account-open');});
  if(closeLeft)closeLeft.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-open');});
  var btnAccount=document.getElementById('btnAccount');
  var closeAccount=document.getElementById('closeAccount');
  if(btnAccount)btnAccount.addEventListener('click',function(){document.body.classList.toggle('drawer-account-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open');});
  if(closeAccount)closeAccount.addEventListener('click',function(){document.body.classList.remove('drawer-account-open','drawer-open');});
  var mask=document.getElementById('drawerMask');
  if(mask)mask.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-account-open','drawer-open');});
  /* Global Search Modal */
  var S3_BASE='https://yatstats-assets.s3.us-west-2.amazonaws.com';
  var CREST_FALLBACK='/img/school-placeholder.png';
  var STAT_EMPTY='\u2014';
  var gsModal=document.getElementById('gsModal');
  var gsOverlay=document.getElementById('gsOverlay');
  var gsClose=document.getElementById('gsClose');
  var gsInput=document.getElementById('gsInput');
  var gsResults=document.getElementById('gsResults');
  var gsTimer=null;
  function openGsModal(){if(!gsModal)return;gsModal.classList.add('open');document.body.classList.add('drawer-open');if(gsInput)setTimeout(function(){gsInput.focus();},60);}
  function closeGsModal(){if(!gsModal)return;gsModal.classList.remove('open');document.body.classList.remove('drawer-open');if(gsInput)gsInput.value='';if(gsResults)gsResults.innerHTML='';}
  var openSearch=document.getElementById('openSearch');
  if(openSearch)openSearch.addEventListener('click',function(){openGsModal();});
  if(gsOverlay)gsOverlay.addEventListener('click',function(){closeGsModal();});
  if(gsClose)gsClose.addEventListener('click',function(){closeGsModal();});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&gsModal&&gsModal.classList.contains('open')){closeGsModal();return;}
    if(!gsModal||!gsModal.classList.contains('open'))return;
    if((e.key==='ArrowDown'||e.key==='ArrowUp')&&gsResults){
      e.preventDefault();
      var items=Array.from(gsResults.querySelectorAll('.yat-gs-result'));
      if(!items.length)return;
      var focused=document.activeElement;
      var idx=items.indexOf(focused);
      if(e.key==='ArrowDown')idx=idx<items.length-1?idx+1:0;
      else idx=idx>0?idx-1:items.length-1;
      items[idx].focus();
    }
  });
  function normalizeSchoolResult(p){
    var hasAlumni=p.current_aa&&p.current_aa>0;
    var status=p.microsite_url&&p.microsite_url.length>0?'live':(hasAlumni?'potential':'inactive');
    var dest;
    if(status==='live'){dest=p.microsite_url;}
    else if(p.hsid){dest='/'+p.hsid;}
    else{
      var sp=new URLSearchParams();
      if(p.hsname)sp.set('school',p.hsname);
      if(p.hslocation){var lp=p.hslocation.split(',');if(lp[0])sp.set('city',lp[0].trim());if(lp[1])sp.set('state',lp[1].trim());}
      sp.set('reason',status);
      var notLiveBase=window.location.hostname.endsWith('.yatstats.com')?'https://yatstats.com':'';
      dest=notLiveBase+'/school-not-live?'+sp.toString();
    }
    var crestUrl=p.hsid?S3_BASE+'/schools/'+p.hsid+'.png':CREST_FALLBACK;
    var region=p.regionid||'';
    if(!region&&p.hslocation){var hl=p.hslocation.split(',');if(hl.length>=2)region=hl[hl.length-1].trim();}
    var draftedRatio=null;
    if(p.drafted_hs!=null&&p.drafted!=null&&(p.drafted_hs>0||p.drafted>0)){draftedRatio=p.drafted_hs+'/'+p.drafted;}
    return{schoolName:p.hsname||'',location:p.hslocation||'',region:region,crestUrl:crestUrl,status:status,dest:dest,activeAlumni:p.current_aa!=null?p.current_aa:null,mlb:p.mlb!=null?p.mlb:null,natRank:p.yatstats_national_rank!=null?p.yatstats_national_rank:null,stateRank:p.yatstats_state_rank!=null?p.yatstats_state_rank:null,atnla:p.atnla!=null?p.atnla:null,draftedRatio:draftedRatio};
  }
  function makeChip(val,lbl,highlight){var chip=document.createElement('div');chip.className='yat-gs-chip';var valEl=document.createElement('span');valEl.className='yat-gs-chip-val'+(highlight?' hi':'');valEl.textContent=val!=null?String(val):STAT_EMPTY;var lblEl=document.createElement('span');lblEl.className='yat-gs-chip-lbl';lblEl.textContent=lbl;chip.appendChild(valEl);chip.appendChild(lblEl);return chip;}
  function renderSchoolResult(r){
    var statusLabel=r.status==='live'?'Live':(r.status==='potential'?'Candidate':'Not Active');
    var el=document.createElement('a');el.className='yat-gs-result';el.setAttribute('data-status',r.status);el.setAttribute('href',r.dest);el.setAttribute('role','option');el.setAttribute('tabindex','0');
    var topDiv=document.createElement('div');topDiv.className='yat-gs-result-top';
    var crestImg=document.createElement('img');crestImg.className='yat-gs-result-crest';crestImg.alt='';crestImg.loading='lazy';crestImg.src=r.crestUrl;crestImg.onerror=function(){crestImg.onerror=null;crestImg.src=CREST_FALLBACK;};
    var infoDiv=document.createElement('div');infoDiv.className='yat-gs-result-info';
    var nameDiv=document.createElement('div');nameDiv.className='yat-gs-result-name';nameDiv.textContent=r.schoolName;
    var locDiv=document.createElement('div');locDiv.className='yat-gs-result-loc';locDiv.textContent=r.location;
    infoDiv.appendChild(nameDiv);if(r.location)infoDiv.appendChild(locDiv);
    var badge=document.createElement('span');badge.className='yat-gs-status yat-gs-status-'+r.status;badge.textContent=statusLabel;
    topDiv.appendChild(crestImg);topDiv.appendChild(infoDiv);topDiv.appendChild(badge);el.appendChild(topDiv);
    var hasStats=r.activeAlumni!=null||r.mlb!=null||r.natRank!=null||r.stateRank!=null||r.atnla!=null||r.draftedRatio!=null;
    if(hasStats){var statsDiv=document.createElement('div');statsDiv.className='yat-gs-stats';if(r.activeAlumni!=null)statsDiv.appendChild(makeChip(r.activeAlumni,'Active',true));if(r.mlb!=null)statsDiv.appendChild(makeChip(r.mlb,'MLB',false));if(r.natRank!=null)statsDiv.appendChild(makeChip('#'+r.natRank,"Nat'l",false));if(r.stateRank!=null)statsDiv.appendChild(makeChip('#'+r.stateRank,'State',false));if(r.atnla!=null)statsDiv.appendChild(makeChip(r.atnla,'All-Time',false));if(r.draftedRatio)statsDiv.appendChild(makeChip(r.draftedRatio,'Drafted',false));el.appendChild(statsDiv);}
    return el;
  }
  function runSchoolSearch(q){
    if(!gsResults)return;
    gsResults.innerHTML='<div class="yat-gs-msg">Searching\u2026</div>';
    fetch('/api/schools/search?q='+encodeURIComponent(q)+'&limit=50').then(function(r){return r.json();}).then(function(d){
      var items=(d.programs||[]).map(normalizeSchoolResult);
      gsResults.innerHTML='';
      if(!items.length){gsResults.innerHTML='<div class="yat-gs-msg">No schools found matching \u201c'+escHtml(q)+'\u201d</div>';return;}
      var groups={};var order=[];
      items.forEach(function(r){var key=r.region||'Unknown Region';if(!groups[key]){groups[key]=[];order.push(key);}groups[key].push(r);});
      var frag=document.createDocumentFragment();
      order.forEach(function(region){var hdr=document.createElement('div');hdr.className='yat-gs-region';hdr.textContent=region;frag.appendChild(hdr);groups[region].forEach(function(r){frag.appendChild(renderSchoolResult(r));});});
      gsResults.appendChild(frag);
    }).catch(function(){gsResults.innerHTML='<div class="yat-gs-msg">Search unavailable. Please try again.</div>';});
  }
  if(gsInput&&gsResults){
    gsInput.addEventListener('input',function(){var q=this.value.trim();clearTimeout(gsTimer);if(q.length<2){gsResults.innerHTML='';return;}gsTimer=setTimeout(function(){runSchoolSearch(q);},220);});
    gsInput.addEventListener('keydown',function(e){if(e.key==='Enter'){var q=gsInput.value.trim();if(q.length>=2){clearTimeout(gsTimer);runSchoolSearch(q);}}});
  }
  /* Favorites */
  var playerId='${safePlayerId}';
  var playerName='${displayName.replace(/'/g, "\\'")}';
  var favMask=document.getElementById('favModalMask');
  function openFavModal(){if(favMask){favMask.style.display='flex';}}
  function closeFavModal(){if(favMask){favMask.style.display='none';}}
  var btnFanFav=document.getElementById('btnFanFav');
  function setFavState(btn,active){if(!btn)return;if(active){btn.classList.add('active');}else{btn.classList.remove('active');}}
  function addFavorite(type){
    var user=null;
    try{user=JSON.parse(localStorage.getItem('yat-user')||'null');}catch(e){console.warn('Invalid stored user',e);localStorage.removeItem('yat-user');}
    if(!user||!user.contactId){openFavModal();return;}
    if(type==='superfan'&&!user.isSuperFan){openFavModal();return;}
    fetch('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contactId:user.contactId,playerId:playerId,playerName:playerName,type:type})}).then(function(r){return r.json();}).then(function(data){
      if(data&&data.success){if(type==='fan')setFavState(btnFanFav,true);alert(playerName+' added to your Fan Favorites.');}
      else{alert('Error: '+(data&&data.error?data.error:'Could not add favorite'));}
    }).catch(function(){alert('Network error. Please try again.');});
  }
  if(btnFanFav)btnFanFav.addEventListener('click',function(){addFavorite('fan');});
  /* Rotate FAV button CTA text every 3s */
  (function(){
    var ctaVariants=[['ri-star-line','ADD FAN FAVORITE'],['ri-vip-crown-line','UPGRADE TO SUPERFAN']];
    var idx=0;
    var timer=setInterval(function(){
      if(!document.contains(btnFanFav)){clearInterval(timer);return;}
      if(!btnFanFav||btnFanFav.classList.contains('active'))return;
      idx=(idx+1)%ctaVariants.length;
      btnFanFav.innerHTML='<i class="'+ctaVariants[idx][0]+'"></i> '+ctaVariants[idx][1];
    },3000);
  }());
  var favClose=document.getElementById('favModalClose');
  var favContinue=document.getElementById('favContinue');
  var favRegister=document.getElementById('favRegister');
  var favUpgrade=document.getElementById('favUpgrade');
  if(favClose)favClose.addEventListener('click',closeFavModal);
  if(favMask)favMask.addEventListener('click',function(e){if(e.target===favMask)closeFavModal();});
  if(favContinue)favContinue.addEventListener('click',closeFavModal);
  if(favRegister)favRegister.addEventListener('click',function(){window.location.href='/api/auth/register';});
  if(favUpgrade)favUpgrade.addEventListener('click',function(){window.location.href='/api/auth/register?plan=superfan';});
  /* Crest ↔ THEN headshot swap via IntersectionObserver */
  (function(){
    var heroMeta=document.getElementById('playerHeroMeta');
    var stickyImg=document.getElementById('stickyIdentityImg');
    if(!heroMeta||!stickyImg)return;
    var crestSrc=stickyImg.getAttribute('data-crest')||stickyImg.src;
    var headshotSrc=stickyImg.getAttribute('data-headshot')||'';
    /* Fallback: if crest fails to load, show generic placeholder */
    stickyImg.onerror=function(){this.onerror=null;this.src=CREST_FALLBACK;crestSrc=CREST_FALLBACK;};
    if(!headshotSrc)return;
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting){
          /* Hero scrolled away — show square THEN headshot */
          stickyImg.src=headshotSrc;
          stickyImg.classList.add('is-headshot');
        }else{
          /* Hero visible — restore school crest */
          stickyImg.src=crestSrc;
          stickyImg.classList.remove('is-headshot');
        }
      });
    },{threshold:0,rootMargin:'0px 0px 0px 0px'});
    observer.observe(heroMeta);
  }());
})();
      `}} />
    </>
  );
}
