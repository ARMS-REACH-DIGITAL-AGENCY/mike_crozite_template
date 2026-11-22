'use client';

import { useEffect, useState } from 'react';
import ProfileNewsList, { type ProfileNewsStory } from './ProfileNewsList';
import { watchVisibleNews } from '@/lib/visibleNewsRefresh';

type Props = {
  stories: ProfileNewsStory[];
  firstName: string;
  playerId: string;
  photoId?: string | null;
  playerName: string;
  hsid: string;
};

function profileStory(post: Record<string, any>, props: Props): ProfileNewsStory {
  const recap = String(post.displayRecap || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    uuid: String(post.uuid),
    articleId: post.id ?? null,
    title: post.displayHeadline || post.title || 'Alumni news',
    url: post.url,
    source: post.sourceFull || post.displaySourceLabel || post.source || null,
    publishedAt: post.publishedAt || null,
    recap: !post.taggedStory && recap.toLowerCase().includes(props.playerName.toLowerCase()) ? recap : null,
    whyLocal: post.displayWhyLocal || null,
    imageUrl: post.imageUrl || null,
    newsworthiness: post.newsworthiness || 'NORMAL',
    tease: post.tease?.body ?? post.summary ?? null,
    playerId: props.playerId,
    photoId: props.photoId,
    playerName: props.playerName,
  };
}

export default function RefreshingProfileNews(props: Props) {
  const { stories, hsid, playerId, photoId, playerName } = props;
  const [currentStories, setCurrentStories] = useState(stories);

  useEffect(() => {
    setCurrentStories(stories);
    const panel = document.getElementById('ppTab-news');
    if (!panel) return;
    let disposed = false;
    let activeRequest: AbortController | null = null;
    const refresh = async () => {
      if (activeRequest) return;
      const controller = new AbortController();
      activeRequest = controller;
      const complete: ProfileNewsStory[] = [];
      const seen = new Set<string>();
      try {
        for (let offset = 0; ; offset += 100) {
          const response = await fetch(`/api/news/${encodeURIComponent(hsid)}?player=${encodeURIComponent(photoId || playerId)}&view=profile&sort=newest&fresh=1&limit=100&offset=${offset}`, {
            cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Profile news ${response.status}`);
          const data = await response.json();
          if (disposed || controller.signal.aborted) return;
          const page: Record<string, any>[] = Array.isArray(data?.posts) ? data.posts : [];
          const previousSize = seen.size;
          for (const post of page) {
            const uuid = String(post.uuid || '');
            if (!uuid || seen.has(uuid)) continue;
            seen.add(uuid);
            complete.push(profileStory(post, props));
          }
          // New cards appear after the first response while the cached full
          // history stays available during pagination or a network failure.
          const latest = [...complete];
          const latestIds = new Set(seen);
          setCurrentStories(previous => [...latest, ...previous.filter(story => !latestIds.has(story.uuid))]);
          if (page.length < 100) break;
          if (seen.size === previousSize) throw new Error('Profile news pagination did not advance');
        }
        if (!disposed && !controller.signal.aborted) setCurrentStories(complete);
      } catch (error) {
        if (!controller.signal.aborted) console.error('[ProfileNews] refresh failed', error);
      } finally {
        if (activeRequest === controller) activeRequest = null;
      }
    };
    const stopWatching = watchVisibleNews(panel, 'pp-fz-panel-active', visible => {
      if (visible) void refresh();
      else { activeRequest?.abort(); activeRequest = null; }
    });
    return () => {
      disposed = true;
      activeRequest?.abort();
      stopWatching();
    };
  }, [stories, hsid, playerId, photoId, playerName]);

  return <ProfileNewsList {...props} stories={currentStories} />;
}
