'use client';

// Shared Instagram grid and viewer for profile Social posts and linked News.
// Social media uses our synced S3 thumbnails; News may only have a permalink.
// A tile opens an uncropped S3 picture in an on-site viewer; reels and
// carousels can switch to Instagram's interactive embed on demand. Navigation
// stays on the profile and arrows/swipe step through posts. Loads only once the Social tab
// is actually shown, and renders nothing when there are no stored posts.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseNewsVideo } from '@/lib/newsVideo';
import { createPortal } from 'react-dom';

export type InstagramViewerPost = {
  id: string;
  media_type?: string | null;
  caption?: string | null;
  permalink?: string | null;
  thumbnail_url: string;
  published_at?: string | null;
  handle?: string | null;
};

type SchoolFeed = { hsid: string; name: string };

export default function PlayerInstagramFeed({ playerId, firstName, schoolFeed, externalPosts, initialPostId, onClose, preferEmbed = false, renderFooter }: {
  playerId: string; firstName: string; schoolFeed?: SchoolFeed;
  externalPosts?: InstagramViewerPost[]; initialPostId?: string; onClose?: () => void;
  preferEmbed?: boolean; renderFooter?: (post: InstagramViewerPost) => ReactNode;
}) {
  const schoolHsid = schoolFeed?.hsid;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [posts, setPosts] = useState<InstagramViewerPost[] | null>(externalPosts || null);
  const [open, setOpen] = useState<number | null>(null);
  // Null means use the mode best suited to this post. News without an actual
  // Instagram thumbnail opens the real embed instead of a player headshot.
  const [embedOverride, setEmbedOverride] = useState<boolean | null>(null);
  const [brokenThumbnailId, setBrokenThumbnailId] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const [viewerScale, setViewerScale] = useState(1);

  useEffect(() => {
    // Android Chrome's "Desktop site" mode forces a virtual viewport around
    // 980px, then scales it down to the phone. The 480px viewer therefore looks
    // tiny in the middle of a phone screenshot. Enlarge ONLY the dialog's visual
    // presentation, leaving its inner Instagram iframe at mobile-friendly
    // dimensions. Ordinary mobile, desktop and tablet layouts remain unchanged.
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const coarse = window.matchMedia('(any-pointer: coarse)').matches;
      const tallVirtualViewport = width >= 700 && width <= 1200 && height / width >= 1.5;
      const scale = coarse && tallVirtualViewport
        ? Math.min(1.9, (width - 32) / 480, (height - 128) / 820)
        : 1;
      const next = scale >= 1.15 ? Math.round(scale * 100) / 100 : 1;
      setViewerScale(previous => previous === next ? previous : next);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    if (externalPosts) return;
    const el = rootRef.current;
    if (!el) return;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      fetch(schoolHsid ? `/api/social/school/${encodeURIComponent(schoolHsid)}` : `/api/social/player/${encodeURIComponent(playerId)}`)
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
  }, [playerId, schoolHsid, externalPosts]);

  useEffect(() => {
    if (externalPosts) {
      setPosts(externalPosts);
      const index = externalPosts.findIndex(p => p.id === initialPostId);
      setOpen(index >= 0 ? index : externalPosts.length ? 0 : null);
      setEmbedOverride(null);
    }
  }, [externalPosts, initialPostId]);

  const close = useCallback(() => { setOpen(null); onClose?.(); }, [onClose]);

  const count = posts?.length || 0;
  const step = useCallback(
    (by: number) => {
      setEmbedOverride(null);
      setOpen((i) => (i === null || !count ? i : (i + by + count) % count));
    },
    [count]
  );

  // Esc closes, arrows step; the page behind doesn't scroll while open.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
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
  }, [open, step, close]);

  const current = open !== null && posts ? posts[open] : null;
  const requestedMedia = useRef<Set<string>>(new Set());
  const currentId = current?.id;
  const currentPermalink = current?.permalink;
  const currentThumbnail = current?.thumbnail_url;
  useEffect(() => {
    // Exact post-URL lookup runs only when a user opens a News item.
    // It never adds per-post joins or database queries to school page loads.
    if (!preferEmbed || !currentId || !currentPermalink || currentThumbnail ||
        requestedMedia.current.has(currentPermalink)) return;
    requestedMedia.current.add(currentPermalink);
    const controller = new AbortController();
    fetch('/api/social/instagram-post?url=' + encodeURIComponent(currentPermalink), { signal: controller.signal })
      .then(response => response.ok ? response.json() : { post: null })
      .then(data => {
        const matched = data?.post;
        if (!matched?.thumbnail_url || controller.signal.aborted) return;
        setPosts(previous => previous?.map(post => post.id === currentId
          ? { ...post, thumbnail_url: matched.thumbnail_url,
              media_type: matched.media_type || post.media_type,
              handle: matched.handle || post.handle }
          : post) || null);
      }).catch(() => { /* Public Instagram embed remains available. */ });
    return () => controller.abort();
  }, [preferEmbed, currentId, currentPermalink, currentThumbnail]);

  // Iframe URLs must be Instagram URLs parsed by our shared host allowlist.
  const parsedPost = current?.permalink ? parseNewsVideo(current.permalink) : null;
  const embedUrl = parsedPost?.provider === 'Instagram'
    ? (preferEmbed ? parsedPost.embedUrl : parsedPost.embedUrl?.replace(/\/embed\/$/, '/embed/captioned/')) || null
    : null;
  const hasPreview = Boolean(current?.thumbnail_url?.trim() && brokenThumbnailId !== current?.id);
  // News opens the actual Instagram post immediately, including when a
  // matching synced thumbnail arrives a moment later. Social still defaults
  // to the saved uncropped S3 photo and offers Play Reel / View Carousel.
  // A broken S3 thumbnail falls back to the Instagram post in either tab.
  const showInstagramEmbed = embedOverride ?? Boolean(embedUrl && (preferEmbed || brokenThumbnailId === current?.id));
  const hasInteractiveMedia = Boolean(embedUrl && (preferEmbed || current?.media_type === 'video' || current?.media_type === 'carousel'));
  const publishedDate = current?.published_at
    ? new Date(current.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <div ref={rootRef} className="pp-ig-feed">
      {!externalPosts && posts && posts.length > 0 && (
        <>
          <div className={`pp-ig-head${schoolFeed ? ' pp-ig-head-school' : ''}`}>
            <span>
              <i className="ri-instagram-line" /> {schoolFeed ? `${schoolFeed.name} on Instagram` : firstName ? `${firstName} on Instagram` : 'On Instagram'}
            </span>
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
                  onClick={() => { setEmbedOverride(null); setOpen(i); }}
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
      {/* Portaled to body so the profile's tabs cannot clip the viewer.
          Show the original S3 image using contain: Instagram embeds can be
          taller than the available mobile viewport and were cropping photos. */}
      {current && createPortal(
        <div
          className={`pp-ig-viewer${viewerScale > 1 ? " pp-ig-viewer-zoomed" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={'Instagram post by @' + (current.handle || 'unknown')}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
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
          <div className="pp-ig-frame" style={viewerScale > 1 ? { transform: `scale(${viewerScale})` } : undefined}>
            <div className="pp-ig-post-source">
              <i className="ri-instagram-line" aria-hidden="true" />
              <strong>{current.handle ? '@' + current.handle : 'Instagram'}</strong>
              {current.permalink && (
                <a href={current.permalink} target="_blank" rel="noopener noreferrer">
                  ORIGINAL POST <i className="ri-external-link-line" aria-hidden="true" />
                </a>
              )}
            </div>
            <div className="pp-ig-media">
              {showInstagramEmbed && embedUrl ? (
                // A News post with no synced thumbnail must use Instagram's
                // native player. Contain that player like the Social photo,
                // and clip only Instagram's redundant account header: our
                // own black Instagram + Original Post bar remains visible.
                <div className={preferEmbed ? (
                  'pp-ig-news-embed-window' + (current.media_type === 'video' || /\/reel\//.test(current.permalink || '') ? ' is-reel' : '')
                ) : 'pp-ig-social-embed-window'}>
                  <iframe
                    key={current.id}
                    src={embedUrl}
                    title={'Interactive Instagram post by @' + (current.handle || 'unknown')}
                    allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
                    allowFullScreen
                    loading="eager"
                    scrolling="no"
                  />
                </div>
              ) : hasPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  src={current.thumbnail_url}
                  alt={current.caption ? current.caption.slice(0, 140) : 'Instagram post photo'}
                  onError={() => setBrokenThumbnailId(current.id)}
                />
              ) : (
                <div className="pp-ig-media-unavailable">
                  <p>Instagram preview unavailable.</p>
                  {current.permalink && <a href={current.permalink} target="_blank" rel="noopener noreferrer">Open original Instagram post</a>}
                </div>
              )}
            </div>
            <div className={`pp-ig-post-details${renderFooter ? " pp-ig-post-details-news" : ""}`}>
              {hasInteractiveMedia && hasPreview && (
                <button
                  type="button"
                  className="pp-ig-embed-toggle"
                  onClick={() => setEmbedOverride(!showInstagramEmbed)}
                >
                  <i className={showInstagramEmbed ? 'ri-image-line' : current.media_type === 'video' ? 'ri-play-circle-line' : 'ri-stack-line'} aria-hidden="true" />
                  {showInstagramEmbed ? 'VIEW UNCROPPED PHOTO' : current.media_type === 'video' ? 'PLAY REEL' : current.media_type === 'carousel' ? 'VIEW CAROUSEL' : 'VIEW INSTAGRAM POST'}
                </button>
              )}
              {(!showInstagramEmbed || renderFooter) && current.caption && (
                <p className="pp-ig-caption">{current.caption}</p>
              )}
              {(!showInstagramEmbed || renderFooter) && publishedDate && (
                <time dateTime={current.published_at || undefined} className="pp-ig-post-date">{publishedDate}</time>
              )}
              {renderFooter && <div className="pp-ig-extra" key={current.id}>{renderFooter(current)}</div>}
              {renderFooter && showInstagramEmbed && current.permalink && (
                <a className="pp-ig-embed-backup" href={current.permalink} target="_blank" rel="noopener noreferrer">
                  Instagram not playing? Open original post
                </a>
              )}
            </div>
          </div>
          <button type="button" className="pp-ig-close" aria-label="Close" onClick={close}>
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
        .pp-ig-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 6px; font:600 12px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); color:var(--fg,#f0f0f0); }
        .pp-ig-head span { min-width:0; }
        .pp-ig-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; }
        @media (min-width:700px){ .pp-ig-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
        .pp-ig-tile { position:relative; display:block; aspect-ratio:3/4; overflow:hidden; background:rgba(128,128,128,.15); border:0; padding:0; margin:0; cursor:pointer; }
        .pp-ig-tile img { width:100%; height:100%; object-fit:contain; display:block; }
        .pp-ig-viewer { position:fixed; inset:0; z-index:10050; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.92); padding:54px 56px 55px; }
        .pp-ig-frame { width:min(480px,100%); height:min(820px,calc(100vh - 112px)); height:min(820px,calc(100dvh - 112px)); display:flex; flex-direction:column; background:#121212; color:#f5f5f5; border-radius:8px; overflow:hidden; }
        .pp-ig-post-source { min-height:45px; flex:0 0 auto; display:flex; align-items:center; gap:8px; padding:9px 13px; font:600 12px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .pp-ig-post-source strong { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pp-ig-post-source i { font-size:16px; }
        .pp-ig-post-source a { white-space:nowrap; font:700 10px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); letter-spacing:.04em; color:#e6c34c; text-decoration:none; }
        .pp-ig-media { min-height:0; min-width:0; flex:1 1 auto; display:flex; align-items:center; justify-content:center; background:#050505; }
        .pp-ig-media img { width:100%; height:100%; display:block; object-fit:contain; object-position:center; }
        .pp-ig-media iframe { width:100%; height:100%; display:block; border:0; background:white; }
        .pp-ig-social-embed-window { width:100%;height:100%; }
        /* Media-first News mirrors the Social viewer's contained portrait.
           A live Instagram embed is the fallback for contributed links whose
           actual media has not been synced to our S3 library. */
        .pp-ig-news-embed-window {
          width:min(83%,380px);
          min-width:min(100%,326px);
          aspect-ratio:4/5;
          max-height:100%;
          position:relative;
          overflow:hidden;
          flex:none;
          border-radius:6px;
          background:#050505;
        }
        .pp-ig-news-embed-window.is-reel { width:min(76%,355px); aspect-ratio:9/16; }
        /* The original embed's account stripe duplicates the YAT?STATS bar.
           Clip its stripe, not the post media or the on-platform controls. */
        .pp-ig-news-embed-window iframe {
          position:absolute;
          inset:-44px 0 auto 0;
          width:100%;
          height:calc(100% + 44px);
          background:#050505;
        }
        .pp-ig-post-details { flex:0 0 auto; max-height:128px; overflow-y:auto; overscroll-behavior:contain; padding:9px 13px 11px; }
        .pp-ig-post-details-news { flex:0 0 auto; max-height:128px; }
        .pp-ig-post-details-news:has(.yp-news-thread-open) { flex:0 1 auto; max-height:min(38dvh,320px); }
        .pp-ig-post-details-news .pp-ig-caption { max-height:70px; }
        .pp-ig-post-details-news .yp-news-engagement { margin-top:9px; padding-top:9px; }
        .pp-ig-extra { min-width:0; }
        .pp-ig-embed-backup { display:inline-block; margin-top:6px; color:#e6c34c; font:600 11px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .pp-ig-media-unavailable { display:grid; justify-items:center; gap:10px; padding:18px; color:#ddd; text-align:center; font:600 13px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .pp-ig-media-unavailable p { margin:0; }
        .pp-ig-media-unavailable a { color:#e6c34c; }
        .pp-ig-caption { margin:0; max-height:62px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; color:#dedede; font:400 12px/1.4 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .pp-ig-post-date { display:block; margin-top:6px; font:500 10px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); color:#a7a7a7; }
        .pp-ig-embed-toggle { display:inline-flex; align-items:center; gap:5px; margin:0 0 7px; border:1px solid rgba(255,255,255,.35); border-radius:4px; padding:6px 10px; background:#282828; color:#fff; cursor:pointer; font:700 11px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .pp-ig-embed-toggle i { font-size:15px; }
        .pp-ig-close { position:absolute; top:9px; right:12px; width:40px; height:40px; border:0; border-radius:50%; background:rgba(255,255,255,.16); color:#fff; font-size:24px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .pp-ig-nav { position:absolute; top:50%; transform:translateY(-50%); width:44px; height:44px; border:0; border-radius:50%; background:rgba(255,255,255,.16); color:#fff; font-size:30px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .pp-ig-nav.prev { left:8px; }
        .pp-ig-nav.next { right:8px; }
        .pp-ig-count { position:absolute; bottom:16px; left:0; right:0; text-align:center; color:rgba(255,255,255,.84); font:500 12px/1 var(--yat-font-ui,Archivo,Arial,sans-serif); letter-spacing:.06em; pointer-events:none; }
        /* Phone requesting Desktop site: the frame stays 480px for Instagram's
           embed layout, then scales visually to occupy the actual phone. */
        .pp-ig-viewer-zoomed .pp-ig-close { width:62px; height:62px; font-size:34px; }
        .pp-ig-viewer-zoomed .pp-ig-nav { width:64px; height:64px; font-size:38px; }
        .pp-ig-viewer-zoomed .pp-ig-count { font-size:19px; bottom:22px; }
        @media (max-width:600px){
          .pp-ig-viewer { padding:56px 0 54px; padding: max(56px,env(safe-area-inset-top)) 0 max(54px,env(safe-area-inset-bottom)); }
          .pp-ig-frame { width:100%; height:calc(100vh - 110px); height:calc(100dvh - 110px); border-radius:0; }
          .pp-ig-post-details-news { max-height:128px; }
          .pp-ig-post-details-news:has(.yp-news-thread-open) { max-height:38dvh; }
          .pp-ig-nav { top:auto; bottom:8px; transform:none; width:38px; height:38px; font-size:26px; }
          .pp-ig-nav.prev { left:calc(50% - 90px); }
          .pp-ig-nav.next { right:calc(50% - 90px); }
          .pp-ig-count { bottom:20px; }
        }
        .pp-ig-kind { position:absolute; top:5px; right:5px; color:#fff; font-size:16px; text-shadow:0 1px 3px rgba(0,0,0,.7); }
      `}</style>
    </div>
  );
}
