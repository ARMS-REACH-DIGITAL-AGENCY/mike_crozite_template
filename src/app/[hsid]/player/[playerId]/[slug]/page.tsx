// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// Player profile child page — lives inside the shared shell.
// DO NOT touch the shell, layout, or any other file.
//
// Block 3 — Career-path chronological strip
// Block 4 — Two-column player metadata
// Block 5 — Profile-page six-tab FunZone (inline, not the shared FunZone component)

"use client" in (0 as any); // this file is a Server Component — no "use client"

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
  getResolvedCurrentTeam,
  getFlipCardTransactionStatus,
} from "@/lib/db";
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
    resolvedCurrentTeam,
    transactionStatus,
  ] = await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
    getFlipCardTransactionStatus(safePlayerId),
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
  const rawStatusLabel = isActive ? "ACTIVE" : "RETIRED";

  const resolvedTeamName = (resolvedCurrentTeam?.team_name || "").trim();
  const resolvedLevel = resolvedCurrentTeam?.level
    ? String(resolvedCurrentTeam.level).toUpperCase()
    : "";

  const mostRecentSeason = [...battingSeasons, ...pitchingSeasons]
    .sort(
      (a: BattingSeason | PitchingSeason, b: BattingSeason | PitchingSeason) =>
        (Number(b.year) || 0) - (Number(a.year) || 0)
    )[0] as BattingSeason | PitchingSeason | undefined;

  const rawCtxTeam = resolvedTeamName || mostRecentSeason?.team_name || "";
  const ctxLevel =
    resolvedLevel ||
    (mostRecentSeason?.level ? String(mostRecentSeason.level).toUpperCase() : "");

  // Sourced-fact override: a confirmed MLB transaction (or, failing
  // that, confirmed multi-run roster absence) outranks both
  // v_player_current_team_resolved and any stat-derived team name,
  // since neither of those notices a player leaving affiliated baseball.
  // See scripts/apply-mlb-transaction-status.ts and the roster-accuracy
  // audit findings on the two disconnected resolvers.
  const affiliationStatus = String(transactionStatus?.team_affiliation_status || "").trim().toUpperCase();
  const lastTransactionType = String(transactionStatus?.last_transaction_type || "").trim();
  const isSourcedDeparture =
    (affiliationStatus === "FREE AGENT" || affiliationStatus === "RETIRED") && !!lastTransactionType;
  const lastTransactionDateLabel = (() => {
    const raw = String(transactionStatus?.last_transaction_date || "").trim();
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  })();

  const statusLabel = isSourcedDeparture ? affiliationStatus : rawStatusLabel;
  const ctxTeam = isSourcedDeparture ? lastTransactionType.toUpperCase() : rawCtxTeam;

  const currentTeamId = resolvedCurrentTeam?.teamid
    ? String(resolvedCurrentTeam.teamid)
    : (mostRecentSeason as any)?.teamid
      ? String((mostRecentSeason as any).teamid)
      : null;

  const teamCtx = currentTeamId ? await getTeamContext(currentTeamId) : null;
  const ctxOrg = (teamCtx?.organization || "").trim();
  const ctxConference = (teamCtx?.conference || "").trim();
  const rawCurrentOrgOrConference = ctxOrg || ctxConference || "";
  const currentOrgOrConference = isSourcedDeparture
    ? [transactionStatus?.last_transaction_team_name, lastTransactionDateLabel].filter(Boolean).join(" — ")
    : rawCurrentOrgOrConference;

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
          BLOCK 5 — Profile-page FunZone (six-tab, inline implementation)
          Block 4 (metadata chips) is now rendered in layout.tsx Row 4 via row4Content.
          ═══════════════════════════════════════════════════════════════════════ */}
        <div className="pp-funzone-outer">
        <section className="pp-funzone" id="playerFunZone">

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

        {/* Sticky tab strip shell — now at the BOTTOM of Block 5, above Block 6 */}
        <div className="pp-fz-tabs-shell">
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
        </div>

      </section>
      </div>{/* /pp-funzone-outer */}

      {/* ═══════════════════════════════════════════════════════════════════════
          INLINE STYLES — scoped to this page only, no global changes
          ═══════════════════════════════════════════════════════════════════════ */}
      <style>{`
        /* ── Block 4: Metadata chip row — rendered in yat-row4-shell via layout.tsx row4Content ── */
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

        /* ── Block 5: FunZone — fixed-height flex column ─────────────── */
        /*
         * Block 5 occupies exactly the viewport space between the sticky
         * rows (Row 1–4) and the fixed footer (Row 6 / Block 6).
         * Row heights from YatStyles :root:
         *   --row1-h : 36px   (34px on mobile)
         *   --row2-h : 54px   (48px on mobile)
         *   --row3-h : 100px  (career strip)
         *   --row4-h : 56px   (metadata chips)
         *   --footerH: clamp(56px,8vh,77px)
         * Row 5 shell adds padding-top: 8px.
         *
         * pp-funzone fills the remaining height as a flex column:
         *   - active pp-fz-panel grows to fill the space and scrolls internally
         *   - pp-fz-tabs-shell is the last flex child, always at the bottom
         */
        /* Outer wrapper — full-width background, centered fixed-width inner */
        .pp-funzone-outer {
          width: 100%;
          background: var(--card-bg, #1a1a1a);
        }
        .pp-funzone {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 12px;
          display: flex;
          flex-direction: column;
          /*
           * body already has padding-bottom: var(--footerH) which pushes
           * <main> up above the fixed footer — so we must NOT subtract
           * --footerH here or we get a double-gap.
           * We only subtract the sticky rows above Block 5 and the 8px
           * padding-top of .yat-row5-shell.
           */
          height: calc(
            100dvh
            - var(--row1-h, 36px)
            - var(--row2-h, 54px)
            - var(--row3-h, 100px)
            - var(--row4-h, 56px)
            - 8px
          );
          min-height: 0;
        }

        /* Tab strip — last flex child, always at the bottom of Block 5 */
        .pp-fz-tabs-shell {
          flex-shrink: 0;
          z-index: 50;
          background: var(--card-bg, #1a1a1a);
          border-top: 1px solid var(--line, rgba(255,255,255,.08));
          width: 100%;
        }

        /* Tab strip — full width of pp-funzone (already constrained) */
        .pp-fz-tabs {
          display: flex;
          flex-direction: row;
          width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .pp-fz-tabs::-webkit-scrollbar { display: none; }
        .pp-fz-tab {
          flex: 1 1 0;
          min-width: 52px;
          max-width: calc(100% / 6);
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
          border-top: 2px solid transparent;
          transition: color .15s, border-color .15s;
        }
        .pp-fz-tab i { font-size: 16px; }
        .pp-fz-tab:hover {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }
        /* Default active tab (Stats) — shown when no hash is targeted */
        .pp-fz-tab-default {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }
        /* When any non-stats tab is targeted, remove active style from default STATS tab */
        body:has(#ppTab-schedule:target) .pp-fz-tab-default,
        body:has(#ppTab-news:target) .pp-fz-tab-default,
        body:has(#ppTab-social:target) .pp-fz-tab-default,
        body:has(#ppTab-connect:target) .pp-fz-tab-default,
        body:has(#ppTab-upload:target) .pp-fz-tab-default {
          color: var(--muted, #888);
          border-top-color: transparent;
        }
        /* Active indicator follows the :target tab */
        body:has(#ppTab-schedule:target) a[href="#ppTab-schedule"],
        body:has(#ppTab-stats:target) a[href="#ppTab-stats"],
        body:has(#ppTab-news:target) a[href="#ppTab-news"],
        body:has(#ppTab-social:target) a[href="#ppTab-social"],
        body:has(#ppTab-connect:target) a[href="#ppTab-connect"],
        body:has(#ppTab-upload:target) a[href="#ppTab-upload"] {
          color: var(--fg, #f0f0f0);
          border-top-color: var(--accent, #c8a96e);
        }

        /* Tab panels — all hidden by default; :target shows the targeted one */
        .pp-fz-panel {
          display: none;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 14px 12px;
        }
        /* Stats panel is the default visible panel */
        .pp-fz-panel-default {
          display: flex;
          flex-direction: column;
        }
        /* When a tab anchor is targeted, show that panel and hide the default */
        #ppTab-schedule:target,
        #ppTab-stats:target,
        #ppTab-news:target,
        #ppTab-social:target,
        #ppTab-connect:target,
        #ppTab-upload:target {
          display: flex;
          flex-direction: column;
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
