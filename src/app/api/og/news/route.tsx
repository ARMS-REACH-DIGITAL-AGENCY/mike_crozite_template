import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getSchoolByHsid, query } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { parseNewsVideo, publicNewsHeadline } from '@/lib/newsVideo';
import { fetchInstagramPostPreview } from '@/lib/instagramPostPreview';

// Always produces a same-origin, 1200x630 PNG, even when an article
// has no uploaded photo or its third-party embed cannot be scraped.
export const runtime = 'nodejs';
const SIZE = { width: 1200, height: 630 };
const GOLD = '#ffcb22';

type NewsRow = {
  title: string | null;
  snippet: string | null;
  url: string | null;
  image_url: string | null;
  display_image_url: string | null;
};

function trustedPublicImage(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return host === 'yatstats-assets.s3.us-west-2.amazonaws.com'
      || host === 'i.ytimg.com'
      || host === 'img.youtube.com'
      || host.endsWith('.cdninstagram.com')
      || host === 'cdninstagram.com'
      || host.endsWith('.fbcdn.net')
      || host === 'fbcdn.net';
  } catch { return false; }
}

async function loadImage(url: string | null | undefined): Promise<string | null> {
  if (!url || !trustedPublicImage(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3500), next: { revalidate: 3600 } });
    const type = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!res.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null;
    const announcedSize = Number(res.headers.get('content-length') || 0);
    if (announcedSize > 4_000_000) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 4_000_000) return null;
    return 'data:' + type + ';base64,' + Buffer.from(bytes).toString('base64');
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const hsid = String(request.nextUrl.searchParams.get('hsid') || '');
  const story = String(request.nextUrl.searchParams.get('story') || '');
  if (!/^\d{1,8}$/.test(hsid) || !/^[A-Za-z0-9_:-]{1,120}$/.test(story)) {
    return new Response('Invalid story', { status: 400 });
  }
  const [school, news] = await Promise.all([
    getSchoolByHsid(hsid).catch(() => null),
    query<NewsRow>(
      'SELECT title,snippet,url,display_image_url,image_url FROM news_articles WHERE uuid=$1 AND hsid=$2 LIMIT 1',
      [story, hsid],
    ).then(r => r.rows[0] || null).catch(() => null),
  ]);
  if (!news) return new Response('Story not found', { status: 404 });

  const schoolName = String(school?.hsname || 'YAT?STATS').replace(/\s+high\s+school$/i, '').trim().toUpperCase().slice(0, 50);
  const title = (publicNewsHeadline(news.title, news.url) || 'ALUMNI NEWS').trim().slice(0, 132);
  const snippet = String(news.snippet || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 145);
  const video = parseNewsVideo(news.url);
  const instagram = video?.provider === 'Instagram'
    ? await fetchInstagramPostPreview(news.url || '').catch(() => null) : null;
  const candidates = [
    news.display_image_url,
    news.image_url,
    instagram?.thumbnail_url,
    video?.thumbnailUrl,
  ];
  let photo: string | null = null;
  for (const candidate of candidates) {
    photo = await loadImage(candidate);
    if (photo) break;
  }
  const crest = await loadImage(getSchoolCrestUrl(hsid));
  const leftWidth = photo ? 620 : 710;
  return new ImageResponse(
    <div style={{ display: 'flex', width: SIZE.width, height: SIZE.height, background: '#0c1119', color: 'white', fontFamily: 'Arial, sans-serif', padding: '43px 50px', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #ffcb22', paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {crest ? <img src={crest} width={70} height={70} style={{ objectFit: 'contain' }} alt="" /> : null}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 29, fontWeight: 900 }}>{schoolName}</div>
            <div style={{ display: 'flex', fontSize: 19, color: GOLD, fontWeight: 800, letterSpacing: 2 }}>ALUMNI NEWS</div>
          </div>
        </div>
        <div style={{ display: 'flex', color: GOLD, fontWeight: 900, fontSize: 35 }}>YAT?STATS</div>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: leftWidth, justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: title.length > 84 ? 43 : title.length > 48 ? 50 : 60, fontWeight: 900, lineHeight: 1.07, letterSpacing: -1 }}>{title}</div>
          {snippet ? <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.32, marginTop: 23, color: '#d6dce4' }}>{snippet}</div> : null}
        </div>
        {photo
          ? <div style={{ display: 'flex', flex: 1, height: 346, background: '#1d2732', alignItems: 'center', justifyContent: 'center', border: '2px solid #364450' }}>
              <img src={photo} width={380} height={338} style={{ objectFit: 'contain' }} alt="" />
            </div>
          : crest
            ? <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}><img src={crest} width={270} height={270} style={{ objectFit: 'contain' }} alt="" /></div>
            : null}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #35404c', paddingTop: 18, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 24, color: GOLD, fontWeight: 900 }}>CONNECT. CONTRIBUTE. REMEMBER.</div>
        <div style={{ display: 'flex', fontSize: 20, color: '#d6dce4' }}>WHERE THEY YAT? STORIES & STATS.</div>
      </div>
    </div>,
    { ...SIZE, headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
  );
}
