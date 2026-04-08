// src/app/[hsid]/player/[playerId]/layout.tsx
// Nested layout for all player profile routes.
// Sets the PlayerProfileContext so that SharedShell can render
// the career timeline strip (Row 3) and metadata chips (Row 4)
// without needing middleware headers.
import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';

export default async function PlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { playerId } = await params;
  return (
    <PlayerProfileContextProvider playerId={playerId}>
      {children}
    </PlayerProfileContextProvider>
  );
}
