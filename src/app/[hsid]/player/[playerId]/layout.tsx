import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, getResolvedCurrentTeam, query } from '@/lib/db';
import FeaturedTeamNewsInjector from '@/components/yatstats/FeaturedTeamNewsInjector';
import ProfileFunZoneStabilizer from '@/components/yatstats/ProfileFunZoneStabilizer';
import ProfileStatsInjector from '@/components/yatstats/ProfileStatsInjector';
import ProfileFunZoneCleanupStyles from '@/components/yatstats/ProfileFunZoneCleanupStyles';
import ProfileStatsFinalOverrides from '@/components/yatstats/ProfileStatsFinalOverrides';
import GoldenLineLogoDesignOverrides from '@/components/yatstats/GoldenLineLogoDesignOverrides';

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

function normalizeTeamAffiliationStatus(value: unknown, statusLabel: string, teamName: string) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw) return raw;

  const status = String(statusLabel || '').trim().toUpperCase();
  if (status === 'ACTIVE' && teamName) return 'CURRENT';
  if (status === 'RETIRED' && teamName) return 'RETIRED_LAST_KNOWN';
  if (teamName) return 'FORMER';
  return 'UNKNOWN';
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
    currentTeamName: '',
    orgConferenceName: '',
    levelLabel: '',
    statusLabel: '',
  };

  try {
    const [player, resolvedCurrentTeam, stageResult] = await Promise.all([
      getPlayerById(playerId),
      getResolvedCurrentTeam(playerId),
      query<{
        hsid: string;
        hsname: string | null;
        hslocation: string | null;
        current_team_name: string | null;
        current_org_or_conference_name: string | null;
        level_label: string | null;
        status_label: string | null;
        display_status_label: string | null;
        display_level_label: string | null;
        team_affiliation_status: string | null;
      }>(
        `select
           f.hsid::text as hsid,
           ss.hsname,
           ss.hslocation,
           f.current_team_name,
           f.current_org_or_conference_name,
           f.level_label,
           f.status_label,
           f.display_status_label,
           f.display_level_label,
           f.team_affiliation_status
         from flip_card_front_stage f
         left join school_success ss on ss.hsid::text = f.hsid::text
         where f.playerid::text = $1
         order by f.updated_at desc nulls last
         limit 1`,
        [playerId]
      ).catch(() => ({ rows: [] as any[] })),
    ]);

    const stage = stageResult.rows[0];
    const stageHsid = String(stage?.hsid || '').trim();
    const playerHsid = String(player?.hsid || '').trim();
    canonicalPlayerHsid = stageHsid || playerHsid || hsid;
    playerSchoolUrl = buildMicrositeUrl(canonicalPlayerHsid, stage?.hsname || undefined, stage?.hslocation || undefined);

    const firstName = String(player?.firstname || player?.first_name || '').trim();
    const lastName = String(player?.lastname || player?.last_name || '').trim();
    playerName = `${firstName} ${lastName}`.trim();

    const latestYear = Number(player?.stat_year || player?.pitch_year || player?.year || 0);
    const statusLabel = String(stage?.display_status_label || stage?.status_label || player?.status_label || (latestYear >= 2025 ? 'ACTIVE' : 'RETIRED')).trim().toUpperCase();
    const teamName = String(resolvedCurrentTeam?.team_name || stage?.current_team_name || player?.current_team_name || player?.team_name || '').trim();
    const orgConferenceName = String(stage?.current_org_or_conference_name || resolvedCurrentTeam?.org_conf || player?.current_org_or_conference_name || player?.org_conf || player?.league || '').trim();
    const levelLabel = String(resolvedCurrentTeam?.level || stage?.display_level_label || stage?.level_label || player?.level_label || player?.level || '').trim().toUpperCase();
    normalizeTeamAffiliationStatus(stage?.team_affiliation_status, statusLabel, teamName);

    meta = {
      currentTeamName: teamName,
      orgConferenceName,
      levelLabel,
      statusLabel,
    };
  } catch {}

  const featuredTeamPlayer = {
    playerid: playerId,
    display_name: playerName,
    current_team_name: meta.currentTeamName,
    current_org_or_conference_name: meta.orgConferenceName,
    level_label: meta.levelLabel,
  };

  return (
    <PlayerProfileContextProvider playerId={playerId} playerName={playerName} playerHsid={canonicalPlayerHsid} playerSchoolUrl={playerSchoolUrl}>
      <ProfileFunZoneStabilizer playerId={playerId} hsid={canonicalPlayerHsid} playerName={playerName} />
      <FeaturedTeamNewsInjector player={featuredTeamPlayer} />
      <ProfileStatsInjector playerId={playerId} meta={meta} />
      {children}
      <ProfileFunZoneCleanupStyles />
      <ProfileStatsFinalOverrides />
      <GoldenLineLogoDesignOverrides />
    </PlayerProfileContextProvider>
  );
}
