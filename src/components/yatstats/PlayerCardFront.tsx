// src/components/yatstats/PlayerCardFront.tsx
// Front face of the flip card: HS image, chips, name, meta, varsity dots, last 3 games

import { levelLabel, levelClass, gradClass, varsityDots } from "@/lib/playerUtils";
import { getPlayerThenImageUrl, getThenSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardFrontProps {
  player: Record<string, unknown>;
  /** When true, computes status from is_active_2025 field; otherwise always shows "ACTIVE 2025" */
  isAllTime?: boolean;
}

export default function PlayerCardFront({ player: p, isAllTime }: PlayerCardFrontProps) {
  const lvl = levelLabel(String(p.level || ""));
  const lvlCls = levelClass(lvl);
  const isPitcher = p.is_pitcher === true;
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const pid = String(p.playerid || "");
  const photoUrl = getPlayerThenImageUrl(pid);
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
