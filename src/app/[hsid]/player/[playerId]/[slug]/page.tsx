import { Metadata } from "next";
import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import {
  getSchoolByHsid,
  getPlayerById,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
  getPlayerPhotos,
  getResolvedCurrentTeam,
} from "@/lib/db";

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
    careerBatting,
    careerPitching,
    playerPhotos,
    resolvedCurrentTeam,
  ] = await Promise.all([
    getPlayerBattingStats(safePlayerId),
    getPlayerPitchingStats(safePlayerId),
    getPlayerCareerBatting(safePlayerId),
    getPlayerCareerPitching(safePlayerId),
    getPlayerPhotos(safePlayerId),
    getResolvedCurrentTeam(safePlayerId),
  ]);

  const displayName = `${player.firstname || ""} ${player.lastname || ""}`.trim();

  // TEAM DISPLAY LOGIC: Kill the Syracuse Ghost
  let teamDisplayName = (resolvedCurrentTeam?.team_name || "").trim();
  if (!teamDisplayName || teamDisplayName === "Syracuse Mets") {
    const allSeasons = [...(battingSeasons || []), ...(pitchingSeasons || [])];
    const betterTeam = allSeasons
      .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
      .find(s => s.team_name && s.team_name !== "Syracuse Mets");
    if (betterTeam) teamDisplayName = betterTeam.team_name;
  }
  if (!teamDisplayName) teamDisplayName = "Alumni";

  return (
    <main id="main-content" className="player-profile">
      {/* Player Hero Section */}
      <div id="playerHeroMeta" className="player-meta-band">
        <div className="player-meta-band-inner">
          <div className="player-meta-id">
            <div className="player-meta-id-name">{displayName}</div>
            <div className="player-meta-id-context">{teamDisplayName}</div>
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
                width={300}
                height={400}
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
