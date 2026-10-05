'use client';

import { useEffect, useRef, useState } from 'react';

type SocialPost = {
  id: string | number;
  caption?: string | null;
  permalink?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  handle?: string | null;
  media_type?: string | null;
};

function isUsableInstagramPermalink(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    const code = parts[1] || '';
    return (parts[0] === 'p' || parts[0] === 'reel') && code.length >= 5 && !/^\d+$/.test(code);
  } catch {
    return false;
  }
}

export default function ProfileSchoolSocialFeed({ hsid, playerid }: { hsid: string; playerid: string }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const panel = document.getElementById('ppTab-social');
    if (!panel) return;

    const maybeFetch = () => {
      const active =
        panel.classList.contains('pp-fz-panel-active') &&
        panel.getAttribute('aria-hidden') !== 'true' &&
        !panel.hasAttribute('hidden');

      if (!active || fetchedRef.current || !hsid) return;
      fetchedRef.current = true;
      setLoading(true);

      fetch(`/api/social/${encodeURIComponent(hsid)}?playerid=${encodeURIComponent(playerid)}&limit=10`, {
        cache: 'no-store',
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Social fetch failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const visualPosts = (Array.isArray(data?.posts) ? data.posts : []).filter(
            (post: SocialPost) => post.thumbnail_url
          );
          setPosts(visualPosts);
        })
        .catch((error) => {
          console.error('Profile social feed fetch error:', error);
          setPosts([]);
        })
        .finally(() => setLoading(false));
    };

    maybeFetch();
    const observer = new MutationObserver(maybeFetch);
    observer.observe(panel, { attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
    window.addEventListener('hashchange', maybeFetch);

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', maybeFetch);
    };
  }, [hsid, playerid]);

  if (!loading && posts.length === 0) return null;

  return (
    <div className="pp-school-social-feed">
      <div className="pp-stats-bar">SCHOOL SOCIAL</div>
      {loading ? (
        <div className="pp-social-feed-loading">Loading school posts...</div>
      ) : (
        <div className="pp-social-feed-strip" role="list">
          {posts.map((post) => {
            const media = (
              <>
                <img
                  className="pp-social-feed-image"
                  src={post.thumbnail_url || ''}
                  alt={String(post.caption || `Instagram post from @${post.handle || ''}`)}
                  loading="lazy"
                />
                <div className="pp-social-feed-meta">
                  <span><i className="ri-instagram-line" /> @{post.handle}</span>
                  {post.media_type === 'video' && <i className="ri-play-circle-fill" aria-hidden="true" />}
                </div>
              </>
            );

            return isUsableInstagramPermalink(post.permalink) ? (
              <a
                key={String(post.id)}
                className="pp-social-feed-card"
                href={post.permalink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                role="listitem"
              >
                {media}
              </a>
            ) : (
              <div key={String(post.id)} className="pp-social-feed-card" role="listitem">
                {media}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
