// src/context/PlayerProfileContext.tsx
// Provides the current player's ID, display name, and home hsid to client
// components (SharedShell, SchoolContextBar, etc.) when rendering a player
// profile route.  Set by the [hsid]/player/[playerId]/layout.tsx nested layout.
'use client';
import { createContext, useContext, ReactNode } from 'react';

interface PlayerProfileData {
  playerId: string;
  /** Display name — first + last. Used by FavoriteButton for toast messages. */
  playerName: string;
  /** The hsid of the school this player belongs to. Used for cross-school check. */
  playerHsid: string;
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
}: {
  children: ReactNode;
  playerId: string;
  playerName: string;
  playerHsid: string;
}) {
  return (
    <PlayerProfileContext.Provider value={{ playerId, playerName, playerHsid }}>
      {children}
    </PlayerProfileContext.Provider>
  );
}
