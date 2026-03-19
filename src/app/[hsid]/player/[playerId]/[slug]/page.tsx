// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// PLAYER PROFILE PAGE — shared-shell route
// This page renders ONLY Row 5 content. The shared shell (Rows 1-4, drawers,
// footer, styles, interactivity) is provided by [hsid]/layout.tsx.

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import { CREST_FALLBACK_PATH, getSchoolCrestUrl } from "@/lib/schoolAssets";
import { toPlayerSlug } from "@/lib/slug";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import {
  getPlayerThenImageUrl,
  getNowSilhouetteUrl,
  PLAYER_SILHOUETTE_URL,
} from "@/lib/playerImage";
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
  getPlayerPhotos,
  getDesignatedPlayerImage,
  getResolvedCurrentTeam,
} from "@/lib/db";
import { formatSchoolName } from "@/lib/playerUtils";

// Profile-specific components
import ProfileStyles from "@/components/yatstats/profile/ProfileStyles";
import ProfileInteractivity from "@/components/yatstats/profile/ProfileInteractivity";
import CareerFilmstrip, { type FilmSlot } from "@/components/yatstats/profile/CareerFilmstrip";
import PlayerMetadataBand from "@/components/yatstats/profile/PlayerMetadataBand";
import ProfileTabs from "@/components/yatstats/profile/ProfileTabs";
import StatsGrid from "@/components/yatstats/profile/StatsGrid";
import GameLogFeed from "@/components/yatstats/profile/GameLogFeed";
import { BattingSeasonTable, PitchingSeasonTable } from "@/components/yatstats/profile/SeasonTable";
import FavoritesModal from "@/components/yatstats/profile/FavoritesModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type BattingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any; ab?: any; r?: any; h?: any;
  "2b"?: any; "3b"?: any; hr?: any; rbi?: any;
  sb?: any; bb?: any; so?: any;
  avg?: any; obp?: any; slg?: any; ops?: any;
  draft_info?: string;
};

type PitchingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any; gs?: any; w?: any; l?: any;
  saves?: any; ip?: any; er?: any; ko?: any;
  bb?: any; era?: any; whip?: any; k9?: any; kbb?: any;
  draft_info?: string;
};

