import { notFound } from 'next/navigation';
import PlayerSevenDaySnapshot from '@/components/yatstats/PlayerSevenDaySnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function GameLogView({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ hsid?: string; slug?: string }>;
}) {
  const { playerId } = await params;
  const { hsid = '', slug = '' } = await searchParams;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(playerId) || !/^[1-9][0-9]{0,9}$/.test(hsid) || !/^[a-zA-Z0-9-]{0,120}$/.test(slug)) notFound();
  return (
    <main data-standalone-game-log="true">
      <PlayerSevenDaySnapshot
        playerId={playerId}
        displayName=""
        profileHref={`/${hsid}/player/${encodeURIComponent(playerId)}/${slug}`}
      />
    </main>
  );
}
