import { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, getPlayerIdentityMeta, type PlayerIdentityMeta } from '@/lib/db';
import FeaturedTeamNewsInjector from '@/components/yatstats/FeaturedTeamNewsInjector';
import ProfileFunZoneStabilizer from '@/components/yatstats/ProfileFunZoneStabilizer';
import ProfileStatsInjector from '@/components/yatstats/ProfileStatsInjector';
import ProfileFunZoneCleanupStyles from '@/components/yatstats/ProfileFunZoneCleanupStyles';
import ProfileStatsFinalOverrides from '@/components/yatstats/ProfileStatsFinalOverrides';

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

function isCanonicalHostMismatch(currentHost: string, canonicalUrl: string) {
  const host = String(currentHost || '').toLowerCase().split(':')[0];
  if (!host || !host.endsWith('.yatstats.com')) return false;

  try {
    const canonicalHost = new URL(canonicalUrl).hostname.toLowerCase();
    return Boolean(canonicalHost && canonicalHost.endsWith('.yatstats.com') && host !== canonicalHost);
  } catch {
    return false;
  }
}

export default async function PlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { hsid, playerId } = await params;
  const requestHeaders = await headers();
  const currentHost = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '';
  let playerName = '';
  let canonicalPlayerHsid = hsid;
  let playerSchoolUrl = hsid ? `/${hsid}` : '';
  let meta: PlayerIdentityMeta = {
    currentTeamName: '', orgConferenceName: '', levelLabel: '', statusLabel: '',
    position: '', bats: '', throws: '', height: '', weight: '', classOf: '',
    hsid: '', hsname: '', hslocation: '',
  };

  try {
    const [player, identityMeta] = await Promise.all([
      getPlayerById(playerId),
      getPlayerIdentityMeta(playerId),
    ]);

    meta = identityMeta;
    canonicalPlayerHsid = meta.hsid || String(player?.hsid || '').trim() || hsid;
    playerSchoolUrl = buildMicrositeUrl(canonicalPlayerHsid, meta.hsname || undefined, meta.hslocation || undefined);

    const firstName = String(player?.firstname || player?.first_name || '').trim();
    const lastName = String(player?.lastname || player?.last_name || '').trim();
    playerName = `${firstName} ${lastName}`.trim();
  } catch {}

  const playerSlug = slugifySchoolName(playerName || playerId);
  const canonicalPlayerUrl = playerSchoolUrl
    ? `${playerSchoolUrl}/player/${encodeURIComponent(playerId)}${playerSlug ? `/${playerSlug}` : ''}`
    : '';

  if (canonicalPlayerUrl && isCanonicalHostMismatch(currentHost, canonicalPlayerUrl)) {
    redirect(canonicalPlayerUrl);
  }

  const featuredTeamPlayer = {
    playerid: playerId,
    display_name: playerName,
    current_team_name: meta.currentTeamName,
    current_org_or_conference_name: meta.orgConferenceName,
    level_label: meta.levelLabel,
  };

  return (
    <PlayerProfileContextProvider
      playerId={playerId}
      playerName={playerName}
      playerHsid={canonicalPlayerHsid}
      playerSchoolUrl={playerSchoolUrl}
      currentTeamName={meta.currentTeamName}
      orgConferenceName={meta.orgConferenceName}
      levelLabel={meta.levelLabel}
      statusLabel={meta.statusLabel}
      position={meta.position}
      bats={meta.bats}
      throws={meta.throws}
      height={meta.height}
      weight={meta.weight}
      classOf={meta.classOf}
    >
      <ProfileFunZoneStabilizer playerId={playerId} hsid={canonicalPlayerHsid} playerName={playerName} />
      <FeaturedTeamNewsInjector player={featuredTeamPlayer} />
      <ProfileStatsInjector playerId={playerId} meta={meta} />
      {children}
      <ProfileFunZoneCleanupStyles />
      <ProfileStatsFinalOverrides />
    </PlayerProfileContextProvider>
  );
}
