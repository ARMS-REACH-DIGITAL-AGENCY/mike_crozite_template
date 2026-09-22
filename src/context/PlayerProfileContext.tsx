// src/context/PlayerProfileContext.tsx
// Provides the current player's ID, display name, canonical home hsid, and
// canonical school microsite URL to client components when rendering a player
// profile route. Set by the [hsid]/player/[playerId]/layout.tsx nested layout.
'use client';
import { createContext, useContext, ReactNode } from 'react';

interface PlayerProfileData {
  playerId: string;
  /** Display name — first + last. Used by FavoriteButton for toast messages. */
  playerName: string;
  /** The hsid of the school this player belongs to. Used for cross-school checks. */
  playerHsid: string;
  /** Canonical school microsite URL, e.g. https://mount-lebanon.pa.yatstats.com/2705 */
  playerSchoolUrl?: string;
  /**
   * Same current-team/org/level/status/position/bats/throws/height/weight
   * metadata the flip card's back already shows (layout.tsx computes this
   * once, from getPlayerById + getResolvedCurrentTeam + flip_card_front_stage
   * — the same source, not a re-derivation), so any client component on the
   * profile page can show the identical facts the flip card's back does,
   * without querying for it a second time.
   */
  currentTeamName?: string;
  orgConferenceName?: string;
  levelLabel?: string;
  statusLabel?: string;
  position?: string;
  bats?: string;
  throws?: string;
  height?: string;
  weight?: string;
}

export const PlayerProfileContext = createContext<PlayerProfileData | null>(null);

export function usePlayerProfile(): PlayerProfileData | null {
  return useContext(PlayerProfileContext);
}

export default function PlayerProfileContextProvider({
  children,
  playerId,
  playerName,
  playerHsid,
  playerSchoolUrl,
  currentTeamName,
  orgConferenceName,
  levelLabel,
  statusLabel,
  position,
  bats,
  throws,
  height,
  weight,
}: {
  children: ReactNode;
  playerId: string;
  playerName: string;
  playerHsid: string;
  playerSchoolUrl?: string;
  currentTeamName?: string;
  orgConferenceName?: string;
  levelLabel?: string;
  statusLabel?: string;
  position?: string;
  bats?: string;
  throws?: string;
  height?: string;
  weight?: string;
}) {
  return (
    <PlayerProfileContext.Provider value={{ playerId, playerName, playerHsid, playerSchoolUrl, currentTeamName, orgConferenceName, levelLabel, statusLabel, position, bats, throws, height, weight }}>
      {children}
    </PlayerProfileContext.Provider>
  );
}
