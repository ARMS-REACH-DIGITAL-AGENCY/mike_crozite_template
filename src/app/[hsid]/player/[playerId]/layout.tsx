// src/app/[hsid]/player/[playerId]/layout.tsx
// Nested layout for all player profile routes.
// Sets the PlayerProfileContext so that SharedShell (and SchoolContextBar)
// can render the career timeline strip (Row 3), metadata chips (Row 4),
// and the FavoriteButton in Row 2 without needing middleware headers.
import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, getResolvedCurrentTeam } from '@/lib/db';
import ProfilePageEnhancer from '@/components/yatstats/ProfilePageEnhancer';

export default async function PlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { hsid, playerId } = await params;

  // Lightweight single-row lookup for display name and profile-row metadata.
  // Non-fatal if it fails.
  let playerName = '';
  let meta = {
    playerId,
    hsid,
    displayName: '',
    statusLabel: '',
    currentTeamName: '',
    levelLabel: '',
    position: '',
    batsThrows: '',
    heightWeight: '',
    classOf: '',
  };

  try {
    const [player, resolvedCurrentTeam] = await Promise.all([
      getPlayerById(playerId),
      getResolvedCurrentTeam(playerId),
    ]);

    if (player) {
      const firstName = String(player.firstname || player.first_name || '').trim();
      const lastName = String(player.lastname || player.last_name || '').trim();
      playerName = `${firstName} ${lastName}`.trim();

      const latestYear = Number(player.stat_year || player.pitch_year || player.year || 0);
      const statusLabel = String(
        player.status_label || (latestYear >= 2025 ? 'ACTIVE' : 'RETIRED')
      ).trim().toUpperCase();

      const bats = String(player.bats || '').trim();
      const throwsValue = String(player.throws || player.throwing_hand || '').trim();
      const height = String(player.height || '').trim();
      const weight = String(player.weight || '').trim();

      meta = {
        playerId,
        hsid,
        displayName: playerName || playerId,
        statusLabel,
        currentTeamName: String(
          resolvedCurrentTeam?.team_name || player.current_team_name || player.team_name || ''
        ).trim(),
        levelLabel: String(
          resolvedCurrentTeam?.level || player.level_label || player.level || ''
        ).trim().toUpperCase(),
        position: String(player.position || player.pos || '').trim().toUpperCase(),
        batsThrows: bats && throwsValue ? `${bats}/${throwsValue}` : bats || throwsValue,
        heightWeight: height && weight ? `${height} / ${weight}` : height || weight,
        classOf: String(player.class_of || player.grad_year || '').trim(),
      };
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
      <ProfilePageEnhancer meta={meta} />
      {children}
    </PlayerProfileContextProvider>
  );
}
