// src/components/yatstats/PlayerCardFront.tsx
// Front face of the flip card: HS image, chips, name, current team, meta, varsity dots

import { levelLabel, levelClass, gradClass, varsityDots } from "@/lib/playerUtils";
import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  frontImageUrl?: string | null;
  isAllTime?: boolean;
}

export default function PlayerCardFront({
  player: p,
  frontImageUrl = null,
}: PlayerCardFrontProps) {
  const lvl = levelLabel(String(p.level || ""));
  const lvlCls = levelClass(lvl);
  const isPitcher = p.is_pitcher === true;
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const imageId = String(p.playerid || "");

  const photoUrl = frontImageUrl || getPlayerThenImageUrl(imageId);
  const thenSilhouetteUrl = getThenSilhouetteUrl(isPitcher);

  const statusLabel =
    typeof p.status_label === "string" && String(p.status_label).trim()
      ? String(p.status_label).trim().toUpperCase()
      : "";

  const currentTeamName =
    typeof p.current_team_name === "string" && String(p.current_team_name).trim()
      ? String(p.current_team_name).trim()
      : "";

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
          {!!statusLabel && <span className="front-chip">{statusLabel}</span>}
          {lvl && <span className={`front-chip ${lvlCls}`}>{lvl}</span>}
        </div>

        <div className="yat-info-block">
          <div className="yat-name">
            <span>{String(p.firstname || "")}</span>
            <span>{String(p.lastname || "")}</span>
          </div>

          {!!currentTeamName && (
            <div className="yat-team-line">
              {currentTeamName}
            </div>
          )}

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
