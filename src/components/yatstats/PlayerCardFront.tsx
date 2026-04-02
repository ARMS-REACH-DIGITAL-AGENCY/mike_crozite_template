import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  frontImageUrl?: string | null;
  isAllTime?: boolean;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

export default function PlayerCardFront({
  player: p,
  frontImageUrl = null,
}: PlayerCardFrontProps) {
  const imageId = String(p.playerid || "");
  const isPitcher = p.is_pitcher === true;

  const photoUrl = frontImageUrl || getPlayerThenImageUrl(imageId);
  const thenSilhouetteUrl = getThenSilhouetteUrl(isPitcher);

  const displayName = asText(p.display_name);
  const firstName = asText(p.first_name || p.firstname);
  const lastName = asText(p.last_name || p.lastname);

  const classOf = asText(p.class_of);
  const rosterYears = asTextArray(p.roster_years);

  // status_label: stage rows have it explicitly; TBC active roster rows are always ACTIVE
  const statusLabel = asText(p.status_label) || (p.stat_year || p.pitch_year ? "ACTIVE" : "--");
  // level_label: stage rows use level_label; TBC rows use level (already normalized in db.ts)
  const levelLabel = asText(p.level_label) || asText(p.level) || "--";

  const currentTeamName = asText(p.current_team_name);
  const currentOrgOrConferenceName = asText(p.current_org_or_conference_name);

  const lg1 = asText(p.lg1_line) || "--";
  const lg2 = asText(p.lg2_line) || "--";
  const lg3 = asText(p.lg3_line) || "--";

  const nextGameDate = asText(p.next_game_date);
  const nextGameHomeAway = asText(p.next_game_home_away);
  const nextGameOpponent = asText(p.next_game_opponent);
  const nextGameTimeLocal = asText(p.next_game_time_local);

  const nextGameLine =
    [nextGameDate, nextGameHomeAway, nextGameOpponent, nextGameTimeLocal]
      .filter(Boolean)
      .join(" ") || "TBD";

  const teamLine =
    [currentTeamName, currentOrgOrConferenceName].filter(Boolean).join(" - ") || "--";

  const finalFirst = displayName ? displayName.split(" ").slice(0, -1).join(" ") : firstName;
  const finalLast = displayName ? displayName.split(" ").slice(-1).join(" ") : lastName;

  return (
    <div className="yat-face yat-front">
      <div
        className="yat-bg"
        data-src={photoUrl}
        data-placeholder={thenSilhouetteUrl}
        style={{ backgroundImage: `url('${photoUrl}')` }}
      />
      <div className="yat-shade" />

      <div className="yat-front-content">
        <div className="yat-chips-col">
          {classOf && <span className="front-chip">CLASS OF {classOf}</span>}

          {rosterYears.length > 0 && (
            <div className="yat-dots">
              {rosterYears.map((y) => (
                <div key={y} className="yat-dot">
                  {y.slice(-2)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="yat-info-block">
          <div className="yat-name">
            <span>{finalFirst || "--"}</span>
            <span>{finalLast || ""}</span>
          </div>

          <div className="yat-meta">
            <span>{teamLine}</span>
          </div>

          <div className="yat-front-badge-row">
            <span className="front-chip">{levelLabel}</span>
            <span className="front-chip">{statusLabel}</span>
          </div>

          <div className="yat-game-block">
            <div className="yat-pill">LAST 3 GAMES</div>
            <div className="yat-game-text">
              <span className="yat-log">{lg1}</span>
              <span className="yat-log">{lg2}</span>
              <span className="yat-log">{lg3}</span>
            </div>
          </div>

          <div className="yat-game-block">
            <div className="yat-pill">NEXT GAME</div>
            <div className="yat-game-text">
              <span>{nextGameLine}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
