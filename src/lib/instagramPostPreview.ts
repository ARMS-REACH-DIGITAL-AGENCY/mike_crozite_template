// The picture, @handle, caption and kind of one public Instagram post, for
// news stories whose link is an Instagram post. The Social tab gets these
// from the instagram-sync cron; a news link can be any account's post, so
// they are read from Instagram's public embed page instead. The picture is
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

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

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

function pickHandle(html: string): string | null {
  const found =
    /class="UsernameText"[^>]*>\s*([^<\s]+)\s*</.exec(html)?.[1] ||
    /class="CaptionUsername"[^>]*>\s*([^<\s]+)\s*</.exec(html)?.[1] ||
    /\\?"username\\?"\s*:\s*\\?"([A-Za-z0-9._]{1,30})\\?"/.exec(html)?.[1] ||
    null;
  const handle = found ? decodeEntities(found).replace(/^@/, '') : null;
  return handle && /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

function pickImage(html: string): string | null {
  const tag = /<img[^>]*class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/.exec(html)?.[0];
  const src = tag ? /\ssrc="([^"]+)"/.exec(tag)?.[1] : null;
  const url = src ? decodeEntities(src) : null;
  return url && /^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url) ? url : null;
}

function pickCaption(html: string): string | null {
  const start = html.indexOf('class="Caption"');
  if (start < 0) return null;
  const open = html.indexOf('>', start);
  const end = html.indexOf('class="CaptionComments"', open);
  let inner = html.slice(open + 1, end > open ? end : undefined);
  inner = inner.replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/, '');
  const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/<div\s*$/, '')
    .trim();
  return text || null;
}

function pickKind(html: string, type: string): InstagramPostPreview['media_type'] {
  if (type === 'reel' || type === 'tv') return 'video';
  const marker = /data-media-type="Graph(Video|Sidecar|Image)"/.exec(html)?.[1]
    || /\\?"__typename\\?"\s*:\s*\\?"Graph(Video|Sidecar|Image)\\?"/.exec(html)?.[1];
  if (marker === 'Video' || /\\?"is_video\\?"\s*:\s*true/.test(html)) return 'video';
  if (marker === 'Sidecar' || /\bSidecar\b/.test(html)) return 'carousel';
  if (marker === 'Image') return 'image';
  // Unknown: keep Instagram's own viewer one tap away.
  return 'carousel';
}

function pickTimestamp(html: string): string | null {
  const seconds = /\\?"taken_at_timestamp\\?"\s*:\s*(\d{9,11})/.exec(html)?.[1];
  return seconds ? new Date(Number(seconds) * 1000).toISOString() : null;
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
  const res = await fetch(`${post.permalink}embed/captioned/`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`instagram embed ${res.status}`);
  const html = await res.text();

  let picture = await storedPicture(post.shortcode);
  if (!picture) {
    const src = pickImage(html);
    if (src) {
      try {
        picture = await copyPicture(post.shortcode, src);
      } catch (error) {
        console.error('instagram news picture copy failed', { post: post.shortcode, error: String(error) });
      }
    }
  }
  return {
    shortcode: post.shortcode,
    permalink: post.permalink,
    handle: pickHandle(html),
    caption: pickCaption(html),
    media_type: pickKind(html, post.type),
    thumbnail_url: picture,
    published_at: pickTimestamp(html),
  };
}
