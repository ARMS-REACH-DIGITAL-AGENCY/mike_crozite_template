// src/components/yatstats/PlayerCard.tsx
// Full flip card container: article element with front and back faces

import { levelLabel, gradClass, varsityDots } from "@/lib/playerUtils";
import { toPlayerSlug } from "@/lib/slug";
import PlayerCardFront from "@/components/yatstats/PlayerCardFront";
import PlayerCardBack from "@/components/yatstats/PlayerCardBack";

interface PlayerCardProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  photoDefaultUrl: string;
  /** Formatted school name, e.g. "HAMILTON HIGH SCHOOL". Used in flip card back header. */
  schoolName?: string;
  /** School location string, e.g. "CHANDLER, AZ". Used in flip card back header. */
  location?: string;
  /** When true, applies all-time display differences (CAREER STATS label, etc.) */
  isAllTime?: boolean;
}

export default function PlayerCard({ player: p, resolvedHsid, photoDefaultUrl, schoolName, location, isAllTime }: PlayerCardProps) {
  const lvl = levelLabel(String(p.level || ""));
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const slug = toPlayerSlug(String(p.firstname || ""), String(p.lastname || ""));
  const pid = String(p.playerid || "");

  // Attach computed slug to the player object so PlayerCardBack can use it
  const playerWithSlug = { ...p, slug };

  return (
    <article
      id={`player-${pid}`}
      className="yat-card"
      data-name={`${p.firstname} ${p.lastname}`.toLowerCase()}
      data-playerid={pid}
      data-level={lvl}
      data-gradclass={gc}
      data-slug={slug}
      data-dots={dots.join(",")}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          <PlayerCardFront player={playerWithSlug} photoDefaultUrl={photoDefaultUrl} isAllTime={isAllTime} />
          <PlayerCardBack player={playerWithSlug} resolvedHsid={resolvedHsid} schoolName={schoolName} location={location} isAllTime={isAllTime} />
        </div>
      </div>
    </article>
  );
}
