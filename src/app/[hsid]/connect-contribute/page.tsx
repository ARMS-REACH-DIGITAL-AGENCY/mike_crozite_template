// <school>.yatstats.com/connect-contribute/ - the Connect & Contribute
// Portal's own page, inside the school's shell (topbar, drawers, row 2).
// The shell reads this path as the "mentor" section (SharedShell,
// YatInteractivity): row 3 is the shared strip with a circle per option,
// and this page is row 4: the Connect sections, then the Contribute ones.
//
// Where the page shows a part of the site, it's the real thing: this
// school's own flip cards (PlayerCard, the same component as the galleries),
// picked for what each section asks for - players still missing their high
// school photo, one whose class year is only an estimate, a retired alum.

import type { ReactNode } from 'react';
import {
  getAllTimeRosterByHsid,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
  getSchoolByHsid,
} from '@/lib/db';
import { getPlayerThenCardUrl } from '@/lib/playerImage';
import { gradClassInfo } from '@/lib/playerUtils';
import PlayerCard from '@/components/yatstats/PlayerCard';
import ContributeGuide, { type GuideExamples } from '@/components/yatstats/ContributeGuide';

type Row = Record<string, unknown>;
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute Portal | YAT?STATS',
    description: 'Connect with players, fans and fellow alumni, sponsor the hub, and send photos, player info, missing next-level alumni and news tips.',
  };
}

// Whether a file is in the bucket (cached an hour - photos rarely change).
async function exists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', next: { revalidate: 3600 } });
    return res.ok;
  } catch {
    return false;
  }
}

const isHighSchool = (p: Row) => /HIGH SCHOOL|^HS$/i.test(String(p.level_label || '').trim());
const nameOf = (p: Row) => `${String(p.firstname || p.first_name || '')} ${String(p.lastname || p.last_name || '')}`.trim();
const isActive = (p: Row) => String(p.status_label || '').toUpperCase() === 'ACTIVE';

// A red marker on a real card: where we need help.
function Need({ children, y = '42%' }: { children: ReactNode; y?: string }) {
  return (
    <span className="ccg-need" style={{ left: '50%', top: y }}>
      <span className="ccg-need-dot" aria-hidden="true" />
      <span className="ccg-need-label">{children}</span>
    </span>
  );
}

async function buildExamples(hsid: string, schoolName: string, schoolLocation: string): Promise<GuideExamples> {
  const [stage, allTime] = await Promise.all([
    getFlipCardFrontStageByHsid(hsid).catch(() => [] as Row[]),
    getAllTimeRosterByHsid(hsid).catch(() => [] as Row[]),
  ]);
  // The same merge as the galleries: the roster row on top of the card row.
  const stageById = new Map((stage as Row[]).map((p) => [String(p.playerid), p]));
  const seen = new Set<string>();
  const players: Row[] = [];
  for (const p of allTime as Row[]) {
    const id = String(p.playerid);
    seen.add(id);
    players.push({ ...(stageById.get(id) || {}), ...p });
  }
  for (const p of stage as Row[]) if (!seen.has(String(p.playerid))) players.push(p);
  const alumni = players
    .filter((p) => p.playerid && !isHighSchool(p) && nameOf(p))
    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || nameOf(a).localeCompare(nameOf(b)))
    .slice(0, 60);
  if (!alumni.length) return {};

  const ids = alumni.map((p) => String(p.playerid));
  const [fronts, headshots] = await Promise.all([
    getBatchDesignatedPlayerImages(ids, 'YATSTATS_FRONT').catch(() => new Map()),
    getBatchDesignatedPlayerImages(ids, 'HEADSHOT').catch(() => new Map()),
  ]);
  // Does his card have a high school photo? A designated one, or the card
  // copy / original in the bucket - what the card itself would show.
  const hasFront = await Promise.all(alumni.map(async (p) => {
    const id = String(p.playerid);
    if (fronts.get(id)?.image_url) return true;
    return (await exists(getPlayerThenCardUrl(id))) || exists(`${S3}/players/then/${id}.jpg`);
  }));

  const card = (p: Row) => {
    const id = String(p.playerid);
    return (
      <PlayerCard
        player={p}
        resolvedHsid={hsid}
        frontImageUrl={fronts.get(id)?.image_url ?? null}
        headshotUrl={headshots.get(id)?.image_url ?? null}
        schoolName={schoolName}
        schoolLocation={schoolLocation}
        isAllTime={!isActive(p)}
      />
    );
  };
  const withPhoto = alumni.filter((_, i) => hasFront[i]);
  const noPhoto = alumni.filter((_, i) => !hasFront[i]);
  const estimated = withPhoto.find((p) => gradClassInfo(p).estimated) || alumni.find((p) => gradClassInfo(p).estimated);
  const retired = withPhoto.find((p) => String(p.status_label || '').toUpperCase() === 'RETIRED');

  // Real action photos for the section headers: the wide photo on the back
  // of current alumni's flip cards (players/back-web), pros first.
  const photoCandidates = alumni.filter(isActive).slice(0, 24);
  const backOk = await Promise.all(photoCandidates.map((p) => exists(`${S3}/players/back-web/${String(p.playerid)}.webp`)));
  const photos = photoCandidates
    .filter((_, i) => backOk[i])
    .map((p) => ({ src: `${S3}/players/back-web/${String(p.playerid)}.webp`, name: nameOf(p) }));

  const examples: GuideExamples = { photos };
  if (noPhoto.length) {
    examples.photo = noPhoto.slice(0, 2).map((p) => (
      <div className="ccg-card" key={String(p.playerid)}>{card(p)}<Need>No high school photo</Need></div>
    ));
  }
  // His class year when it's only our estimate; otherwise a current alum's
  // card, for the things on it that aren't stats.
  const infoCard = estimated || withPhoto.find(isActive) || withPhoto[0];
  if (infoCard) {
    examples.data = [
      <div className="ccg-card" key={String(infoCard.playerid)}>
        {card(infoCard)}
        <Need y="86%">{estimated ? `Class of ${gradClassInfo(estimated).year}? Estimated` : 'Class year, height, position wrong?'}</Need>
      </div>,
    ];
  }
  if (withPhoto.length >= 2) {
    examples.missing = [
      ...withPhoto.slice(0, 2).map((p) => <div className="ccg-card" key={String(p.playerid)}>{card(p)}</div>),
      <div className="ccg-card ccg-card-empty" key="missing"><span>+</span><Need y="50%">Who&apos;s missing?</Need></div>,
    ];
  }
  if (retired) {
    examples.alumni = [<div className="ccg-card" key={String(retired.playerid)}>{card(retired)}</div>];
  }
  return examples;
}

export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const school = /^\d+$/.test(hsid) ? ((await getSchoolByHsid(hsid).catch(() => null)) as Row | null) : null;
  const schoolName = String(school?.hsname || '');
  const examples = school
    ? await buildExamples(String(school.hsid ?? hsid), schoolName, String(school.hslocation || '')).catch((error) => {
        console.error('[connect-contribute] examples failed', error);
        return {} as GuideExamples;
      })
    : {};
  return (
    <section id="sec-mentor" className="yat-section visible">
      <ContributeGuide schoolName={schoolName} examples={examples} />
    </section>
  );
}
