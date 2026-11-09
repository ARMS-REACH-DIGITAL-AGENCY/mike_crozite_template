import { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, query, resolveLegacyPlayerRedirect, resolveMergedTbcPlayerRedirect, type PlayerIdentityMeta } from '@/lib/db';
import { getPlayerIdentityMetaOnce } from '@/lib/playerIdentityCached';
import { playerJourneyJsonLd, jsonLdScript } from '@/lib/playerJourneySeo';
import { toPlayerSlug } from '@/lib/slug';
import { canonicalSchoolUrls } from '@/lib/schoolDirectoryRouting';
import ProfileFunZoneStabilizer from '@/components/yatstats/ProfileFunZoneStabilizer';
import StoryDrawer from '@/components/yatstats/StoryDrawer';
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
  // Old bookmarks/share links must move to the same player's canonical ID
  // before rendering any profile context or 2025-placeholder timeline.
  const legacy = await resolveLegacyPlayerRedirect(playerId);
  if (legacy) {
    redirect(`/${encodeURIComponent(legacy.hsid)}/player/${encodeURIComponent(legacy.playerId)}/${slugifySchoolName(legacy.displayName)}`);
  }
  const requestHeaders = await headers();
  const currentHost = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '';
  let playerName = '';
  let canonicalPlayerHsid = hsid;
  let playerSchoolUrl = hsid ? `/${hsid}` : '';
  let meta: PlayerIdentityMeta = {
    currentTeamName: '', orgConferenceName: '', levelLabel: '', statusLabel: '',
    position: '', bats: '', throws: '', height: '', weight: '', classOf: '',
    hsid: '', hsname: '', hslocation: '', rosterYears: [], draftPicks: [],
  };

  try {
    const [player, identityMeta] = await Promise.all([
      getPlayerById(playerId),
      getPlayerIdentityMetaOnce(playerId),
    ]);

    meta = identityMeta;
    canonicalPlayerHsid = meta.hsid || String(player?.hsid || '').trim() || hsid;
    const canonicalUrls = await canonicalSchoolUrls(
      [canonicalPlayerHsid],
      (sql, params = []) => query(sql, params),
    );
    playerSchoolUrl = canonicalUrls.get(canonicalPlayerHsid) || (canonicalPlayerHsid ? `/${canonicalPlayerHsid}` : '');

    const firstName = String(player?.firstname || player?.first_name || '').trim();
    const lastName = String(player?.lastname || player?.last_name || '').trim();
    playerName = `${firstName} ${lastName}`.trim();
  } catch {}

  // No card under this ID: it may be a merged duplicate Baseball Cube record.
  if (!meta.hsid) {
    const merged = await resolveMergedTbcPlayerRedirect(playerId).catch(() => null);
    if (merged) {
      redirect(`/${encodeURIComponent(merged.hsid)}/player/${encodeURIComponent(merged.playerId)}/${slugifySchoolName(merged.displayName)}`);
    }
  }

  const playerSlug = slugifySchoolName(playerName || playerId);
  const canonicalPlayerUrl = playerSchoolUrl
    ? `${playerSchoolUrl}/player/${encodeURIComponent(playerId)}${playerSlug ? `/${playerSlug}` : ''}`
    : '';

  if (canonicalPlayerUrl && isCanonicalHostMismatch(currentHost, canonicalPlayerUrl)) {
    redirect(canonicalPlayerUrl);
  }

  // Structured data (invisible): the player's alma mater and current team,
  // for search engines and AI answers. No layout change.
  const journeyJsonLd = playerJourneyJsonLd({
    playerName,
    schoolName: meta.hsname,
    schoolLocation: meta.hslocation,
    schoolUrl: playerSchoolUrl.startsWith('https://') ? playerSchoolUrl : undefined,
    teamName: meta.currentTeamName,
    levelLabel: meta.levelLabel,
    statusLabel: meta.statusLabel,
    profileUrl: playerSchoolUrl.startsWith('https://') && playerName
      ? `${playerSchoolUrl}/${encodeURIComponent(canonicalPlayerHsid)}/player/${encodeURIComponent(playerId)}/${toPlayerSlug(playerName.split(' ')[0], playerName.split(' ').slice(1).join(' '))}`
      : undefined,
  });

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
      <ProfileFunZoneStabilizer playerId={playerId} hsid={canonicalPlayerHsid} playerName={playerName} statusLabel={meta.statusLabel} />
      <ProfileStatsInjector playerId={playerId} meta={meta} />
      {journeyJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(journeyJsonLd) }} />
      ) : null}
      {children}
      <ProfileFunZoneCleanupStyles />
      <StoryDrawer />
      <ProfileStatsFinalOverrides />
    </PlayerProfileContextProvider>
  );
}