// ---------------------------------------------------------------------------
// Helpers
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
    const playerSchoolLink = await getPlayerSchool(safePlayerId);
    const playerHsid = playerSchoolLink?.hsid ? String(playerSchoolLink.hsid) : null;
    let school: Record<string, unknown> | null = null;
    if (playerHsid) school = (await getSchoolByHsid(playerHsid)) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
    const resolvedHsid = String(school?.hsid ?? hsid);
    const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
    const canonicalSlug = player ? toPlayerSlug(player.firstname, player.lastname) : slug;
    // Canonical points to /player/ (this production route).
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
// Page Component
// ---------------------------------------------------------------------------
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}) {
  const { hsid, playerId, slug } = await params;

  // ── Validate playerId ──────────────────────────────────────────────────────
  const playerIdNum = parseInt(playerId, 10);
  if (!/^\d+$/.test(playerId) || playerIdNum <= 0) notFound();
  const safePlayerId = String(playerIdNum);

  // ── Resolve school ─────────────────────────────────────────────────────────
  const headersList = await headers();
  const host = headersList.get("host") || "";
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

  // ── Resolve player ─────────────────────────────────────────────────────────
  const player = await getPlayerById(safePlayerId);
  if (!player) notFound();
  const canonicalSlug = toPlayerSlug(player.firstname, player.lastname);
  // Redirect to canonical slug within the /player/ route
  if (slug !== canonicalSlug) permanentRedirect(`/${hsid}/player/${safePlayerId}/${canonicalSlug}`);

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    battingSeasons,
    pitchingSeasons,
    careerBatting,
    careerPitching,
    playerPhotos,
    resolvedCurrentTeam,
    designatedLeftAnchor,
    designatedRightAnchor,
    designatedHeadshot,
  ] = (await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getPlayerPhotos(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
    getDesignatedPlayerImage(safePlayerId, "LEFT_ANCHOR"),
    getDesignatedPlayerImage(safePlayerId, "RIGHT_ANCHOR"),
    getDesignatedPlayerImage(safePlayerId, "HEADSHOT"),
  ])) as [BattingSeason[], PitchingSeason[], any, any, any[], any | null, any | null, any | null, any | null];

  // ── Derived player data ────────────────────────────────────────────────────
  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;
  const pos = player.position || "--";
  const ht = player.height || "--";
  const wt = player.weight || "--";
  const bt = `${player.bats || "-"}/${player.throws || "-"}`;
  const college = player.college || "N/A";
  const draftInfo =
    ([...battingSeasons, ...pitchingSeasons]).find((s) => s.draft_info)?.draft_info || "N/A";
  const playYears = "";

  const isPitcher =
    pitchingSeasons.length > 0 &&
    (battingSeasons.length === 0 || pitchingSeasons.length >= battingSeasons.length);

  const latestYear = Math.max(
    ...battingSeasons.map((s: any) => Number(s.year) || 0),
    ...pitchingSeasons.map((s: any) => Number(s.year) || 0),
    0,
  );
  const isActive = latestYear >= 2025;
  const statusLabel = isActive ? "ACTIVE" : "RETIRED";

  const gcMatch = playYears.match(/\d{4}/);
  const gradClass = gcMatch ? gcMatch[0] : "--";

  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const playerThenImg = getPlayerThenImageUrl(safePlayerId);

  // ── Player context ─────────────────────────────────────────────────────────
  const resolvedTeamName = (resolvedCurrentTeam?.team_name || "").trim();
  const resolvedLevel = resolvedCurrentTeam?.level ? String(resolvedCurrentTeam.level).toUpperCase() : "";
  const mostRecentSeason = [...battingSeasons, ...pitchingSeasons]
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))[0] as BattingSeason | PitchingSeason | undefined;
  const ctxTeam = resolvedTeamName || mostRecentSeason?.team_name || "";
  const ctxLevel = resolvedLevel || (mostRecentSeason?.level ? String(mostRecentSeason.level).toUpperCase() : "");

  const currentTeamId = resolvedCurrentTeam?.teamid
    ? String(resolvedCurrentTeam.teamid)
    : (mostRecentSeason as any)?.teamid
      ? String((mostRecentSeason as any).teamid)
      : null;

  const teamCtx = currentTeamId ? await getTeamContext(currentTeamId) : null;
  const ctxOrg = (teamCtx?.organization || "").toUpperCase().trim();
  const ctxConference = (teamCtx?.conference || "").toUpperCase().trim();
  const isCollegeLevel = ctxLevel.includes("NCAA") || ctxLevel.includes("JUCO") || ctxLevel === "NAIA" || ctxLevel.includes("COLLEGE");
  const ctxSecondary = isCollegeLevel ? ctxConference : ctxOrg;

  // ── College history ────────────────────────────────────────────────────────
  const ncaaSeasonsList = [...battingSeasons, ...pitchingSeasons]
    .filter((s: any) => {
      const lv = String(s.level || "").toUpperCase();
      return lv.includes("NCAA") || lv === "JUCO" || lv.includes("COLLEGE") || lv === "NAIA";
    })
    .sort((a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0));
  const uniqueColleges: string[] = [];
  for (const s of ncaaSeasonsList) {
    const tn = ((s as any).team_name || "").trim();
    if (tn && !uniqueColleges.includes(tn)) uniqueColleges.push(tn);
  }
  const mostRecentCollege = uniqueColleges.length > 0 ? uniqueColleges[uniqueColleges.length - 1] : (college !== "N/A" ? college : "");

  // ── Draft info ─────────────────────────────────────────────────────────────
  const draftMetaLine = (() => {
    if (!draftInfo || draftInfo === "N/A") return "";
    const p = draftInfo.split("-");
    if (p.length >= 3) return `DRAFTED: ${p[0]} | R${p[1]} | #${p[2]}${p[3] ? ` | ${p[3]}` : ""}`;
    return `DRAFTED: ${draftInfo}`;
  })();

  // ── Stats grids ────────────────────────────────────────────────────────────
  const CURRENT_SEASON = new Date().getFullYear();
  const currentBatSeason = (isActive
    ? (battingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0]
      ?? battingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0])
    : null) as BattingSeason | null;
  const currentPitSeason = (isActive
    ? (pitchingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0]
      ?? pitchingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0])
    : null) as PitchingSeason | null;

  const careerBattingGrid = careerBatting
    ? [
        { k: "AVG", v: fmtAvg(careerBatting.avg) }, { k: "OBP", v: fmtAvg(careerBatting.obp) },
        { k: "HR", v: fmt(careerBatting.hr) }, { k: "RBI", v: fmt(careerBatting.rbi) },
        { k: "H", v: fmt(careerBatting.h) }, { k: "R", v: fmt(careerBatting.r) },
        { k: "SB", v: fmt(careerBatting.sb) }, { k: "BB", v: fmt(careerBatting.bb) },
        { k: "AB", v: fmt(careerBatting.ab) }, { k: "2B", v: fmt(careerBatting["2b"]) },
        { k: "3B", v: fmt(careerBatting["3b"]) }, { k: "G", v: fmt(careerBatting.g) },
      ]
    : [];

  const careerPitchingGrid = careerPitching
    ? [
        { k: "ERA", v: fmt(careerPitching.era, 2) }, { k: "K/9", v: fmt(careerPitching.k9, 2) },
        { k: "K/BB", v: fmt(careerPitching.kbb, 2) }, { k: "WHIP", v: fmt(careerPitching.whip, 2) },
        { k: "IP", v: fmt(careerPitching.ip, 1) }, { k: "ER", v: fmt(careerPitching.er) },
        { k: "KO", v: fmt(careerPitching.ko) }, { k: "BB", v: fmt(careerPitching.bb) },
        { k: "GP", v: fmt(careerPitching.g) },
        { k: "W-L", v: `${fmt(careerPitching.w)}-${fmt(careerPitching.l)}` },
        { k: "SAVES", v: fmt(careerPitching.saves) }, { k: "FIP", v: "--" },
      ]
    : [];

  const careerGrid = isPitcher ? careerPitchingGrid : careerBattingGrid;

  const currentBattingGrid = currentBatSeason
    ? [
        { k: "AVG", v: fmtAvg(currentBatSeason.avg) }, { k: "HR", v: fmt(currentBatSeason.hr) },
        { k: "RBI", v: fmt(currentBatSeason.rbi) }, { k: "R", v: fmt(currentBatSeason.r) },
        { k: "SB", v: fmt(currentBatSeason.sb) }, { k: "OPS", v: fmtAvg(currentBatSeason.ops) },
        { k: "H", v: fmt(currentBatSeason.h) }, { k: "BB", v: fmt(currentBatSeason.bb) },
        { k: "AB", v: fmt(currentBatSeason.ab) }, { k: "2B", v: fmt(currentBatSeason["2b"]) },
        { k: "3B", v: fmt(currentBatSeason["3b"]) }, { k: "G", v: fmt(currentBatSeason.g) },
      ]
    : (isActive
        ? [{ k: "AVG", v: "--" }, { k: "HR", v: "--" }, { k: "RBI", v: "--" },
           { k: "R", v: "--" }, { k: "SB", v: "--" }, { k: "OPS", v: "--" },
           { k: "H", v: "--" }, { k: "BB", v: "--" }, { k: "AB", v: "--" },
           { k: "2B", v: "--" }, { k: "3B", v: "--" }, { k: "G", v: "--" }]
        : []);

  const currentPitchingGrid = currentPitSeason
    ? [
        { k: "ERA", v: fmt(currentPitSeason.era, 2) }, { k: "W", v: fmt(currentPitSeason.w) },
        { k: "L", v: fmt(currentPitSeason.l) }, { k: "IP", v: fmt(currentPitSeason.ip, 1) },
        { k: "K", v: fmt(currentPitSeason.ko) }, { k: "BB", v: fmt(currentPitSeason.bb) },
        { k: "WHIP", v: fmt(currentPitSeason.whip, 2) }, { k: "SV", v: fmt(currentPitSeason.saves) },
        { k: "G", v: fmt(currentPitSeason.g) }, { k: "GS", v: fmt(currentPitSeason.gs) },
        { k: "ER", v: fmt(currentPitSeason.er) }, { k: "K/9", v: fmt(currentPitSeason.k9, 2) },
      ]
    : (isActive
        ? [{ k: "ERA", v: "--" }, { k: "W", v: "--" }, { k: "L", v: "--" },
           { k: "IP", v: "--" }, { k: "K", v: "--" }, { k: "BB", v: "--" },
           { k: "WHIP", v: "--" }, { k: "SV", v: "--" }, { k: "G", v: "--" },
           { k: "GS", v: "--" }, { k: "ER", v: "--" }, { k: "K/9", v: "--" }]
        : []);

  const topStatsGrid = isActive ? (isPitcher ? currentPitchingGrid : currentBattingGrid) : careerGrid;
  const topStatsLabel = isActive ? `${CURRENT_SEASON} SEASON STATS` : "CAREER TOTALS";

  // ── Game log data ──────────────────────────────────────────────────────────
  const [teamSchedule, battingGameLog, pitchingGameLog] = currentTeamId
    ? await Promise.all([
        getTeamSchedule(currentTeamId),
        getPlayerBattingGameLog(safePlayerId, currentTeamId),
        getPlayerPitchingGameLog(safePlayerId, currentTeamId),
      ])
    : [[], [], []];

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

  // ── Career filmstrip slots ─────────────────────────────────────────────────
  const leftAnchorImg = designatedLeftAnchor?.image_url || playerThenImg;
  const leftAnchorLabel = designatedLeftAnchor?.team_name || schoolName;
  const leftAnchorSub = designatedLeftAnchor?.season_year ? String(designatedLeftAnchor.season_year) : location;
  const leftAnchorAlt = !designatedLeftAnchor?.image_url
    ? (leftAnchorImg.endsWith(".jpg") ? leftAnchorImg.slice(0, -4) + ".png"
      : leftAnchorImg.endsWith(".png") ? leftAnchorImg.slice(0, -4) + ".jpg"
      : undefined)
    : undefined;

  const hsBookend: FilmSlot = {
    img: leftAnchorImg,
    altSrc: leftAnchorAlt,
    label: leftAnchorLabel,
    sub: leftAnchorSub,
    role: "anchor",
  };

  const rightAnchorImg = designatedRightAnchor?.image_url || designatedHeadshot?.image_url || null;
  const rightAnchorSilhouette = getNowSilhouetteUrl(isPitcher);
  const rightAnchorMeta = designatedRightAnchor || designatedHeadshot;
  const currentTeamLabel = ctxTeam || displayName;
  const currentTeamSub = ctxLevel || (latestYear > 0 ? String(latestYear) : "");
  const currentTeamBookend: FilmSlot = {
    img: rightAnchorImg || rightAnchorSilhouette,
    label: rightAnchorMeta?.team_name || currentTeamLabel,
    sub: rightAnchorMeta?.season_year ? String(rightAnchorMeta.season_year) : currentTeamSub,
    role: "anchor",
  };

  const middleSlots: FilmSlot[] = playerPhotos.map((p: any) => ({
    img: p.image_url || PLAYER_SILHOUETTE_URL,
    label: p.caption || p.team_name || "",
    sub: p.season_year ? String(p.season_year) : "",
    role: "timeline" as const,
  }));

  const careerSlots: FilmSlot[] = [hsBookend, ...middleSlots, currentTeamBookend];

  // ── Headshot for crest ↔ headshot swap ─────────────────────────────────────
  const headshotSrc = designatedHeadshot?.image_url || "";

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER within shared shell frame:
  // Row 3 = career strip, Row 4 = metadata band, Row 5 = profile tabs/body.
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* Profile-specific styles (no shell styles — those come from YatStyles) */}
      <ProfileStyles />

      {/* ROW 3: CAREER FILMSTRIP — LEFT_ANCHOR → TIMELINE frames → RIGHT_ANCHOR */}
      <section data-row="3" aria-label="Profile image strip">
        <CareerFilmstrip slots={careerSlots} />
      </section>

      {/* ROW 4: COMPACT METADATA BAND */}
      <section data-row="4" aria-label="Profile metadata row">
        <PlayerMetadataBand
          gradClass={gradClass}
          ctxTeam={ctxTeam}
          ctxSecondary={ctxSecondary}
          ctxLevel={ctxLevel}
          pos={pos}
          statusLabel={statusLabel}
          bt={bt}
          ht={ht}
          wt={wt}
          mostRecentCollege={mostRecentCollege}
          draftMetaLine={draftMetaLine}
        />
      </section>

      {/* ROW 5: PROFILE TABS + BODY */}
      <section data-row="5" aria-label="Profile main body">
        <ProfileTabs />

        {/* ── TAB: GAME LOG ──────────────────────────────────────────────── */}
        <div className="tab-content active" id="tab-overview" role="tabpanel">
          <div className="overview-section">
            <StatsGrid title={topStatsLabel} stats={topStatsGrid} />
            <GameLogFeed
              teamSchedule={teamSchedule}
              batStatsByDate={batStatsByDate}
              pitStatsByDate={pitStatsByDate}
              isPitcher={isPitcher}
              ctxTeam={ctxTeam}
              currentTeamId={currentTeamId}
            />
          </div>
        </div>

        {/* ── TAB: STATS ─────────────────────────────────────────────────── */}
        <div className="tab-content" id="tab-stats" role="tabpanel">
          <div className="overview-section">
            <StatsGrid title={topStatsLabel} stats={topStatsGrid} />
            <BattingSeasonTable seasons={battingSeasons} careerTotals={careerBatting} />
            <PitchingSeasonTable seasons={pitchingSeasons} careerTotals={careerPitching} />
            {battingSeasons.length === 0 && pitchingSeasons.length === 0 && (
              <div className="season-note" style={{ padding: "40px 0" }}>No career statistics available.</div>
            )}
          </div>
        </div>

        {/* ── TAB: NEWS ──────────────────────────────────────────────────── */}
        <div className="tab-content" id="tab-news" role="tabpanel">
          <div className="stats-section">
            <div className="coming-soon">
              <i className="ri-newspaper-line" />
              NEWS &amp; VIDEO CLIPS — Coming soon
            </div>
          </div>
        </div>

        {/* ── TAB: SOCIAL ────────────────────────────────────────────────── */}
        <div className="tab-content" id="tab-social" role="tabpanel">
          <div className="stats-section">
            <div className="coming-soon">
              <i className="ri-share-line" />
              SOCIAL MEDIA — Coming soon
            </div>
          </div>
        </div>

        {/* ── TAB: MENTOR ────────────────────────────────────────────────── */}
        <div className="tab-content" id="tab-mentor" role="tabpanel">
          <div className="stats-section">
            <div className="coming-soon">
              <i className="ri-team-line" />
              MENTORSHIP MARKETPLACE — Coming soon
            </div>
          </div>
        </div>

        {/* ── TAB: GALLERY ───────────────────────────────────────────────── */}
        <div className="tab-content" id="tab-gallery" role="tabpanel">
          <div className="stats-section">
            <div className="coming-soon">
              <i className="ri-image-line" />
              PHOTO GALLERY — Coming soon
            </div>
          </div>
        </div>
      </section>

      {/* FAVORITES MODAL + TOAST */}
      <FavoritesModal />

      {/* PROFILE-SPECIFIC INTERACTIVITY (tabs, favorites, crest ↔ headshot swap) */}
      <ProfileInteractivity
        playerId={safePlayerId}
        playerName={displayName}
        resolvedHsid={resolvedHsid}
        headshotSrc={headshotSrc}
        crestSrc={crestUrl}
        crestFallback={CREST_FALLBACK_PATH}
      />
    </>
  );
}
