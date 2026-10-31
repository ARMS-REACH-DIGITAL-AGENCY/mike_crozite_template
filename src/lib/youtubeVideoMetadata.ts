import 'server-only';
import { cleanNewsVideoTitle, parseNewsVideo } from '@/lib/newsVideo';
import { fetchYouTubeVideoTitle } from '@/lib/youtubeVideoTitle';

export type YouTubeVideoMetadata = {
  title: string | null;
  thumbnailUrl: string;
  publishedAt: string | null;
  dateSource: 'youtube_data_api' | 'unavailable';
};

// Never fetch an arbitrary fan-supplied host. The allowlisted video parser
// gives us exactly one validated 11-character YouTube ID.
function youtubeId(url: string): string | null {
  const video = parseNewsVideo(url);
  if (video?.provider !== 'YouTube') return null;
  return /^https:\/\/www\.youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})(?:\?|$)/.exec(video.embedUrl || '')?.[1] || null;
}

// This is the source's *publication* date, not its recording date or the
// timestamp when a fan added it to the YAT?STATS library.
export function normalizeNewsPublicationDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed + 'T12:00:00.000Z' : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1900 || year > new Date().getUTCFullYear() + 1) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && date.toISOString().slice(0, 10) !== trimmed) return null;
  // Never accept a future upload date (YouTube's scheduled publication time
  // is not an already-published video). Permit one day for timezone skew.
  if (date.getTime() > Date.now() + 86400000) return null;
  return date.toISOString();
}

export async function fetchYouTubeVideoMetadata(rawUrl: string): Promise<YouTubeVideoMetadata | null> {
  const id = youtubeId(rawUrl);
  if (!id) return null;
  const fallbackThumb = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
  const apiKey = process.env.YOUTUBE_DATA_API_KEY || process.env.YOUTUBE_API_KEY || '';
  if (apiKey) {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
    endpoint.searchParams.set('part', 'snippet');
    endpoint.searchParams.set('id', id);
    endpoint.searchParams.set('key', apiKey);
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5500),
      });
      if (response.ok) {
        const data = await response.json() as {
          items?: Array<{ id?: string; snippet?: {
            title?: unknown; publishedAt?: unknown;
            thumbnails?: Record<string, { url?: string }>;
          } }>;
        };
        const found = data.items?.find((item) => item.id === id)?.snippet;
        if (found) {
          const thumbs = found.thumbnails;
          // A medium thumbnail is 16:9; the old hqdefault may be letterboxed.
          const candidate = thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url;
          let thumbnail = fallbackThumb;
          if (candidate) {
            try {
              const image = new URL(candidate);
              if (image.protocol === 'https:' && ['i.ytimg.com','img.youtube.com'].includes(image.hostname)) thumbnail = image.href;
            } catch { /* Keep the known YouTube fallback. */ }
          }
          return {
            title: typeof found.title === 'string' ? cleanNewsVideoTitle(found.title).slice(0, 500) || null : null,
            thumbnailUrl: thumbnail,
            publishedAt: normalizeNewsPublicationDate(found.publishedAt),
            dateSource: 'youtube_data_api',
          };
        }
      } else {
        console.warn('[youtube metadata] API request unavailable', response.status);
      }
    } catch (error) {
      console.warn('[youtube metadata] API request failed', error);
    }
  }
  // oEmbed exposes the official title, but NOT the video's publication date.
  return {
    title: await fetchYouTubeVideoTitle(rawUrl),
    thumbnailUrl: fallbackThumb,
    publishedAt: null,
    dateSource: 'unavailable',
  };
}
