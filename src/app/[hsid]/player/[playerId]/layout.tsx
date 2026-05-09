import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, getResolvedCurrentTeam, query } from '@/lib/db';
import ProfilePageEnhancer from '@/components/yatstats/ProfilePageEnhancer';

function slugifySchoolName(name: string) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMicrositeUrl(hsid: string, hsname?: string, hslocation?: string) {
  const schoolSlug = slugifySchoolName(hsname || '');
  const locParts = String(hslocation || '').split(',');
  const statePart = (locParts.slice(1).join(',') || '').trim();
  const stateSlug = String(statePart || '').toLowerCase().trim();

  if (hsid && schoolSlug && stateSlug) {
    return `https://${schoolSlug}.${stateSlug}.yatstats.com/${hsid}`;
  }

  return hsid ? `/${hsid}` : '';
}

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
  let playerSchoolUrl = hsid ? `/${hsid}` : '';
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
      query<{ hsid: string; hsname: string | null; hslocation: string | null }>(
        `select f.hsid::text as hsid, ss.hsname, ss.hslocation
         from flip_card_front_stage f
         left join school_success ss on ss.hsid::text = f.hsid::text
         where f.playerid::text = $1
         order by f.updated_at desc nulls last
         limit 1`,
        [playerId]
      ).catch(() => ({ rows: [] as { hsid: string; hsname: string | null; hslocation: string | null }[] })),
    ]);

    const stageSchool = stageHsidResult.rows[0];
    const stageHsid = String(stageSchool?.hsid || '').trim();
    const playerHsid = String(player?.hsid || '').trim();
    canonicalPlayerHsid = stageHsid || playerHsid || hsid;
    playerSchoolUrl = buildMicrositeUrl(canonicalPlayerHsid, stageSchool?.hsname || undefined, stageSchool?.hslocation || undefined);

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
    <PlayerProfileContextProvider playerId={playerId} playerName={playerName} playerHsid={canonicalPlayerHsid} playerSchoolUrl={playerSchoolUrl}>
      <ProfilePageEnhancer meta={meta} />
      {children}
    </PlayerProfileContextProvider>
  );
}
