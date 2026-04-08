// src/context/PlayerProfileContext.tsx
// Provides the current player's ID to client components (SharedShell, etc.)
// when rendering a player profile route.
// Set by the [hsid]/player/[playerId]/layout.tsx nested layout.
'use client';
import { createContext, useContext, ReactNode } from 'react';

interface PlayerProfileData {
  playerId: string;
}

export const PlayerProfileContext = createContext<PlayerProfileData | null>(null);

export function usePlayerProfile(): PlayerProfileData | null {
  return useContext(PlayerProfileContext);
}

export default function PlayerProfileContextProvider({
  children,
  playerId,
}: {
  children: ReactNode;
  playerId: string;
}) {
  return (
    <PlayerProfileContext.Provider value={{ playerId }}>
      {children}
    </PlayerProfileContext.Provider>
  );
}
