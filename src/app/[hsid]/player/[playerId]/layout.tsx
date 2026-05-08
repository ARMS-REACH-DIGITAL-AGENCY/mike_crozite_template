import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, getResolvedCurrentTeam, query } from '@/lib/db';
import ProfilePageEnhancer from '@/components/yatstats/ProfilePageEnhancer';

export default async function PlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { hsid, playerId } = await params;
  let playerName = '';
  let canonicalPlayerHsid = hsid;
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
    const [player, resolvedCurrentTeam, stageHsidResult] = await Promise.all([
      getPlayerById(playerId),
      getResolvedCurrentTeam(playerId),
      query<{ hsid: string }>(
        'select hsid::text as hsid from flip_card_front_stage where playerid::text = $1 order by updated_at desc nulls last limit 1',
        [playerId]
      ).catch(() => ({ rows: [] as { hsid: string }[] })),
    ]);

    const stageHsid = String(stageHsidResult.rows[0]?.hsid || '').trim();
    const playerHsid = String(player?.hsid || '').trim();
    canonicalPlayerHsid = stageHsid || playerHsid || hsid;

    if (player) {
      const firstName = String(player.firstname || player.first_name || '').trim();
      const lastName = String(player.lastname || player.last_name || '').trim();
      playerName = `${firstName} ${lastName}`.trim();
      const latestYear = Number(player.stat_year || player.pitch_year || player.year || 0);
      const statusLabel = String(player.status_label || (latestYear >= 2025 ? 'ACTIVE' : 'RETIRED')).trim().toUpperCase();
      const bats = String(player.bats || '').trim();
      const throwsValue = String(player.throws || player.throwing_hand || '').trim();
      const height = String(player.height || '').trim();
      const weight = String(player.weight || '').trim();

      meta = {
        playerId,
        hsid: canonicalPlayerHsid,
        displayName: playerName || playerId,
        statusLabel,
        currentTeamName: String(resolvedCurrentTeam?.team_name || player.current_team_name || player.team_name || '').trim(),
        levelLabel: String(resolvedCurrentTeam?.level || player.level_label || player.level || '').trim().toUpperCase(),
        position: String(player.position || player.pos || '').trim().toUpperCase(),
        batsThrows: bats && throwsValue ? `${bats}/${throwsValue}` : bats || throwsValue,
        heightWeight: height && weight ? `${height} / ${weight}` : height || weight,
        classOf: String(player.class_of || player.grad_year || '').trim(),
      };
    }
  } catch {}

  return (
    <PlayerProfileContextProvider playerId={playerId} playerName={playerName} playerHsid={canonicalPlayerHsid}>
      <ProfilePageEnhancer meta={meta} />
      {children}
    </PlayerProfileContextProvider>
  );
}
