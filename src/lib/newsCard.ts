// What a News card shows, shared by every News view (the profile's News tab,
// the school's Alumni News feed and the flip card's News tab) so a story
// looks the same wherever it appears.
import { getNewsPhotoSrcs } from './playerImage';
import { parseNewsVideo } from './newsVideo';

export function newsCardLabel(newsworthiness: string | null | undefined): string {
  return String(newsworthiness || '').toUpperCase() === 'LOW' ? 'NEWS NUGGET' : 'YAT?STATS NEWS';
}

export function newsCardDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function newsCardFooter(source: string | null | undefined, publishedAt: string | null | undefined): string {
  const date = newsCardDate(publishedAt);
  return `${(source || 'News').toUpperCase()}${date ? ` · ${date}` : ''}`;
}

// Pictures to try, in order: a video story's own picture (the YouTube
// thumbnail, or our copy of the Instagram post's picture), then the
// player's photos.
export function newsCardPictureSrcs(story: {
  url?: string | null; playerId?: string | null; imageUrl?: string | null; instagramPicture?: string | null;
}): string[] {
  const video = parseNewsVideo(story.url);
  const own = video?.provider === 'Instagram' ? story.instagramPicture : video?.thumbnailUrl;
  return [...(own ? [own] : []), ...getNewsPhotoSrcs(story.playerId, story.imageUrl)];
}
