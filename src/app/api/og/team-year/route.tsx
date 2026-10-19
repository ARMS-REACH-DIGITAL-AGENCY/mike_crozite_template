import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getFlipCardFrontStageByHsid, getSchoolByHsid, getSchoolTeamSeasonResults } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import {
  TEAM_YEAR_SHARE_TAGLINE, parseTeamYear, teamYearAchievement, teamYearAlumni, teamYearRecord,
} from '@/lib/teamYearShare';

// The share preview for one high school team on the All-Time Next-Level
// List (?hsid=5004&year=2017): the crest, the season ("STATE CHAMPS 2017,
// 23-10"), how many from that roster went on to the next level, a strip of
// their faces, and the question the link asks: "Where they YAT now?"

export const runtime = 'nodejs';
const size = { width: 1200, height: 630 };
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

// Highest level first, so the strip leads with the big leaguers.
const LEVEL_ORDER = ['MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL', 'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC'];
const levelRank = (level: string) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? LEVEL_ORDER.length : i;
};
const SHORT_LEVEL: Record<string, string> = { 'TRIPLE-A': 'AAA', 'DOUBLE-A': 'AA', 'HIGH-A': 'A+', 'SINGLE-A': 'A', 'NCAA-D1': 'D1', 'NCAA-D2': 'D2', 'NCAA-D3': 'D3' };

// Only photos that exist go in (a missing image would fail the whole card).
async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// A headshot as a small JPEG data URL (the site's image service resizes the
// ~1.4 MB original), or null when there's no photo.
async function smallJpeg(origin: string, src: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/_next/image?url=${encodeURIComponent(src)}&w=256&q=70`, {
      headers: { Accept: 'image/jpeg' }, signal: AbortSignal.timeout(4000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/image\/(jpeg|png)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

function shortSchool(name: string) {
  return name.replace(/\s+high\s+school$/i, '').trim();
}

function fallback(text: string) {
  return new ImageResponse(
    <div style={{ display: 'flex', width: 1200, height: 630, background: '#0b0b0b', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 900 }}>{text}</div>,
    size,
  );
}

export async function GET(req: NextRequest) {
  const hsid = String(req.nextUrl.searchParams.get('hsid') || '').trim();
  const year = parseTeamYear(req.nextUrl.searchParams.get('year'));
  if (!/^\d+$/.test(hsid) || !year) return fallback('YAT?STATS');

  const [school, results, rows] = await Promise.all([
    getSchoolByHsid(hsid).catch(() => null),
    getSchoolTeamSeasonResults(hsid).catch(() => []),
    getFlipCardFrontStageByHsid(hsid).catch(() => []),
  ]);
  const name = shortSchool(String((school as Record<string, unknown> | null)?.hsname || 'Your School'));
  const location = String((school as Record<string, unknown> | null)?.hslocation || '');
  const result = results.find((r) => String(r.seasonYear) === year) || null;
  const achievement = teamYearAchievement(result);
  const record = teamYearRecord(result);
  const alumni = teamYearAlumni(rows as Record<string, unknown>[], year)
    .sort((a, b) => levelRank(String(a.level_label || '')) - levelRank(String(b.level_label || '')));

  // Up to six faces: the current headshot, resized by the site's image
  // service so the card stays light.
  const origin = req.nextUrl.origin;
  const candidates = alumni.slice(0, 12).map((p) => ({
    id: String(p.playerid),
    last: String(p.lastname || p.last_name || String(p.display_name || '').split(/\s+/).pop() || '').toUpperCase(),
    level: SHORT_LEVEL[String(p.level_label || '')] || String(p.level_label || ''),
    src: `${S3}/players/now/${p.playerid}.jpg`,
  }));
  const checked = await Promise.all(candidates.map(async (c) => {
    const data = await smallJpeg(origin, c.src);
    return data ? { ...c, data } : null;
  }));
  const faces = checked.filter(Boolean).slice(0, 6) as (typeof candidates[number] & { data: string })[];
  const crest = getSchoolCrestUrl(hsid);
  const crestOk = await exists(crest);
  const champs = achievement === 'State Champs';

  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: 1200, height: 630, background: 'linear-gradient(160deg,#1d5c40,#0b2a1d 70%)', color: '#fff', padding: '40px 52px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {crestOk ? <img src={crest} width={132} height={132} style={{ objectFit: 'contain', marginRight: 30 }} alt="" /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>{name.toUpperCase()}</div>
          {location ? <div style={{ display: 'flex', fontSize: 24, color: '#cfe3d7', marginTop: 6 }}>{location}</div> : null}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
            <div style={{ display: 'flex', padding: '6px 18px', borderRadius: 10, background: champs ? '#7a1f2b' : '#f2f2f2', color: champs ? '#fff' : '#532a39', fontSize: 34, fontWeight: 900 }}>
              {[achievement ? achievement.toUpperCase() : 'TEAM', year].join(' ')}
            </div>
            {record ? <div style={{ display: 'flex', marginLeft: 18, fontSize: 32, fontWeight: 900, color: '#ffcb22' }}>({record})</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 22px', background: '#042c20', border: '2px solid #25845e', borderRadius: 10 }}>
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, lineHeight: 1 }}>{alumni.length}</div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 900, color: '#ffcb22', marginTop: 4 }}>NEXT LEVEL</div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 900, color: '#ffcb22' }}>ALUMNI</div>
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 34, height: 220 }}>
        {faces.map((f) => (
          <div key={f.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 166, marginRight: 14 }}>
            <img src={f.data} width={150} height={150} style={{ objectFit: 'cover', borderRadius: 75, border: '4px solid #ffcb22' }} alt="" />
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 900, marginTop: 10 }}>{f.last}</div>
            <div style={{ display: 'flex', fontSize: 18, color: '#cfe3d7' }}>{f.level}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div style={{ display: 'flex', fontSize: 46, fontWeight: 900, color: '#ffcb22' }}>{TEAM_YEAR_SHARE_TAGLINE.toUpperCase()}</div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 900 }}>YAT?STATS</div>
      </div>
    </div>,
    { ...size, headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
