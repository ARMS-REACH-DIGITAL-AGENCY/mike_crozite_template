'use client';

// The player's own Instagram posts in the profile's Social tab: a grid of
// their latest posts (our S3 copies, refreshed by the instagram-sync cron),
// each opening the post on Instagram. Loads only once the Social tab is
// actually shown, and renders nothing when there are no stored posts.
import { useEffect, useRef, useState } from 'react';

type Post = {
  id: string;
  media_type?: string | null;
  caption?: string | null;
  permalink?: string | null;
  thumbnail_url: string;
  published_at?: string | null;
  handle?: string | null;
};

export default function PlayerInstagramFeed({ playerId, firstName }: { playerId: string; firstName: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      fetch(`/api/social/player/${encodeURIComponent(playerId)}`)
        .then((r) => (r.ok ? r.json() : { posts: [] }))
        .then((d) => setPosts(Array.isArray(d?.posts) ? d.posts : []))
        .catch(() => setPosts([]));
    };
    // The tab panel is display:none until opened; the observer fires when
    // it gets a box.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        load();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [playerId]);

  const handle = posts?.[0]?.handle || '';
  return (
    <div ref={rootRef} className="pp-ig-feed">
      {posts && posts.length > 0 && (
        <>
          <div className="pp-ig-head">
            <span>
              <i className="ri-instagram-line" /> {firstName ? `${firstName} on Instagram` : 'On Instagram'}
            </span>
            {handle && (
              <a href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer">
                Follow @{handle}
              </a>
            )}
          </div>
          <div className="pp-ig-grid" role="list">
            {posts.map((p) => {
              const body = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbnail_url} alt={p.caption ? p.caption.slice(0, 120) : `Instagram post by @${p.handle}`} loading="lazy" />
                  {p.media_type === 'video' && <i className="ri-play-fill pp-ig-kind" aria-label="Video" />}
                  {p.media_type === 'carousel' && <i className="ri-stack-line pp-ig-kind" aria-label="Several photos" />}
                </>
              );
              return p.permalink ? (
                <a key={p.id} className="pp-ig-tile" role="listitem" href={p.permalink} target="_blank" rel="noopener noreferrer">
                  {body}
                </a>
              ) : (
                <div key={p.id} className="pp-ig-tile" role="listitem">
                  {body}
                </div>
              );
            })}
          </div>
        </>
      )}
      <style>{`
        .pp-ig-feed { width:100%; margin:0 0 14px; }
        .pp-ig-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 0 8px; font:600 12px/1.2 Oswald,sans-serif; color:var(--fg,#f0f0f0); }
        .pp-ig-head a { font:500 11px/1.2 Oswald,sans-serif; color:var(--accent,#c8a96e); text-decoration:none; white-space:nowrap; }
        .pp-ig-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; }
        @media (min-width:700px){ .pp-ig-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
        .pp-ig-tile { position:relative; display:block; aspect-ratio:1/1; overflow:hidden; background:rgba(128,128,128,.15); }
        .pp-ig-tile img { width:100%; height:100%; object-fit:cover; display:block; }
        .pp-ig-kind { position:absolute; top:5px; right:5px; color:#fff; font-size:16px; text-shadow:0 1px 3px rgba(0,0,0,.7); }
      `}</style>
    </div>
  );
}
