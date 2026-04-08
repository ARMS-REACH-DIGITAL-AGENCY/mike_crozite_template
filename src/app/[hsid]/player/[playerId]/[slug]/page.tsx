// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// Player profile child page — lives inside the shared shell.
// DO NOT touch the shell, layout, or any other file.
//
// Block 3 — Career-path chronological strip
// Block 4 — Two-column player metadata
// Block 5 — Profile-page six-tab FunZone (inline, not the shared FunZone component)

"use client" in (0 as any); // this file is a Server Component — no "use client"

import SafeImage from "@/components/SafeImage";
import {
  findPlayersBySlug,
  getPlayerById,
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
  params: Promise<{
    hsid: string;
    playerId: string;
    slug: string;
  }>;
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

export default async function ProfilePage({ params }: Props) {
  const { hsid, playerId, slug } = await params;

   let player: any = null;
  let _diagSlugRows: number | null = null;
  let _diagFallbackResult: string | null = null;
  let _diagError: string | null = null;
  try {
    // Primary: slug + hsid lookup (fast, school-scoped)
    const matches = await findPlayersBySlug(slug, hsid);
    _diagSlugRows = matches?.length ?? 0;
    player = matches?.find((p: any) => String(p.playerid) === String(playerId)) ?? null;
    // Fallback: direct playerid lookup (handles slug mismatches or missing player_hsids rows)
    if (!player) {
      const fallback = await getPlayerById(String(playerId));
      _diagFallbackResult = fallback ? `GOT: ${fallback.firstname} ${fallback.lastname}` : "NULL";
      player = fallback;
    }
  } catch (e: any) {
    _diagError = String(e?.message ?? e);
    console.error("DB ERROR:", e);
  }

  if (!player) {
    return (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h1>No player — diagnostic</h1>
        <p>hsid={hsid} playerId={playerId} slug={slug}</p>
        <p>findPlayersBySlug rows: {_diagSlugRows ?? "not reached"}</p>
        <p>getPlayerById result: {_diagFallbackResult ?? "not reached"}</p>
        <p>exception: {_diagError ?? "none"}</p>
      </div>
    );
  }

  const safePlayerId = String(playerId);

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || safePlayerId;

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
    .sort(
      (a: BattingSeason | PitchingSeason, b: BattingSeason | PitchingSeason) =>
        (Number(b.year) || 0) - (Number(a.year) || 0)
    )[0] as BattingSeason | PitchingSeason | undefined;

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
    ([...battingSeasons, ...pitchingSeasons] as any[]).find((s) => s.draft_info)
      ?.draft_info || "N/A";

  const ncaaSeasonsList = [...battingSeasons, ...pitchingSeasons]
    .filter((s: any) => {
      const lv = String(s.level || "").toUpperCase();
      return (
        lv.includes("NCAA") ||
        lv === "JUCO" ||
        lv.includes("COLLEGE") ||
        lv === "NAIA"
      );
    })
    .sort((a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0));

  const uniqueColleges: string[] = [];
  for (const s of ncaaSeasonsList) {
    const tn = ((s as any).team_name || "").trim();
    if (tn && !uniqueColleges.includes(tn)) uniqueColleges.push(tn);
  }

  const collegesLine = uniqueColleges.length ? uniqueColleges.join(", ") : "N/A";

  const CURRENT_SEASON = new Date().getFullYear();

  const currentBatSeason = (
    isActive
      ? battingSeasons
          .filter((s: any) => Number(s.year) === CURRENT_SEASON)
          .slice(-1)[0] ??
        battingSeasons
          .filter((s: any) => Number(s.year) === latestYear)
          .slice(-1)[0]
      : null
  ) as BattingSeason | null;

  const currentPitSeason = (
    isActive
      ? pitchingSeasons
          .filter((s: any) => Number(s.year) === CURRENT_SEASON)
          .slice(-1)[0] ??
        pitchingSeasons
          .filter((s: any) => Number(s.year) === latestYear)
          .slice(-1)[0]
      : null
  ) as PitchingSeason | null;

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

  // ── Stats grids ──────────────────────────────────────────────────────────────

  const currentBattingGrid = currentBatSeason
    ? [
        { k: "AVG", v: fmtAvg(currentBatSeason.avg) },
        { k: "OBP", v: fmtAvg(currentBatSeason.obp) },
        { k: "SLG", v: fmtAvg(currentBatSeason.slg) },
        { k: "OPS", v: fmtAvg(currentBatSeason.ops) },
        { k: "HR", v: fmt(currentBatSeason.hr) },
        { k: "RBI", v: fmt(currentBatSeason.rbi) },
        { k: "H", v: fmt(currentBatSeason.h) },
        { k: "AB", v: fmt(currentBatSeason.ab) },
        { k: "R", v: fmt(currentBatSeason.r) },
        { k: "SB", v: fmt(currentBatSeason.sb) },
        { k: "BB", v: fmt(currentBatSeason.bb) },
        { k: "G", v: fmt(currentBatSeason.g) },
      ]
    : [];

  const currentPitchingGrid = currentPitSeason
    ? [
        { k: "ERA", v: fmt(currentPitSeason.era, 2) },
        { k: "WHIP", v: fmt(currentPitSeason.whip, 2) },
        { k: "IP", v: fmt(currentPitSeason.ip, 1) },
        { k: "W-L", v: `${fmt(currentPitSeason.w)}-${fmt(currentPitSeason.l)}` },
        { k: "K", v: fmt(currentPitSeason.ko) },
        { k: "BB", v: fmt(currentPitSeason.bb) },
        { k: "SV", v: fmt(currentPitSeason.saves) },
        { k: "G", v: fmt(currentPitSeason.g) },
        { k: "GS", v: fmt(currentPitSeason.gs) },
        { k: "ER", v: fmt(currentPitSeason.er) },
        { k: "K/9", v: fmt(currentPitSeason.k9, 2) },
        { k: "K/BB", v: fmt(currentPitSeason.kbb, 2) },
      ]
    : [];

  const careerBattingGrid = careerBatting
    ? [
        { k: "AVG", v: fmtAvg(careerBatting.avg) },
        { k: "OBP", v: fmtAvg(careerBatting.obp) },
        { k: "SLG", v: fmtAvg(careerBatting.slg) },
        { k: "OPS", v: fmtAvg(careerBatting.ops) },
        { k: "HR", v: fmt(careerBatting.hr) },
        { k: "RBI", v: fmt(careerBatting.rbi) },
        { k: "H", v: fmt(careerBatting.h) },
        { k: "AB", v: fmt(careerBatting.ab) },
        { k: "R", v: fmt(careerBatting.r) },
        { k: "SB", v: fmt(careerBatting.sb) },
        { k: "BB", v: fmt(careerBatting.bb) },
        { k: "G", v: fmt(careerBatting.g) },
      ]
    : [];

  const careerPitchingGrid = careerPitching
    ? [
        { k: "ERA", v: fmt(careerPitching.era, 2) },
        { k: "WHIP", v: fmt(careerPitching.whip, 2) },
        { k: "IP", v: fmt(careerPitching.ip, 1) },
        { k: "W-L", v: `${fmt(careerPitching.w)}-${fmt(careerPitching.l)}` },
        { k: "K", v: fmt(careerPitching.ko) },
        { k: "BB", v: fmt(careerPitching.bb) },
        { k: "SV", v: fmt(careerPitching.saves) },
        { k: "GP", v: fmt(careerPitching.g) },
        { k: "ER", v: fmt(careerPitching.er) },
        { k: "K/9", v: fmt(careerPitching.k9, 2) },
        { k: "K/BB", v: fmt(careerPitching.kbb, 2) },
        { k: "FIP", v: "--" },
      ]
    : [];

  const currentStatsGrid = isActive
    ? isPitcher
      ? currentPitchingGrid
      : currentBattingGrid
    : isPitcher
      ? careerPitchingGrid
      : careerBattingGrid;

  const currentStatsLabel = isActive
    ? `${CURRENT_SEASON} ${isPitcher ? "PITCHING" : "BATTING"}`
    : `CAREER ${isPitcher ? "PITCHING" : "BATTING"}`;

  // ── Career strip slots ────────────────────────────────────────────────────────

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
    sub: designatedLeftAnchor?.season_year
      ? String(designatedLeftAnchor.season_year)
      : "",
    role: "anchor",
  };

  const currentTeamBookend: FilmSlot = {
    img:
      designatedRightAnchor?.image_url ||
      designatedHeadshot?.image_url ||
      rightAnchorSilhouette,
    label:
      designatedRightAnchor?.team_name || ctxTeam || displayName,
    sub: designatedRightAnchor?.season_year
      ? String(designatedRightAnchor.season_year)
      : ctxLevel || "",
    role: "anchor",
  };

  const middleSlots: FilmSlot[] = playerPhotos.map((p: any) => ({
    img: p.image_url || PLAYER_SILHOUETTE_URL,
    label: p.caption || p.team_name || "",
    sub: p.season_year ? String(p.season_year) : "",
    role: "timeline",
  }));

  const careerSlots: FilmSlot[] = [hsBookend, ...middleSlots, currentTeamBookend];

  // ── Season table rows ─────────────────────────────────────────────────────────

  const allSeasons = isPitcher
    ? pitchingSeasons.sort(
        (a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0)
      )
    : battingSeasons.sort(
        (a: any, b: any) => (Number(a.year) || 0) - (Number(b.year) || 0)
      );

  // ── Schedule rows ─────────────────────────────────────────────────────────────

  const upcomingGames = (teamSchedule as any[])
    .filter((g) => {
      const d = g.game_date ? String(g.game_date).slice(0, 10) : "";
      return d >= new Date().toISOString().slice(0, 10);
    })
    .slice(0, 5);

  const recentGames = (teamSchedule as any[])
    .filter((g) => {
      const d = g.game_date ? String(g.game_date).slice(0, 10) : "";
      return d < new Date().toISOString().slice(0, 10);
    })
    .sort((a: any, b: any) =>
      String(b.game_date || "").localeCompare(String(a.game_date || ""))
    )
    .slice(0, 5);

  // ── Social handles ────────────────────────────────────────────────────────────

  const xHandle = (player.x_handle || player.twitter_handle || "").replace(/^@/, "");
  const igHandle = (player.ig_handle || player.instagram_handle || "").replace(/^@/, "");

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCK 3 — Career-path chronological strip
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="pp-career-strip" id="playerCareerStrip">
        <div className="pp-strip-scroll">
          {careerSlots.map((slot, idx) => (
            <div
              key={`${slot.role}-${idx}`}
              className={`pp-strip-slot ${slot.role === "anchor" ? "pp-anchor" : "pp-timeline"}`}
            >
              {/* Plain img inside a relative wrapper defeats the global img{height:auto} rule */}
              <div className="pp-slot-img-wrap">
                <img
                  className="pp-slot-img"
                  src={slot.img}
                  alt={slot.label}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCK 4 — Two-column player metadata
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="pp-meta-block" id="playerMeta">
        <div className="pp-meta-chips">
          <div className="pp-meta-chip">
            <span className="pp-mc-val">{ctxLevel || "--"}</span>
            <span className="pp-mc-lbl">LEVEL</span>
          </div>
          <div className="pp-meta-chip">
            <span className={`pp-mc-val ${isActive ? "pp-mc-active" : "pp-mc-retired"}`}>{statusLabel}</span>
            <span className="pp-mc-lbl">STATUS</span>
          </div>
          <div className="pp-meta-chip">
            <span className="pp-mc-val">{isPitcher ? "P" : player.position || "—"}</span>
            <span className="pp-mc-lbl">POS</span>
          </div>
          <div className="pp-meta-chip">
            <span className="pp-mc-val">{player.bats || "—"}/{player.throws || "—"}</span>
            <span className="pp-mc-lbl">B/T</span>
          </div>
          <div className="pp-meta-chip">
            <span className="pp-mc-val">{player.height || "--"}</span>
            <span className="pp-mc-lbl">HT</span>
          </div>
          <div className="pp-meta-chip">
            <span className="pp-mc-val">{player.weight || "--"}</span>
            <span className="pp-mc-lbl">WT</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCK 5 — Profile-page FunZone (six-tab, inline implementation)
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="pp-funzone" id="playerFunZone">

        {/* Tab strip — rendered via CSS :target trick for Server Component */}
        {/* We use anchor links + :target CSS to drive tab switching without JS */}
        {/* Each tab panel has an id; the active tab is shown via :target */}

        <nav className="pp-fz-tabs" aria-label="Player profile tabs">
          <a href="#ppTab-schedule" className="pp-fz-tab">
            <i className="ri-calendar-line" aria-hidden="true" />
            <span>Schedule</span>
          </a>
          <a href="#ppTab-stats" className="pp-fz-tab pp-fz-tab-default">
            <i className="ri-bar-chart-2-line" aria-hidden="true" />
            <span>Stats</span>
          </a>
          <a href="#ppTab-news" className="pp-fz-tab">
            <i className="ri-newspaper-line" aria-hidden="true" />
            <span>News</span>
          </a>
          <a href="#ppTab-social" className="pp-fz-tab">
            <i className="ri-share-line" aria-hidden="true" />
            <span>Social</span>
          </a>
          <a href="#ppTab-connect" className="pp-fz-tab">
            <i className="ri-group-line" aria-hidden="true" />
            <span>Connect</span>
          </a>
          <a href="#ppTab-upload" className="pp-fz-tab">
            <i className="ri-upload-cloud-line" aria-hidden="true" />
            <span>Upload</span>
          </a>
        </nav>

        {/* ── SCHEDULE tab ─────────────────────────────────────────────────── */}
        <div id="ppTab-schedule" className="pp-fz-panel">
          {upcomingGames.length > 0 ? (
            <div className="pp-sched-section">
              <div className="pp-sched-heading">UPCOMING GAMES</div>
              <table className="pp-sched-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>OPPONENT</th>
                    <th>LOCATION</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingGames.map((g: any, i: number) => (
                    <tr key={i}>
                      <td>{g.game_date ? String(g.game_date).slice(0, 10) : "--"}</td>
                      <td>{g.opponent || g.away_team || "--"}</td>
                      <td>{g.location || (g.is_home ? "HOME" : "AWAY")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pp-fz-placeholder">
              <i className="ri-calendar-line pp-ph-icon" />
              <p>Schedule will appear here once available.</p>
            </div>
          )}
          {recentGames.length > 0 && (
            <div className="pp-sched-section">
              <div className="pp-sched-heading">RECENT RESULTS</div>
              <table className="pp-sched-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>OPPONENT</th>
                    <th>RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map((g: any, i: number) => (
                    <tr key={i}>
                      <td>{g.game_date ? String(g.game_date).slice(0, 10) : "--"}</td>
                      <td>{g.opponent || g.away_team || "--"}</td>
                      <td>{g.result || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── STATS tab (default visible) ───────────────────────────────────── */}
        <div id="ppTab-stats" className="pp-fz-panel pp-fz-panel-default">

          {/* Current / career headline grid */}
          {currentStatsGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">{currentStatsLabel}</div>
              <div className="pp-stats-grid">
                {currentStatsGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Season-by-season table */}
          {allSeasons.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">SEASON BY SEASON</div>
              <div className="pp-season-table-wrap">
                <table className="pp-season-table">
                  <thead>
                    {isPitcher ? (
                      <tr>
                        <th>YR</th>
                        <th>TEAM</th>
                        <th>LV</th>
                        <th className="num">ERA</th>
                        <th className="num">IP</th>
                        <th className="num">K</th>
                        <th className="num">BB</th>
                        <th className="num">WHIP</th>
                        <th className="num">W</th>
                        <th className="num">L</th>
                        <th className="num">SV</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>YR</th>
                        <th>TEAM</th>
                        <th>LV</th>
                        <th className="num">AVG</th>
                        <th className="num">HR</th>
                        <th className="num">RBI</th>
                        <th className="num">H</th>
                        <th className="num">AB</th>
                        <th className="num">R</th>
                        <th className="num">SB</th>
                        <th className="num">OPS</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {allSeasons.map((s: any, i: number) =>
                      isPitcher ? (
                        <tr key={i}>
                          <td>{s.year || "--"}</td>
                          <td>{s.team_name || "--"}</td>
                          <td>{s.level || "--"}</td>
                          <td className="num">{fmt(s.era, 2)}</td>
                          <td className="num">{fmt(s.ip, 1)}</td>
                          <td className="num">{fmt(s.ko)}</td>
                          <td className="num">{fmt(s.bb)}</td>
                          <td className="num">{fmt(s.whip, 2)}</td>
                          <td className="num">{fmt(s.w)}</td>
                          <td className="num">{fmt(s.l)}</td>
                          <td className="num">{fmt(s.saves)}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td>{s.year || "--"}</td>
                          <td>{s.team_name || "--"}</td>
                          <td>{s.level || "--"}</td>
                          <td className="num">{fmtAvg(s.avg)}</td>
                          <td className="num">{fmt(s.hr)}</td>
                          <td className="num">{fmt(s.rbi)}</td>
                          <td className="num">{fmt(s.h)}</td>
                          <td className="num">{fmt(s.ab)}</td>
                          <td className="num">{fmt(s.r)}</td>
                          <td className="num">{fmt(s.sb)}</td>
                          <td className="num">{fmtAvg(s.ops)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Career totals (opposite type if both exist) */}
          {!isPitcher && careerBattingGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">CAREER BATTING TOTALS</div>
              <div className="pp-stats-grid">
                {careerBattingGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isPitcher && careerPitchingGrid.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-bar">CAREER PITCHING TOTALS</div>
              <div className="pp-stats-grid">
                {careerPitchingGrid.map(({ k, v }) => (
                  <div key={k} className="pp-stat-cell">
                    <div className="pp-stat-label">{k}</div>
                    <div className="pp-stat-val">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStatsGrid.length === 0 && allSeasons.length === 0 && (
            <div className="pp-fz-placeholder">
              <i className="ri-bar-chart-2-line pp-ph-icon" />
              <p>Stats will appear here once available.</p>
            </div>
          )}
        </div>

        {/* ── NEWS tab ─────────────────────────────────────────────────────── */}
        <div id="ppTab-news" className="pp-fz-panel">
          <div className="pp-fz-placeholder">
            <i className="ri-newspaper-line pp-ph-icon" />
            <p>Latest headlines for {firstName} will appear here.</p>
          </div>
        </div>

        {/* ── SOCIAL tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-social" className="pp-fz-panel">
          <div className="pp-social-tag">#YATABOY</div>
          <div className="pp-social-sub">Show some love for {firstName}!</div>
          <div className="pp-social-links">
            {xHandle && (
              <a
                href={`https://x.com/${xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-social-link"
              >
                <i className="ri-twitter-x-line" /> @{xHandle}
              </a>
            )}
            {igHandle && (
              <a
                href={`https://instagram.com/${igHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-social-link"
              >
                <i className="ri-instagram-line" /> @{igHandle}
              </a>
            )}
            {!xHandle && !igHandle && (
              <div className="pp-fz-placeholder">
                <i className="ri-share-line pp-ph-icon" />
                <p>Social links will appear here once available.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── CONNECT tab ──────────────────────────────────────────────────── */}
        <div id="ppTab-connect" className="pp-fz-panel">
          <div className="pp-fz-placeholder">
            <i className="ri-group-line pp-ph-icon" />
            <p>
              Connect with {firstName} through the{" "}
              <strong>Mentorship Marketplace</strong>.
            </p>
          </div>
        </div>

        {/* ── UPLOAD tab ───────────────────────────────────────────────────── */}
        <div id="ppTab-upload" className="pp-fz-panel">
          <div className="pp-fz-placeholder">
            <i className="ri-upload-cloud-line pp-ph-icon" />
            <p>
              Upload your favorite memories to {firstName}&apos;s{" "}
              <strong>Career Path timeline</strong>.
            </p>
          </div>
        </div>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          INLINE STYLES — scoped to this page only, no global changes
          ═══════════════════════════════════════════════════════════════════════ */}
      <style>{`
        /* ── Block 3: Career strip ─────────────────────────────────────── */
        .pp-career-strip {
          width: 100%;
          overflow: hidden;
          background: #000;
          line-height: 0;
        }
        .pp-strip-scroll {
          display: flex;
          flex-direction: row;
          gap: 0;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          height: 200px;
        }
        .pp-strip-scroll::-webkit-scrollbar { display: none; }

        .pp-strip-slot {
          flex-shrink: 0;
          height: 100%;
          overflow: hidden;
          position: relative;
        }
        /* Anchor slots slightly wider than timeline slots */
        .pp-anchor { width: 160px; }
        .pp-timeline { width: 120px; }

        /* Wrapper fills the slot — defeats global img{height:auto} */
        .pp-slot-img-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #111;
        }

        /* Absolute-positioned img fills wrapper regardless of global resets */
        .pp-slot-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          display: block;
          border-radius: 0;
          border: none;
          outline: none;
        }

        /* ── Block 4: Metadata chip row (matches gallery Row 4 height) ── */
        .pp-meta-block {
          width: 100%;
          overflow: hidden;
          background: #111;
          border-top: 1px solid rgba(255,255,255,.08);
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .pp-meta-chips {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0;
        }
        .pp-meta-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 10px 8px 8px;
          border-right: 1px solid rgba(255,255,255,.08);
          text-align: center;
          min-width: 0;
        }
        .pp-meta-chip:first-child {
          border-left: 1px solid rgba(255,255,255,.08);
        }
        .pp-mc-val {
          display: block;
          font: 700 clamp(14px, 2.2vw, 22px)/1 "Bebas Neue", sans-serif;
          letter-spacing: .04em;
          color: var(--fg, #f4f4f4);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .pp-mc-lbl {
          display: block;
          font: 300 9px/1.1 Oswald, sans-serif;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(255,255,255,.7);
          white-space: nowrap;
        }
        .pp-mc-active { color: #20d67b; }
        .pp-mc-retired { color: #888; }

        /* ── Block 5: FunZone — tab top flush with flip card grid top ─── */
        .pp-funzone {
          width: 100%;
          background: var(--card-bg, #1a1a1a);
          padding-bottom: 24px;
        }

        /* Tab strip */
        .pp-fz-tabs {
          display: flex;
          flex-direction: row;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
          overflow-x: auto;
          scrollbar-width: none;
        }
        .pp-fz-tabs::-webkit-scrollbar { display: none; }
        .pp-fz-tab {
          flex: 1;
          min-width: 52px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 10px 4px 8px;
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted, #888);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          transition: color .15s, border-color .15s;
        }
        .pp-fz-tab i { font-size: 16px; }
        .pp-fz-tab:hover,
        .pp-fz-tab-default {
          color: var(--fg, #f0f0f0);
          border-bottom-color: var(--accent, #c8a96e);
        }

        /* Tab panels — all hidden by default; :target shows the targeted one */
        .pp-fz-panel {
          display: none;
          padding: 14px 12px;
        }
        /* Stats panel is the default visible panel */
        .pp-fz-panel-default {
          display: block;
        }
        /* When a tab anchor is targeted, show that panel and hide the default */
        #ppTab-schedule:target,
        #ppTab-stats:target,
        #ppTab-news:target,
        #ppTab-social:target,
        #ppTab-connect:target,
        #ppTab-upload:target {
          display: block;
        }
        /* When any other tab is targeted, hide the default stats panel */
        #ppTab-schedule:target ~ #ppTab-stats.pp-fz-panel-default,
        body:has(#ppTab-schedule:target) #ppTab-stats.pp-fz-panel-default,
        body:has(#ppTab-news:target) #ppTab-stats.pp-fz-panel-default,
        body:has(#ppTab-social:target) #ppTab-stats.pp-fz-panel-default,
        body:has(#ppTab-connect:target) #ppTab-stats.pp-fz-panel-default,
        body:has(#ppTab-upload:target) #ppTab-stats.pp-fz-panel-default {
          display: none;
        }

        /* Stats grid */
        .pp-stats-section { margin-bottom: 16px; }
        .pp-stats-bar {
          background: rgba(255,255,255,.06);
          color: var(--fg, #f0f0f0);
          text-align: center;
          padding: 5px 8px;
          font: 700 10px "Bebas Neue", sans-serif;
          letter-spacing: .08em;
          border-radius: 4px;
          margin-bottom: 6px;
        }
        .pp-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
        }
        .pp-stat-cell {
          background: rgba(255,255,255,.05);
          border-radius: 6px;
          padding: 6px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .pp-stat-label {
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted, #888);
        }
        .pp-stat-val {
          font: 700 15px/1 "Bebas Neue", sans-serif;
          color: var(--fg, #f0f0f0);
        }

        /* Season table */
        .pp-season-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 6px;
        }
        .pp-season-table {
          width: 100%;
          border-collapse: collapse;
          font: 400 10px/1.4 Oswald, sans-serif;
          min-width: 480px;
        }
        .pp-season-table th {
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--muted, #888);
          padding: 6px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
          text-align: left;
          background: var(--card-bg, #1a1a1a);
          white-space: nowrap;
        }
        .pp-season-table th.num,
        .pp-season-table td.num {
          text-align: right;
        }
        .pp-season-table td {
          padding: 6px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.06));
          white-space: nowrap;
          color: var(--fg, #f0f0f0);
        }
        .pp-season-table tr:hover td {
          background: rgba(255,255,255,.025);
        }

        /* Schedule table */
        .pp-sched-section { margin-bottom: 16px; }
        .pp-sched-heading {
          font: 700 10px "Bebas Neue", sans-serif;
          letter-spacing: .08em;
          color: var(--muted, #888);
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .pp-sched-table {
          width: 100%;
          border-collapse: collapse;
          font: 400 10px/1.4 Oswald, sans-serif;
        }
        .pp-sched-table th {
          font: 600 8px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          color: var(--muted, #888);
          padding: 4px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
          text-align: left;
        }
        .pp-sched-table td {
          padding: 5px 6px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.06));
          color: var(--fg, #f0f0f0);
        }

        /* Social */
        .pp-social-tag {
          font: 700 20px/1 "Bebas Neue", sans-serif;
          letter-spacing: .06em;
          color: var(--accent, #c8a96e);
          margin-bottom: 4px;
        }
        .pp-social-sub {
          font: 400 11px/1.4 Oswald, sans-serif;
          color: var(--muted, #888);
          margin-bottom: 12px;
        }
        .pp-social-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pp-social-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 400 12px/1 Oswald, sans-serif;
          color: var(--fg, #f0f0f0);
          text-decoration: none;
          padding: 8px 12px;
          background: rgba(255,255,255,.06);
          border-radius: 6px;
        }
        .pp-social-link:hover {
          background: rgba(255,255,255,.1);
        }

        /* Placeholder */
        .pp-fz-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 24px 16px;
          text-align: center;
          color: var(--muted, #888);
        }
        .pp-ph-icon {
          font-size: 28px;
          opacity: .4;
        }
        .pp-fz-placeholder p {
          font: 400 11px/1.5 Oswald, sans-serif;
          max-width: 240px;
        }
      `}</style>
    </>
  );
}
