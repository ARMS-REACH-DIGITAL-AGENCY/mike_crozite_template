import { ReactNode } from 'react';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';
import { getPlayerById, query } from '@/lib/db';

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

  try {
    const [player, stageResult] = await Promise.all([
      getPlayerById(playerId),
      query<{
        hsid: string;
        hsname: string | null;
        hslocation: string | null;
      }>(
        `select
           f.hsid::text as hsid,
           ss.hsname,
           ss.hslocation
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
  } catch {}

  return (
    <PlayerProfileContextProvider playerId={playerId} playerName={playerName} playerHsid={canonicalPlayerHsid} playerSchoolUrl={playerSchoolUrl}>
      {children}
    </PlayerProfileContextProvider>
  );
}
