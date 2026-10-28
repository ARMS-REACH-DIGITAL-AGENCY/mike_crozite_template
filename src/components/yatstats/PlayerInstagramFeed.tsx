'use client';

// The player's own Instagram posts in the profile's Social tab: a grid of
// their latest posts (our S3 copies, refreshed by the instagram-sync cron).
// News stories that link to Instagram open in this same viewer.
// Social tiles open an uncropped S3 image and can switch to the interactive embed.
// News articles open the interactive Instagram embed directly, with no preview step. Navigation
// stays on the profile and arrows/swipe step through posts. Loads only once the Social tab
// is actually shown, and renders nothing when there are no stored posts.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type InstagramViewerPost = {
  id: string;
  media_type?: string | null;
  caption?: string | null;
  permalink?: string | null;
  thumbnail_url: string;
  published_at?: string | null;
  handle?: string | null;
  /** News only: the post's own picture is still being looked up. */
  media_pending?: boolean;
};

type SchoolFeed = { hsid: string; name: string };

const INSTAGRAM_EMBED_HEADER = 54;

export default function PlayerInstagramFeed({ playerId, firstName, schoolFeed, externalPosts, initialPostId, onClose, renderFooter }: {
  playerId: string; firstName: string; schoolFeed?: SchoolFeed;
  externalPosts?: InstagramViewerPost[]; initialPostId?: string; onClose?: () => void;
  /** Extra controls under the caption (News likes, shares and comments). */
  renderFooter?: (post: InstagramViewerPost) => ReactNode;
}) {
  const schoolHsid = schoolFeed?.hsid;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [posts, setPosts] = useState<InstagramViewerPost[] | null>(externalPosts || null);
  const [open, setOpen] = useState<number | null>(null);
  const [showInstagramEmbed, setShowInstagramEmbed] = useState(false);
  const [brokenPictureId, setBrokenPictureId] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  // Each post's width:height, read from its picture, so Instagram's player
  // can be cut down to exactly the post's media.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [mediaBox, setMediaBox] = useState<{ width: number; height: number } | null>(null);
  const mediaObserver = useRef<ResizeObserver | null>(null);
  const mediaRef = useCallback((el: HTMLDivElement | null) => {
    mediaObserver.current?.disconnect();
    mediaObserver.current = null;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const width = Math.floor(el.clientWidth);
      const height = Math.floor(el.clientHeight);
      setMediaBox((box) => (box && box.width === width && box.height === height ? box : { width, height }));
    });
    observer.observe(el);
    mediaObserver.current = observer;
  }, []);

  useEffect(() => {
    // Android Chrome's "Desktop site" mode lays the page out around 980px
    // wide and shrinks it onto the phone, so the 480px viewer looked tiny.
    // Enlarge only the viewer's presentation there; Instagram's player
    // inside keeps its mobile dimensions.
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const coarse = window.matchMedia('(any-pointer: coarse)').matches;
      const tallVirtualViewport = width >= 700 && width <= 1200 && height / width >= 1.5;
      const scale = coarse && tallVirtualViewport
        ? Math.min(1.9, (width - 32) / 480, (height - 128) / 820)
        : 1;
      const next = scale >= 1.15 ? Math.round(scale * 100) / 100 : 1;
      setViewerScale((previous) => (previous === next ? previous : next));
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

  // News posts can be filled in (picture, @handle, caption) after the viewer
  // opens: take the new details as they come, but only a newly chosen post
  // moves the viewer.
  const [openedFor, setOpenedFor] = useState<string | undefined>(undefined);
  if (externalPosts && posts !== externalPosts) setPosts(externalPosts);
  if (externalPosts && openedFor !== initialPostId) {
    const index = externalPosts.findIndex(p => p.id === initialPostId);
    setOpenedFor(initialPostId);
    setOpen(index >= 0 ? index : externalPosts.length ? 0 : null);
    setShowInstagramEmbed(false);
  }

  const close = useCallback(() => { setOpen(null); onClose?.(); }, [onClose]);

  const count = posts?.length || 0;
  const step = useCallback(
    (by: number) => {
      setShowInstagramEmbed(false);
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
  const embedUrl = current?.permalink ? `${current.permalink.replace(/\/?$/, '/')}embed/` : null;
  const hasInteractiveMedia = Boolean(embedUrl && (current?.media_type === 'video' || current?.media_type === 'carousel'));
  // No picture of the post itself (never a stand-in photo): show Instagram's
  // own player instead, once we know no picture is coming.
  const hasPicture = Boolean(current?.thumbnail_url?.trim() && brokenPictureId !== current?.id);
  // News opens the real Instagram post immediately; Social tiles retain their established preview behavior.
  // A photo news post uses its own uncropped stored image rather than Instagram's clipped iframe.
  // Reels and carousels open the native interactive embed immediately.
  const isInteractiveNews = Boolean(externalPosts && (current?.media_type === 'carousel' || /\/(reel|tv)\//.test(current?.permalink || '') || current?.media_type === 'video'));
  // Instagram's cached link-preview thumbnail can be square-cropped even when the actual post is 4:5.
  // Render the original Instagram post for all News media, never substitute that thumbnail.
  const embedShown = Boolean(embedUrl && (externalPosts ? (isInteractiveNews || !hasPicture) : (showInstagramEmbed || (!hasPicture && !current?.media_pending))));
  // Instagram's player (measured): a 54px account bar with "View profile",
  // then the media at full width, then "View more on Instagram", likes and
  // comments. Show only the media, at the post's own proportions; it can't
  // be laid out narrower than 326px, so a smaller box scales it down.
  // Social embeds use Instagram's 4:5 frame; News uses the requested 9:16 media viewport. Photos keep their own shape, which
  // Instagram limits to between 1.91:1 and 4:5.
  const isReel = /\/(reel|tv)\//.test(current?.permalink || '') || current?.media_type === 'video';
  const pictureShape = current ? aspects[current.id] : undefined;
  // News reels use a 9:16 viewport; standard posts/carousels retain Instagram's post proportions.
  // Social-tab sizing stays unchanged.
  const heightPerWidth = isReel && externalPosts ? 16 / 9 : (!isReel && pictureShape ? Math.min(5 / 4, Math.max(1 / 1.91, pictureShape)) : 5 / 4);
  const embedBox = mediaBox
    ? (() => {
        const width = Math.max(1, Math.min(mediaBox.width, Math.floor(mediaBox.height / heightPerWidth)));
        const layoutWidth = Math.max(326, width);
        return { width, height: Math.floor(width * heightPerWidth), layoutWidth, scale: width / layoutWidth };
      })()
    : null;
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
                  onClick={() => { setShowInstagramEmbed(false); setOpen(i); }}
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
          className={`pp-ig-viewer${viewerScale > 1 ? ' pp-ig-viewer-zoomed' : ''}`}
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
            <div className="pp-ig-media" ref={mediaRef}>
              {embedShown && embedUrl ? (
                embedBox && (
                  <div className="pp-ig-embed-crop" style={{ width: embedBox.width, height: embedBox.height }}>
                    <iframe
                      key={current.id}
                      src={embedUrl}
                      title={'Interactive Instagram post by @' + (current.handle || 'unknown')}
                      allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
                      allowFullScreen
                      loading="eager"
                      scrolling="no"
                      style={{
                        width: embedBox.layoutWidth,
                        height: INSTAGRAM_EMBED_HEADER + Math.ceil(embedBox.layoutWidth * heightPerWidth) + 2,
                        transform: `translateY(${-INSTAGRAM_EMBED_HEADER * embedBox.scale}px) scale(${embedBox.scale})`,
                      }}
                    />
                  </div>
                )
              ) : hasPicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  src={current.thumbnail_url}
                  alt={current.caption ? current.caption.slice(0, 140) : 'Instagram post photo'}
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    const id = current.id;
                    if (w && h) setAspects((all) => (all[id] === h / w ? all : { ...all, [id]: h / w }));
                  }}
                  onError={() => setBrokenPictureId(current.id)}
                />
              ) : current.media_pending ? (
                <div className="pp-ig-media-loading" role="status" aria-label="Loading Instagram post" />
              ) : (
                <div className="pp-ig-media-unavailable">
                  <p>Instagram preview unavailable.</p>
                  {current.permalink && <a href={current.permalink} target="_blank" rel="noopener noreferrer">Open the original Instagram post</a>}
                </div>
              )}
            </div>
            <div className={`pp-ig-post-details${renderFooter ? ' pp-ig-post-details-news' : ''}`}>
              {!externalPosts && hasInteractiveMedia && hasPicture && (
                <button
                  type="button"
                  className="pp-ig-embed-toggle"
                  onClick={() => setShowInstagramEmbed((shown) => !shown)}
                >
                  <i className={showInstagramEmbed ? 'ri-image-line' : current.media_type === 'video' ? 'ri-play-circle-line' : 'ri-stack-line'} aria-hidden="true" />
                  {showInstagramEmbed ? 'VIEW UNCROPPED PHOTO' : current.media_type === 'video' ? 'PLAY REEL' : 'VIEW CAROUSEL'}
                </button>
              )}
              {!embedShown && current.caption && (
                <p className="pp-ig-caption">{current.caption}</p>
              )}
              {!embedShown && publishedDate && (
                <time dateTime={current.published_at || undefined} className="pp-ig-post-date">{publishedDate}</time>
              )}
              {renderFooter && <div className="pp-ig-extra" key={current.id}>{renderFooter(current)}</div>}
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
        .pp-ig-embed-crop { position:relative; flex:none; overflow:hidden; background:#050505; }
        .pp-ig-embed-crop iframe { position:absolute; top:0; left:0; display:block; border:0; background:#050505; transform-origin:0 0; }
        .pp-ig-post-details { flex:0 0 auto; max-height:128px; overflow-y:auto; overscroll-behavior:contain; padding:9px 13px 11px; }
        .pp-ig-post-details-news { max-height:150px; }
        .pp-ig-post-details-news:has(.yp-news-thread-open) { flex:0 1 auto; max-height:min(38dvh,320px); }
        .pp-ig-post-details-news .yp-news-engagement { margin-top:8px; padding-top:6px; }
        .pp-ig-extra { min-width:0; }
        .pp-ig-media-loading { width:28px; height:28px; border-radius:50%; border:3px solid rgba(255,255,255,.2); border-top-color:#e6c34c; animation:pp-ig-spin .9s linear infinite; }
        @keyframes pp-ig-spin { to { transform:rotate(360deg); } }
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
        .pp-ig-viewer-zoomed .pp-ig-close { width:62px; height:62px; font-size:34px; }
        .pp-ig-viewer-zoomed .pp-ig-nav { width:64px; height:64px; font-size:38px; }
        .pp-ig-viewer-zoomed .pp-ig-count { font-size:19px; bottom:22px; }
        @media (max-width:600px){
          .pp-ig-viewer { padding:56px 0 54px; padding: max(56px,env(safe-area-inset-top)) 0 max(54px,env(safe-area-inset-bottom)); }
          .pp-ig-frame { width:100%; height:calc(100vh - 110px); height:calc(100dvh - 110px); border-radius:0; }
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
