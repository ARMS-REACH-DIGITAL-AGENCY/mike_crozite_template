import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import {
  getSchoolByHsid,
  getPlayerById,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getResolvedCurrentTeam,
  getPlayerMlbApiId,
  upsertPlayerMlbApiId,
} from "@/lib/db";
import {
  fetchMlbPlayerCurrentTeam,
  fetchNextTeamGame,
  searchMlbPlayerByName,
  type MlbCurrentTeamInfo,
  type MlbNextGame,
} from "@/lib/mlbApi";

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

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}) {
  const { hsid, playerId } = await params;
  const safePlayerId = String(parseInt(playerId, 10));

  const [player, school] = await Promise.all([
    getPlayerById(safePlayerId),
    getSchoolByHsid(hsid),
  ]);

  if (!player) notFound();

  const [
    battingSeasons,
    pitchingSeasons,
    resolvedCurrentTeam,
    storedMlbId,
  ] = await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
    getPlayerMlbApiId(safePlayerId),
  ]);

  const displayName = `${player.firstname || ""} ${player.lastname || ""}`.trim();

  // ---------------------------------------------------------------------------
  // LIVE MLB API LOOKUP
  // Priority: player_source_map (stable MLB person ID) → name search fallback.
  //
  // Fast path: if the weekly sync has already written the player's MLB person
  // ID into player_source_map, use it directly — one API call, instant result.
  //
  // Fallback: if no ID is stored yet (sync hasn't run, or player was UNMATCHED
  // due to a nickname mismatch that has since been fixed), search by name using
  // the sports_players endpoint.  We check useName first (the MLB API's
  // preferred/nickname field — e.g. "Dom" for Dominic Hamel) which matches
  // what our DB stores, so the hit is usually exact.  Once found we persist
  // the MLB ID to player_source_map so subsequent renders use the fast path.
  // ---------------------------------------------------------------------------
  let mlbInfo: MlbCurrentTeamInfo | null = null;
  let nextGame: MlbNextGame | null = null;

  if (storedMlbId) {
    // Fast path — stable ID already known
    mlbInfo = await fetchMlbPlayerCurrentTeam(storedMlbId);
  } else {
    // Name-search fallback — uses sports_players endpoint (documented API)
    mlbInfo = await searchMlbPlayerByName(
      player.firstname || "",
      player.lastname || ""
    );
    // Persist the ID so next render uses the fast path (fire-and-forget)
    if (mlbInfo) {
      void upsertPlayerMlbApiId(safePlayerId, mlbInfo.mlbPersonId, mlbInfo.fullName);
    }
  }

  if (mlbInfo) {
    nextGame = await fetchNextTeamGame(mlbInfo.teamId, mlbInfo.sportId);
  }

  // ---------------------------------------------------------------------------
  // TEAM DISPLAY LOGIC
  // Priority (highest → lowest):
  //   1. Live MLB Stats API  (real-time, authoritative)
  //   2. v_player_current_team_resolved  (populated by weekly roster sync)
  //   3. Most-recent non-ghost batting/pitching season team
  //   4. "Alumni" (player not found in any active roster)
  //
  // "Syracuse Mets" is a phantom team from stale roster-truth rows — suppress it
  // at every level.  Raw numeric team IDs mean the teams lookup table has no
  // entry for that teamid; skip those too.
  // ---------------------------------------------------------------------------
  const isSyracuseMets = (name: string) => /^syracuse\s+mets$/i.test(name.trim());

  let teamDisplayName = mlbInfo?.teamName ?? "";
  let teamLevel = mlbInfo?.level ?? "";
  let teamStatus = mlbInfo?.active ? (mlbInfo.status || "Active") : "";

  if (!teamDisplayName) {
    // Fall back to resolved current team from the weekly sync
    const rct = (resolvedCurrentTeam?.team_name || "").trim();
    if (rct && !isSyracuseMets(rct)) {
      teamDisplayName = rct;
      teamLevel = resolvedCurrentTeam?.level ?? "";
    }
  }

  if (!teamDisplayName || isSyracuseMets(teamDisplayName)) {
    // Fall back to the most-recent valid season team
    const allSeasons = [...(battingSeasons || []), ...(pitchingSeasons || [])];
    const betterTeam = allSeasons
      .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
      .find(s => s.team_name && !isSyracuseMets(s.team_name) && !/^\d+$/.test(s.team_name));
    if (betterTeam) {
      teamDisplayName = betterTeam.team_name;
      teamLevel = betterTeam.level ?? "";
    }
  }

  if (!teamDisplayName || isSyracuseMets(teamDisplayName)) {
    teamDisplayName = "Alumni";
    teamLevel = "";
    teamStatus = "";
  }

  // Format next game string: "03-27 @ BUF" or "03-27 vs BUF"
  const nextGameStr = nextGame
    ? `${nextGame.date.slice(5).replace("-", "/")} ${nextGame.home ? "vs" : "@"} ${nextGame.opponent}`
    : null;

  return (
    <main id="main-content" className="player-profile">
      {/* Player Hero Section */}
      <div id="playerHeroMeta" className="player-meta-band">
        <div className="player-meta-band-inner">
          <div className="player-meta-id">
            <div className="player-meta-id-name">{displayName}</div>
            <div className="player-meta-id-context">
              {teamDisplayName}
              {teamLevel && (
                <span className="player-level-badge">{teamLevel}</span>
              )}
            </div>
            {(teamStatus || nextGameStr) && (
              <div className="player-meta-live">
                {teamStatus && (
                  <span
                    className="player-status-badge"
                    data-active={String(mlbInfo?.active ?? false)}
                  >
                    {teamStatus}
                  </span>
                )}
                {nextGameStr && mlbInfo?.teamAbbreviation && (
                  <span className="player-next-game">
                    Next {mlbInfo.teamAbbreviation} Game: {nextGameStr}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="player-content-wrap">
        <div className="player-profile-grid">
          {/* Left Column: Headshot & Bio */}
          <div className="player-profile-left">
            <div className="player-headshot-wrap">
              <SafeImage
                src={player.headshot_url || "/img/player-placeholder.png"}
                alt={displayName}
                className="player-headshot"
              />
            </div>
            <div className="player-bio-card">
              <div className="bio-row">
                <span className="bio-label">POSITION</span>
                <span className="bio-value">{player.position || "--"}</span>
              </div>
              <div className="bio-row">
                <span className="bio-label">B/T</span>
                <span className="bio-value">{player.bats || "-"}/{player.throws || "-"}</span>
              </div>
              <div className="bio-row">
                <span className="bio-label">HEIGHT</span>
                <span className="bio-value">{player.height || "--"}</span>
              </div>
              <div className="bio-row">
                <span className="bio-label">WEIGHT</span>
                <span className="bio-value">{player.weight || "--"}</span>
              </div>
              <div className="bio-row">
                <span className="bio-label">CLASS</span>
                <span className="bio-value">{player.grad_year || "--"}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Stats & History */}
          <div className="player-profile-right">
            {/* Career Strip */}
            <div className="career-progression-strip">
              <div className="career-strip-inner">
                <div className="career-slot">
                  <div className="slot-label">HIGH SCHOOL</div>
                  <div className="slot-team">{school?.hsname || "Hamilton"}</div>
                </div>
                <div className="career-slot">
                  <div className="slot-label">COLLEGE</div>
                  <div className="slot-team">{player.college_name || "--"}</div>
                </div>
                <div className="career-slot active">
                  <div className="slot-label">CURRENT</div>
                  <div className="slot-team">{teamDisplayName}</div>
                </div>
              </div>
            </div>

            {/* Stats Tables */}
            <div className="player-stats-wrap">
              {battingSeasons.length > 0 && (
                <div className="stats-section">
                  <h3 className="stats-title">BATTING HISTORY</h3>
                  <div className="stats-table-scroll">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>YEAR</th>
                          <th>TEAM</th>
                          <th>LVL</th>
                          <th>G</th>
                          <th>AB</th>
                          <th>R</th>
                          <th>H</th>
                          <th>HR</th>
                          <th>RBI</th>
                          <th>AVG</th>
                          <th>OPS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {battingSeasons.map((s, i) => (
                          <tr key={i}>
                            <td>{s.year}</td>
                            <td>{s.team_name}</td>
                            <td>{s.level}</td>
                            <td>{fmt(s.g)}</td>
                            <td>{fmt(s.ab)}</td>
                            <td>{fmt(s.r)}</td>
                            <td>{fmt(s.h)}</td>
                            <td>{fmt(s.hr)}</td>
                            <td>{fmt(s.rbi)}</td>
                            <td>{fmtAvg(s.avg)}</td>
                            <td>{fmtAvg(s.ops)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {pitchingSeasons.length > 0 && (
                <div className="stats-section">
                  <h3 className="stats-title">PITCHING HISTORY</h3>
                  <div className="stats-table-scroll">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>YEAR</th>
                          <th>TEAM</th>
                          <th>LVL</th>
                          <th>W-L</th>
                          <th>ERA</th>
                          <th>G</th>
                          <th>GS</th>
                          <th>SV</th>
                          <th>IP</th>
                          <th>SO</th>
                          <th>WHIP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pitchingSeasons.map((s, i) => (
                          <tr key={i}>
                            <td>{s.year}</td>
                            <td>{s.team_name}</td>
                            <td>{s.level}</td>
                            <td>{s.w}-{s.l}</td>
                            <td>{fmt(s.era, 2)}</td>
                            <td>{fmt(s.g)}</td>
                            <td>{fmt(s.gs)}</td>
                            <td>{fmt(s.saves)}</td>
                            <td>{fmt(s.ip, 1)}</td>
                            <td>{fmt(s.ko)}</td>
                            <td>{fmt(s.whip, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
