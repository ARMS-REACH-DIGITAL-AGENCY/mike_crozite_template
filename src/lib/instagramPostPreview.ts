// The picture, @handle, caption and kind of one public Instagram post, for
// news stories whose link is an Instagram post. The Social tab gets these
// from the instagram-sync cron; a news link can be any account's post, so
// they are read from Instagram's public oEmbed and link-preview data instead. The picture is
// copied once to S3 (stories/instagram/news/<shortcode>.webp) because
// Instagram's image links expire, and the viewer only ever loads our copy.
import sharp from 'sharp';
import { putPublicAsset } from './stories';
import { storyAssetUrl } from './storyAssets';

export type InstagramPostPreview = {
  shortcode: string;
  permalink: string;
  handle: string | null;
  caption: string | null;
  media_type: 'image' | 'video' | 'carousel';
  thumbnail_url: string | null;
  published_at: string | null;
};

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

export function parseInstagramPermalink(raw: string | null | undefined): { type: string; shortcode: string; permalink: string } | null {
  let url: URL;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || (host !== 'instagram.com' && host !== 'm.instagram.com')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // instagram.com/<type>/<code>/ or instagram.com/<handle>/<type>/<code>/
  const at = ['p', 'reel', 'tv'].includes(parts[0] || '') ? 0 : ['p', 'reel', 'tv'].includes(parts[1] || '') ? 1 : -1;
  if (at < 0) return null;
  const type = parts[at];
  const shortcode = parts[at + 1] || '';
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(shortcode)) return null;
  return { type, shortcode, permalink: `https://www.instagram.com/${type}/${shortcode}/` };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, property: string): string | null {
  const tag = new RegExp(`<meta[^>]*property="${property}"[^>]*>`).exec(html)?.[0];
  const content = tag ? /\scontent="([^"]*)"/.exec(tag)?.[1] : null;
  return content ? decodeEntities(content) : null;
}

function pickImage(html: string): string | null {
  const url = metaContent(html, 'og:image');
  return url && /^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url) ? url : null;
}

// Instagram tags its preview picture with how it was made, e.g.
// {"efg_tag":"CAROUSEL_ITEM..."} for the first photo of a carousel.
function imageTag(imageUrl: string | null): string {
  try {
    const efg = imageUrl ? new URL(imageUrl).searchParams.get('efg') : null;
    return efg ? String(JSON.parse(Buffer.from(efg, 'base64').toString('utf8'))?.efg_tag || '') : '';
  } catch {
    return '';
  }
}

function pickKind(html: string, type: string, imageUrl: string | null): InstagramPostPreview['media_type'] {
  if (type === 'reel' || type === 'tv' || metaContent(html, 'og:video')) return 'video';
  const tag = imageTag(imageUrl).toUpperCase();
  if (/CLIPS|VIDEO|REEL/.test(tag)) return 'video';
  if (tag.startsWith('CAROUSEL')) return 'carousel';
  if (tag) return 'image';
  // Unknown /p/ posts are not necessarily carousels. Never invent carousel controls.
  // Reels and videos were recognized above; treat an unknown standard post as a photo.
  return 'image';
}

// og:description reads "109 likes, 2 comments - borascorp on October 23, 2026: ...".
function pickDate(html: string): string | null {
  const found = / on ([A-Z][a-z]+ \d{1,2}, \d{4}):/.exec(metaContent(html, 'og:description') || '')?.[1];
  const date = found ? new Date(`${found} 12:00:00 UTC`) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

async function copyPicture(shortcode: string, src: string): Promise<string> {
  const res = await fetch(src, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`image download ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(input).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const key = `stories/instagram/news/${shortcode}.webp`;
  await putPublicAsset(key, webp, 'image/webp');
  return storyAssetUrl(key) as string;
}

async function storedPicture(shortcode: string): Promise<string | null> {
  const url = storyAssetUrl(`stories/instagram/news/${shortcode}.webp`) as string;
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? url : null;
}

export async function fetchInstagramPostPreview(rawUrl: string): Promise<InstagramPostPreview | null> {
  const post = parseInstagramPermalink(rawUrl);
  if (!post) return null;
  // Instagram answers server requests for its pages with an empty app
  // shell. Its public oEmbed endpoint still gives the caption and author,
  // and the page it serves link-preview crawlers carries the picture.
  const [oembed, page] = await Promise.all([
    fetch(`https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(post.permalink)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ title?: string; author_name?: string } | null>,
    fetch(post.permalink, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': CRAWLER_UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);
  if (!oembed && !page) throw new Error('instagram post unavailable');

  const handle = String(oembed?.author_name || '').replace(/^@/, '').trim();
  const caption = String(oembed?.title || '').trim();
  const imageUrl = pickImage(page);
  let picture = await storedPicture(post.shortcode);
  if (!picture && imageUrl) {
    try {
      picture = await copyPicture(post.shortcode, imageUrl);
    } catch (error) {
      console.error('instagram news picture copy failed', { post: post.shortcode, error: String(error) });
    }
  }
  return {
    shortcode: post.shortcode,
    permalink: post.permalink,
    handle: /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null,
    caption: caption || null,
    media_type: pickKind(page, post.type, imageUrl),
    thumbnail_url: picture,
    published_at: pickDate(page),
  };
}
