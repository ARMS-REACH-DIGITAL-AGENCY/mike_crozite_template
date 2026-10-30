import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getSchoolByHsid } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';

// Shared 1200x630 preview for every school microsite, including the All-Time
// landing link. Never query player rosters or career statistics for previews.
export const runtime = 'nodejs';
const SIZE = { width: 1200, height: 630 };
const YELLOW = '#ffcb22';

async function schoolCrest(hsid: string): Promise<string | null> {
  try {
    const response = await fetch(getSchoolCrestUrl(hsid), {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });
    if (!response.ok || !/image\/(png|jpeg|webp)/i.test(response.headers.get('content-type') || '')) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) return null;
    const type = (response.headers.get('content-type') || 'image/png').split(';')[0];
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null; // Text-only branded card is better than a failed image.
  }
}

export async function GET(request: NextRequest) {
  const hsid = String(request.nextUrl.searchParams.get('hsid') || '');
  if (!/^\d{1,8}$/.test(hsid)) return new Response('Invalid school', { status: 400 });
  const allTime = request.nextUrl.searchParams.get('section') === 'alltime';

  // The school lookup is intentionally the only database call in this route.
  const school = await getSchoolByHsid(hsid).catch(() => null);
  const rawName = String(school?.hsname || 'YAT?STATS').replace(/\s+HIGH\s+SCHOOL$/i, '').trim();
  const schoolName = rawName.toUpperCase().slice(0, 64);
  const location = String(school?.hslocation || '').trim().slice(0, 72);
  const crest = await schoolCrest(hsid);
  const heading = allTime ? 'ALL-TIME NEXT-LEVEL ALUMNI' : 'ALUMNI BASEBALL ONLINE COMMUNITY';

  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: 1200, height: 630, background: 'linear-gradient(135deg,#111820 0%,#070a10 75%)', color: '#fff', padding: '50px 64px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 50 }}>
        <div style={{ display: 'flex', width: 300, height: 300, alignItems: 'center', justifyContent: 'center', border: '3px solid #3c4750', background: '#17202a', borderRadius: 16 }}>
          {crest ? <img src={crest} width={270} height={270} style={{ objectFit: 'contain' }} alt="" /> :
            <div style={{ display: 'flex', fontWeight: 900, color: YELLOW, fontSize: 110 }}>YAT?</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
          <div style={{ display: 'flex', color: YELLOW, fontSize: 24, fontWeight: 800, letterSpacing: 4 }}>YAT?STATS · HIGH SCHOOL BASEBALL</div>
          <div style={{ display: 'flex', fontSize: schoolName.length > 24 ? 54 : 74, fontWeight: 900, letterSpacing: -2, lineHeight: 1.03, marginTop: 24 }}>{schoolName}</div>
          {location ? <div style={{ display: 'flex', fontSize: 28, color: '#d4d9df', marginTop: 12 }}>{location}</div> : null}
          <div style={{ display: 'flex', fontSize: 29, color: '#fff', fontWeight: 800, marginTop: 30 }}>{heading}</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '3px solid #ffcb22', paddingTop: 26, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', color: YELLOW, fontSize: 29, fontWeight: 900, letterSpacing: 1 }}>CONNECT. CONTRIBUTE. REMEMBER.</div>
        <div style={{ display: 'flex', color: '#fff', fontSize: 38, fontWeight: 900 }}>YAT?STATS</div>
      </div>
    </div>,
    { ...SIZE, headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
