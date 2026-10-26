import 'server-only';
import { cleanNewsVideoTitle, parseNewsVideo } from '@/lib/newsVideo';

// Ask YouTube for its official title once during ingestion, not on a News page load.
// Never send untrusted fan URLs to fetch; only a validated YouTube ID is used.
export async function fetchYouTubeVideoTitle(rawUrl: string): Promise<string | null> {
  const video = parseNewsVideo(rawUrl);
  if (video?.provider !== 'YouTube' || !video.embedUrl) return null;
  const id = /^https:\/\/www\.youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})(?:\?|$)/.exec(video.embedUrl)?.[1];
  if (!id) return null;
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', 'https://www.youtube.com/watch?v=' + id);
  endpoint.searchParams.set('format', 'json');
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5500),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as { title?: unknown; provider_name?: unknown };
    if (data.provider_name !== 'YouTube' || typeof data.title !== 'string') return null;
    return cleanNewsVideoTitle(data.title).slice(0, 500) || null;
  } catch { return null; }
}
