'use client';

// The player's own Instagram posts in the profile's Social tab: a grid of
// their latest posts (our S3 copies, refreshed by the instagram-sync cron).
// A tile opens the post right here, in Instagram's own embedded player
// (reels play, carousels swipe) over the profile - the fan never leaves the
// site; arrows/swipe step through the posts. Loads only once the Social tab
// is actually shown, and renders nothing when there are no stored posts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [open, setOpen] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);

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
  const count = posts?.length || 0;
  const step = useCallback(
    (by: number) => setOpen((i) => (i === null || !count ? i : (i + by + count) % count)),
    [count]
  );

  // Esc closes, arrows step; the page behind doesn't scroll while open.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, step]);

  const current = open !== null && posts ? posts[open] : null;
  const embedUrl = current?.permalink ? `${current.permalink.replace(/\/?$/, '/')}embed/captioned/` : null;
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
            {posts.map((p, i) => {
              const body = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbnail_url} alt={p.caption ? p.caption.slice(0, 120) : `Instagram post by @${p.handle}`} loading="lazy" />
                  {p.media_type === 'video' && <i className="ri-play-fill pp-ig-kind" aria-label="Video" />}
                  {p.media_type === 'carousel' && <i className="ri-stack-line pp-ig-kind" aria-label="Several photos" />}
                </>
              );
              return p.permalink ? (
                <button
                  key={p.id}
                  type="button"
                  className="pp-ig-tile"
                  role="listitem"
                  aria-label={`Open post ${i + 1} of ${posts.length}`}
                  onClick={() => setOpen(i)}
                >
                  {body}
                </button>
              ) : (
                <div key={p.id} className="pp-ig-tile" role="listitem">
                  {body}
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* Portaled to <body> so no tab panel (overflow/transform) can clip
          or trap the full-screen viewer. */}
      {current && embedUrl && createPortal(
        <div
          className="pp-ig-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`@${current.handle} on Instagram`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined || Math.abs(end - start) < 60) return;
            step(end < start ? 1 : -1);
          }}
        >
          <div className="pp-ig-frame">
            <iframe
              key={current.id}
              src={embedUrl}
              title={`Instagram post by @${current.handle}`}
              allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
              allowFullScreen
              loading="eager"
            />
          </div>
          <button type="button" className="pp-ig-close" aria-label="Close" onClick={() => setOpen(null)}>
            <i className="ri-close-line" />
          </button>
          {count > 1 && (
            <>
              <button type="button" className="pp-ig-nav prev" aria-label="Previous post" onClick={() => step(-1)}>
                <i className="ri-arrow-left-s-line" />
              </button>
              <button type="button" className="pp-ig-nav next" aria-label="Next post" onClick={() => step(1)}>
                <i className="ri-arrow-right-s-line" />
              </button>
            </>
          )}
          <div className="pp-ig-count">
            {(open ?? 0) + 1} / {count}
          </div>
        </div>,
        document.body
      )}
      <style>{`
        .pp-ig-feed { width:100%; margin:0 0 14px; }
        .pp-ig-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 0 8px; font:600 12px/1.2 Oswald,sans-serif; color:var(--fg,#f0f0f0); }
        .pp-ig-head a { font:500 11px/1.2 Oswald,sans-serif; color:var(--accent,#c8a96e); text-decoration:none; white-space:nowrap; }
        .pp-ig-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; }
        @media (min-width:700px){ .pp-ig-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
        .pp-ig-tile { position:relative; display:block; aspect-ratio:1/1; overflow:hidden; background:rgba(128,128,128,.15); border:0; padding:0; margin:0; cursor:pointer; }
        .pp-ig-tile img { width:100%; height:100%; object-fit:cover; display:block; }
        .pp-ig-viewer { position:fixed; inset:0; z-index:10050; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.86); padding:48px 56px; }
        .pp-ig-frame { width:min(480px,100%); height:min(820px,100%); background:#fff; border-radius:8px; overflow:hidden; }
        .pp-ig-frame iframe { width:100%; height:100%; border:0; display:block; }
        .pp-ig-close { position:absolute; top:10px; right:12px; width:40px; height:40px; border:0; border-radius:50%; background:rgba(255,255,255,.14); color:#fff; font-size:24px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .pp-ig-nav { position:absolute; top:50%; transform:translateY(-50%); width:44px; height:44px; border:0; border-radius:50%; background:rgba(255,255,255,.14); color:#fff; font-size:30px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .pp-ig-nav.prev { left:8px; }
        .pp-ig-nav.next { right:8px; }
        .pp-ig-count { position:absolute; bottom:14px; left:0; right:0; text-align:center; color:rgba(255,255,255,.75); font:500 12px/1 Oswald,sans-serif; letter-spacing:.06em; }
        @media (max-width:600px){
          .pp-ig-viewer { padding:56px 0 40px; }
          .pp-ig-frame { width:100%; border-radius:0; }
          .pp-ig-nav { top:auto; bottom:6px; transform:none; width:38px; height:38px; font-size:26px; }
          .pp-ig-nav.prev { left:calc(50% - 90px); }
          .pp-ig-nav.next { right:calc(50% - 90px); }
          .pp-ig-count { bottom:18px; }
        }
        .pp-ig-kind { position:absolute; top:5px; right:5px; color:#fff; font-size:16px; text-shadow:0 1px 3px rgba(0,0,0,.7); }
      `}</style>
    </div>
  );
}
