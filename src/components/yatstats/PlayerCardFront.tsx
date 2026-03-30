// src/components/yatstats/PlayerCardFront.tsx
// Front face of the flip card: HS image, chips, name, meta, varsity dots, last 3 games

import { levelLabel, levelClass, gradClass, varsityDots } from "@/lib/playerUtils";
import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  /**
   * Explicitly designated YATSTATS_FRONT image URL from player_photos WHERE image_role='YATSTATS_FRONT'.
   * When provided, this is used as the primary front-card image.
   * Falls back to legacy players/then/{imageId}.jpg when null/undefined.
   * Do NOT pass the legacy then-path here — p// src/components/yatstats/PlayerCardFront.tsx
// Front face of the flip card: staged front-card fields + front image

import { levelClass } from "@/lib/playerUtils";
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

  const statusLabel = asText(p.status_label) || "--";
  const levelLabel = asText(p.level_label || p.level) || "--";
  const lvlCls = levelClass(levelLabel);

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

  const nameTop = displayName
    ? displayName.split(" ").slice(0, -1).join(" ")
    : firstName;

  const nameBottom = displayName
    ? displayName.split(" ").slice(-1).join(" ")
    : lastName;

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
        <div className="yat-front-top">
          <div className="yat-front-top-spacer" />
          <div className="yat-front-top-right">
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
        </div>

        <div className="yat-info-block">
          <div className="yat-name">
            <span>{nameTop || "--"}</span>
            <span>{nameBottom || ""}</span>
          </div>

          <div className="yat-meta">
            <span>{teamLine}</span>
          </div>

          <div className="yat-front-badge-row">
            <span className={`front-chip ${lvlCls}`}>{levelLabel}</span>
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
}ass null and let the component resolve it.
   */
  frontImageUrl?: string | null;
  /** When true, computes status from is_active_2025 field; otherwise always shows "ACTIVE 2025" */
  isAllTime?: boolean;
}

export default function PlayerCardFront({ player: p, frontImageUrl = null, isAllTime }: PlayerCardFrontProps) {
  const lvl = levelLabel(String(p.level || ""));
  const lvlCls = levelClass(lvl);
  const isPitcher = p.is_pitcher === true;
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const imageId = String(p.playerid || "");
  // Prefer designated YATSTATS_FRONT row; fall back to legacy players/then/{imageId}.jpg
  const photoUrl = frontImageUrl || getPlayerThenImageUrl(imageId);
  const thenSilhouetteUrl = getThenSilhouetteUrl(isPitcher);

  const statusLabel = isAllTime
    ? (!!p.is_active_2025 ? "ACTIVE 2025" : (p.draft_info ? "RETIRED-DRAFTED" : "RETIRED"))
    : "ACTIVE 2025";

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
          {gc && <span className="front-chip">CLASS OF {gc}</span>}
          <span className="front-chip">{statusLabel}</span>
          {lvl && <span className={`front-chip ${lvlCls}`}>{lvl}</span>}
        </div>
        <div className="yat-info-block">
          <div className="yat-name">
            <span>{String(p.firstname || "")}</span>
            <span>{String(p.lastname || "")}</span>
          </div>
          <div className="yat-meta">
            <span>
              {[p.position, p.bats && p.throws ? `B/T ${p.bats}/${p.throws}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {dots.length > 0 && (
            <div className="yat-dots">
              {dots.map((y, i) => (
                <div key={i} className="yat-dot">{y}</div>
              ))}
            </div>
          )}
          <div className="yat-game-block">
            <div className="yat-pill">LAST 3 GAMES</div>
            <div className="yat-game-text">
              <span className="yat-log">--</span>
              <span className="yat-log">--</span>
              <span className="yat-log">--</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
