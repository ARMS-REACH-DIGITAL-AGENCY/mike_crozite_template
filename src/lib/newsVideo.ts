// Shared, allowlisted parsing for fan-contributed video links.
// A pasted URL is never used directly as an iframe source.
export type NewsVideo = {
  provider: 'YouTube' | 'Vimeo' | 'Instagram' | 'TikTok' | 'Facebook' | 'X';
  watchUrl: string;
  embedUrl: string | null;
  thumbnailUrl: string | null;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseNewsVideo(rawUrl: string | null | undefined): NewsVideo | null {
  let url: URL;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const watchUrl = url.href;
  const video = (provider: NewsVideo['provider'], embedUrl: string | null, thumbnailUrl: string | null): NewsVideo =>
    ({ provider, watchUrl, embedUrl, thumbnailUrl });

  if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be'
      ? parts[0]
      : url.pathname === '/watch' ? url.searchParams.get('v') : (
        ['shorts', 'live', 'embed', 'v'].includes(parts[0] || '') ? parts[1] : null
      );
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return video(
      'YouTube',
      'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1',
      'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'
    );
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts[0];
    if (!id || !/^\d{1,15}$/.test(id)) return null;
    return video('Vimeo', 'https://player.vimeo.com/video/' + id + '?dnt=1', null);
  }

  if (host === 'instagram.com' || host === 'm.instagram.com') {
    return ['reel', 'p', 'tv'].includes(parts[0] || '') && Boolean(parts[1])
      ? video('Instagram', null, null) : null;
  }

  if (host === 'tiktok.com' || host === 'm.tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return video('TikTok', null, null);
  }

  if (['facebook.com', 'm.facebook.com', 'fb.com', 'fb.watch'].includes(host)) {
    return parts.length ? video('Facebook', null, null) : null;
  }

  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
    return parts.includes('status') ? video('X', null, null) : null;
  }

  return null;
}

// Older submissions sometimes put raw video IDs, embed addresses, and thumbnail
// links in the headline. Correct those at display time without mutating history.
export function newsVideoHeadline(rawTitle: string, playerName: string | null | undefined): string {
  const name = String(playerName || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const fallback = 'Video featuring ' + (name || 'a YAT?STATS alumnus');
  const title = String(rawTitle || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 110 || /(?:youtube\s+(?:video\s+)?tip|youtube\s+id|embed\s+url|thumbnail\s*:|https?:\/\/|video\s+shared\s+about)/i.test(title)) {
    return fallback;
  }
  return title;
}

export function newsVideoDescription(rawText: string | null | undefined): string {
  const text = String(rawText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /(?:youtube\s+(?:video\s+)?tip|youtube\s+id|embed\s+url|thumbnail\s*:|https?:\/\/)/i.test(text)) return '';
  if (/\bgets? a mention in this\b/i.test(text)) return '';
  return text.slice(0, 350);
}
