import SafeImage from "@/components/SafeImage";
import {
  findPlayersBySlug,
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
import {
  getPlayerThenImageUrl,
  getNowSilhouetteUrl,
  PLAYER_SILHOUETTE_URL,
} from "@/lib/playerImage";

type Props = {
  params: {
    hsid: string;
    playerId: string;
    slug: string;
  };
};

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

function levelClass(lv: string): string {
  return `level-${(lv || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
}


export default async function ProfilePage({ params }: Props) {
  const { hsid, playerId, slug } = params;

let player: any = null;

try {
  const matches = await findPlayersBySlug(slug, hsid);
  player = matches?.find((p: any) => String(p.playerid) === playerId) as any;
} catch (e) {
  console.error("DB ERROR:", e);
}

if (!player) {
  return (
    <div style={{ padding: "20px" }}>
      <h1>No player</h1>
    </div>
  );
}

const safePlayerId = String(playerId);

const firstName = (player.firstname || "").trim();
const lastName = (player.lastname || "").trim();
const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;
const pos = "--";
const ht = "--";
const wt = "--";
const bt = "-/-";

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
] = await Promise.all([
  getPlayerBattingStats(safePlayerId),
  getPlayerPitchingStats(safePlayerId),
  getPlayerCareerBatting(safePlayerId),
  getPlayerCareerPitching(safePlayerId),
  getPlayerPhotos(safePlayerId),
  getResolvedCurrentTeam(safePlayerId),
  getDesignatedPlayerImage(safePlayerId, "LEFT_ANCHOR"),
  getDesignatedPlayerImage(safePlayerId, "RIGHT_ANCHOR"),
  getDesignatedPlayerImage(safePlayerId, "HEADSHOT"),
]);

const latestYear = Math.max(
  ...battingSeasons.map((s: any) => Number(s.year) || 0),
  ...pitchingSeasons.map((s: any) => Number(s.year) || 0),
  0
);

const isPitcher =
  pitchingSeasons.length > 0 &&
  (battingSeasons.length === 0 || pitchingSeasons.length >= battingSeasons.length);

const isActive = latestYear >= 2025;
const statusLabel = isActive ? "ACTIVE" : "RETIRED";

const resolvedTeamName = (resolvedCurrentTeam?.team_name || "").trim();
const resolvedLevel = resolvedCurrentTeam?.level
  ? String(resolvedCurrentTeam.level).toUpperCase()
  : "";

const mostRecentSeason = [...battingSeasons, ...pitchingSeasons]
  .sort((a: BattingSeason | PitchingSeason, b: BattingSeason | PitchingSeason) => (Number(b.year) || 0) - (Number(a.year) || 0))[0] as
  | BattingSeason
  | PitchingSeason
  | undefined;

const ctxTeam = resolvedTeamName || mostRecentSeason?.team_name || "";
const ctxLevel =
  resolvedLevel ||
  (mostRecentSeason?.level ? String(mostRecentSeason.level).toUpperCase() : "");

const currentTeamId = resolvedCurrentTeam?.teamid
  ? String(resolvedCurrentTeam.teamid)
  : (mostRecentSeason as any)?.teamid
    ? String((mostRecentSeason as any).teamid)
    : null;

const teamCtx = currentTeamId ? await getTeamContext(currentTeamId) : null;
const ctxOrg = (teamCtx?.organization || "").trim();
const ctxConference = (teamCtx?.conference || "").trim();
const currentOrgOrConference = ctxOrg || ctxConference || "";

const draftInfo =
  ([...battingSeasons, ...pitchingSeasons] as any[]).find((s) => s.draft_info)?.draft_info || "N/A";

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

const collegesLine = uniqueColleges.length ? uniqueColleges.join(", ") : "N/A";

const CURRENT_SEASON = new Date().getFullYear();

const currentBatSeason = (isActive
  ? battingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0] ??
    battingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0]
  : null) as BattingSeason | null;

const currentPitSeason = (isActive
  ? pitchingSeasons.filter((s: any) => Number(s.year) === CURRENT_SEASON).slice(-1)[0] ??
    pitchingSeasons.filter((s: any) => Number(s.year) === latestYear).slice(-1)[0]
  : null) as PitchingSeason | null;

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
  : [];

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
  : [];

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

const topStatsGrid = isActive
  ? (isPitcher ? currentPitchingGrid : currentBattingGrid)
  : (isPitcher ? careerPitchingGrid : careerBattingGrid);

const topStatsLabel = isActive ? `${CURRENT_SEASON} SEASON STATS` : "CAREER TOTALS";

type FilmSlot = {
  img: string;
  altSrc?: string;
  label: string;
  sub: string;
  role: "anchor" | "timeline";
};

const playerThenImg = getPlayerThenImageUrl(safePlayerId);
const rightAnchorSilhouette = getNowSilhouetteUrl(isPitcher);

const leftAnchorImg = designatedLeftAnchor?.image_url || playerThenImg;
const leftAnchorAlt = !designatedLeftAnchor?.image_url
  ? leftAnchorImg.endsWith(".jpg")
    ? leftAnchorImg.slice(0, -4) + ".png"
    : leftAnchorImg.endsWith(".png")
      ? leftAnchorImg.slice(0, -4) + ".jpg"
      : undefined
  : undefined;

const hsBookend: FilmSlot = {
  img: leftAnchorImg,
  altSrc: leftAnchorAlt,
  label: designatedLeftAnchor?.team_name || displayName,
  sub: designatedLeftAnchor?.season_year ? String(designatedLeftAnchor.season_year) : "",
  role: "anchor",
};

const currentTeamBookend: FilmSlot = {
  img: designatedRightAnchor?.image_url || designatedHeadshot?.image_url || rightAnchorSilhouette,
  label: designatedRightAnchor?.team_name || ctxTeam || displayName,
  sub: designatedRightAnchor?.season_year
    ? String(designatedRightAnchor.season_year)
    : (ctxLevel || ""),
  role: "anchor",
};

const middleSlots: FilmSlot[] = playerPhotos.map((p: any) => ({
  img: p.image_url || PLAYER_SILHOUETTE_URL,
  label: p.caption || p.team_name || "",
  sub: p.season_year ? String(p.season_year) : "",
  role: "timeline",
}));

const careerSlots: FilmSlot[] = [hsBookend, ...middleSlots, currentTeamBookend];
return (
  <>
    <section className="career-strip" id="playerHeroMeta">
      <div className="career-strip-inner">
        {careerSlots.map((slot, idx) => (
          <div key={`${slot.role}-${idx}-${slot.img}`} className={`career-slot ${slot.role}`}>
            <SafeImage
              className="career-slot-img"
              src={slot.img}
              alt={slot.label}
              fallbackSrc={slot.altSrc || PLAYER_SILHOUETTE_URL}
              placeholderSrc={PLAYER_SILHOUETTE_URL}
            />
          </div>
        ))}
      </div>
    </section>
  </>
);
}
  

