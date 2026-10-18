// The Connect & Contribute transaction desk. Everything on the school hub
// explains the community; this page simply routes visitors to the action.
// Do not load dozens of alumni photos here: the photo placement examples are
// lightweight visual previews, not another gallery.

import { getSchoolByHsid, getSchoolByUrl } from '@/lib/db';
import { headers } from 'next/headers';
import ContributeGuide from '@/components/yatstats/ContributeGuide';
import PlayerCard from '@/components/yatstats/PlayerCard';
import { getAllTimeRosterByHsid, getBatchDesignatedPlayerImages } from '@/lib/db';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute | YAT?STATS',
    description: 'Help preserve the baseball story: share missing player photographs, news, team logos, and corrected alumni records.',
  };
}

export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const host = (await headers()).get('host') || '';
  const byId = /^\d+$/.test(hsid) ? await getSchoolByHsid(hsid).catch(() => null) : null;
  const school = byId || (host ? await getSchoolByUrl(`https://${host}`).catch(() => null) : null);
  const schoolName = String(school?.hsname || 'your school');
  const resolvedHsid = String(school?.hsid || hsid);
  // Reuse actual Next.js gallery cards and school roster, never hand-drawn
  // facsimiles. Hamilton's Cody Bellinger has a high-school photo and Brock
  // Bell's current gallery card uses the real no-photo silhouette. No fake
  // player entries, asset assumptions or unrelated school's roster.
  const roster = await getAllTimeRosterByHsid(resolvedHsid).catch(() => []);
  const players: Array<Record<string, unknown>> = Array.isArray(roster) ? roster : [];
  const match = (first: string, last: string) => players.find((p) =>
    String(p.firstname || p.first_name || '').toLowerCase() === first.toLowerCase() &&
    String(p.lastname || p.last_name || '').toLowerCase() === last.toLowerCase()
  );
  const photo = resolvedHsid === '5004' ? match('Cody','Bellinger') : players[0];
  const missing = resolvedHsid === '5004' ? match('Brock','Bell') : null;
  const picked = [photo, missing].filter((p): p is Record<string, unknown> => Boolean(p));
  const pictures = picked.length ? await getBatchDesignatedPlayerImages(
    picked.map((p) => String(p.playerid)), 'YATSTATS_FRONT'
  ).catch(() => new Map<string, { image_url?: string | null }>()) : new Map<string, { image_url?: string | null }>();
  const realFrontExamples = picked.length === 2 ? (
    <div className="ccd-real-card-pair">
      {picked.map((player, index) => {
        const id = String(player.playerid);
        return <div className="ccd-real-card-example" key={id}>
          <PlayerCard player={player} resolvedHsid={resolvedHsid}
            frontImageUrl={pictures.get(id)?.image_url ?? null}
            schoolName={schoolName} isAllTime={false} eager />
          <span>{index === 0 ? 'REAL GALLERY CARD · PHOTO PRESENT' : 'REAL GALLERY CARD · NO-PHOTO SILHOUETTE'}</span>
        </div>;
      })}
    </div>
  ) : null;

  return (
    <section id="sec-mentor" className="yat-section visible">
      <ContributeGuide schoolName={schoolName} realFrontExamples={realFrontExamples} />
    </section>
  );
}
