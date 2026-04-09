// src/app/[hsid]/player/[playerId]/layout.tsx
// Nested layout for all player profile routes.
// Sets the PlayerProfileContext so that SharedShell (and SchoolContextBar)
// can render the career timeline strip (Row 3), metadata chips (Row 4),
// and the FavoriteButton in Row 2 without needing middleware headers.
import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById } from '@/lib/db';

export default async function PlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { hsid, playerId } = await params;

  // Lightweight single-row lookup for display name.
  // Used by FavoriteButton in Row 2 (SchoolContextBar). Non-fatal if it fails.
  let playerName = '';
  try {
    const player = await getPlayerById(playerId);
    if (player) {
      playerName = `${(player.firstname || '').trim()} ${(player.lastname || '').trim()}`.trim();
    }
  } catch {
    // non-fatal — FavoriteButton will still render; toast will show playerId as fallback
  }

  return (
    <PlayerProfileContextProvider
      playerId={playerId}
      playerName={playerName}
      playerHsid={hsid}
    >
      {children}
    </PlayerProfileContextProvider>
  );
}
