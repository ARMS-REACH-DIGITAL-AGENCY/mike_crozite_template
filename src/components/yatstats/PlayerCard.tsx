// src/components/yatstats/PlayerCard.tsx
// Full flip card container: article element with front and back faces

import { levelLabel, gradClass, varsityDots } from "@/lib/playerUtils";
import { toPlayerSlug } from "@/lib/slug";
import PlayerCardFront from "@/components/yatstats/PlayerCardFront";
import PlayerCardBack from "@/components/yatstats/PlayerCardBack";

interface PlayerCardProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  frontImageUrl?: string | null;
  headshotUrl?: string | null;
  isAllTime?: boolean;
}

export default function PlayerCard({
  player: p,
  resolvedHsid,
  frontImageUrl = null,
  headshotUrl = null,
  isAllTime,
}: PlayerCardProps) {
  const lvl = levelLabel(String(p.level || ""));
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const slug = toPlayerSlug(String(p.firstname || ""), String(p.lastname || ""));

  const playerWithSlug = { ...p, slug };
  const playerId = String(p.playerid);

  return (
    <article
      id={`player-${playerId}`}
      className="yat-card"
      data-name={`${p.firstname} ${p.lastname}`.toLowerCase()}
      data-playerid={playerId}
      data-level={lvl}
      data-gradclass={gc}
      data-slug={slug}
      data-dots={dots.join(",")}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          <PlayerCardFront player={playerWithSlug} frontImageUrl={frontImageUrl} isAllTime={isAllTime} />
          <PlayerCardBack
            player={playerWithSlug}
            resolvedHsid={resolvedHsid}
            headshotUrl={headshotUrl}
            isAllTime={isAllTime}
          />
        </div>
      </div>
    </article>
  );
}
