'use client';

// src/components/yatstats/StoriesFeed.tsx
// The Stories tab on the player profile page: every live story this player
// is in (posted on his page or tagged), newest first, as small posts like
// the news cards. Tapping one opens it large. Uploading happens only from
// the Polaroid on the Career Path Timeline (StoryDrawer), never here.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPlayerSlug } from '@/lib/slug';
import { STORY_POSTED_EVENT } from '@/components/yatstats/StoryDrawer';

type StoryPhoto = { web: string | null; thumb: string | null; full: string | null; width: number | null; height: number | null };
type StoryPlayer = { playerId: string; hsid: string | null; name: string; isPrimary: boolean };
type Story = {
  id: string;
  story: string;
  author: string;
  date: string | null;
  year: number | null;
  postedAt: string;
  photos: StoryPhoto[];
  players: StoryPlayer[];
  likeCount: number;
  commentCount: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function whenLabel(story: Story) {
  const m = story.date ? Number(story.date.slice(5, 7)) : 0;
  return [m ? MONTHS[m - 1] : '', story.year || ''].filter(Boolean).join(' ');
}

function profileHref(player: StoryPlayer) {
  const [first, ...rest] = player.name.split(' ');
  return `/${encodeURIComponent(player.hsid || '')}/player/${encodeURIComponent(player.playerId)}/${toPlayerSlug(first || '', rest.join(' '))}`;
}

export default function StoriesFeed({ playerId, playerName }: { playerId: string; playerName: string }) {
  const firstName = (playerName || '').split(' ')[0] || 'this player';
  const [stories, setStories] = useState<Story[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openStory, setOpenStory] = useState<Story | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  // A story someone asked to see (just posted, or a timeline thumbnail);
  // shown as soon as its card is on the page.
  const pendingFocus = useRef<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/stories?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        setStories(Array.isArray(data?.stories) ? data.stories : []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const tryFocus = useCallback(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const card = document.getElementById(`story-${id}`);
    if (!card) return;
    pendingFocus.current = null;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ysf-card-focus');
    window.setTimeout(() => card.classList.remove('ysf-card-focus'), 2400);
  }, []);

  // A story was just posted (reload), or something asked to show one.
  useEffect(() => {
    const onPosted = () => load();
    const onFocus = (event: Event) => {
      pendingFocus.current = String((event as CustomEvent<{ id?: string }>).detail?.id || '') || null;
      tryFocus();
    };
    window.addEventListener(STORY_POSTED_EVENT, onPosted);
    window.addEventListener('yat:story-focus', onFocus);
    return () => {
      window.removeEventListener(STORY_POSTED_EVENT, onPosted);
      window.removeEventListener('yat:story-focus', onFocus);
    };
  }, [load, tryFocus]);

  useEffect(() => {
    tryFocus();
  }, [stories, tryFocus]);

  useEffect(() => {
    if (!openStory) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenStory(null);
      if (event.key === 'ArrowRight') setPhotoIndex((i) => Math.min(i + 1, openStory.photos.length - 1));
      if (event.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openStory]);

  const show = (story: Story) => {
    setPhotoIndex(0);
    setOpenStory(story);
  };

  let body: React.ReactNode;
  if (failed) {
    body = <div className="ysf-empty">Stories couldn&apos;t load right now. Please try again later.</div>;
  } else if (stories === null) {
    body = <div className="ysf-empty">Loading stories…</div>;
  } else if (stories.length === 0) {
    body = (
      <div className="ysf-empty">
        <strong>No stories yet.</strong>
        <span>Tap the Polaroid on {firstName}&apos;s Career Timeline above to add the first one.</span>
      </div>
    );
  } else {
    body = (
      <div className="ysf-grid">
        {stories.map((s) => {
          const cover = s.photos[0];
          return (
            <button type="button" className="ysf-card" id={`story-${s.id}`} key={s.id} onClick={() => show(s)}>
              <span className="ysf-card-photo">
                {cover?.web ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.web} alt="" loading="lazy" decoding="async" />
                ) : null}
                {s.photos.length > 1 ? <span className="ysf-card-count">1/{s.photos.length}</span> : null}
              </span>
              <span className="ysf-card-body">
                <span className="ysf-card-when">{whenLabel(s)}</span>
                <span className="ysf-card-text">{s.story}</span>
                <span className="ysf-card-by">— {s.author}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const photo = openStory?.photos[photoIndex];
  const others = openStory?.players.filter((p) => p.playerId !== playerId) || [];

  return (
    <div className="ysf">
      {body}

      {/* Rendered into <body> so it covers the screen, not just the tab. */}
      {openStory && typeof document !== 'undefined' && createPortal(
        <div className="ysf-modal" role="dialog" aria-modal="true" aria-label="Story" onClick={() => setOpenStory(null)}>
          <div className="ysf-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ysf-modal-close" onClick={() => setOpenStory(null)} aria-label="Close">
              <i className="ri-close-line" />
            </button>
            <div className="ysf-modal-photo">
              {photo?.full ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.full} alt="" />
              ) : null}
              {openStory.photos.length > 1 && (
                <>
                  <button type="button" className="ysf-nav ysf-nav-prev" disabled={photoIndex === 0} onClick={() => setPhotoIndex((i) => i - 1)} aria-label="Previous photo">‹</button>
                  <button type="button" className="ysf-nav ysf-nav-next" disabled={photoIndex === openStory.photos.length - 1} onClick={() => setPhotoIndex((i) => i + 1)} aria-label="Next photo">›</button>
                  <span className="ysf-modal-count">{photoIndex + 1}/{openStory.photos.length}</span>
                </>
              )}
            </div>
            <div className="ysf-modal-text">
              <div className="ysf-card-when">{whenLabel(openStory)}</div>
              <p>{openStory.story}</p>
              <div className="ysf-card-by">— {openStory.author}</div>
              {others.length > 0 && (
                <div className="ysf-modal-tags">
                  Also in this story:{' '}
                  {others.map((p, i) => (
                    <span key={p.playerId}>
                      {i > 0 ? ', ' : ''}
                      <a href={profileHref(p)}>{p.name || 'Player'}</a>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        .ysf { padding: 6px 4px 20px; }
        .ysf-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 16px; text-align: center; color: rgba(255,255,255,.7); font: 400 14px/1.45 system-ui, sans-serif; }
        .ysf-empty strong { color: #fff; font: 700 18px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .ysf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
        .ysf-card { display: flex; flex-direction: column; padding: 0; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; overflow: hidden; background: #111; color: #f4f4f4; text-align: left; cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
        .ysf-card:hover { transform: translateY(-2px); border-color: rgba(210,180,92,.7); }
        .ysf-card-focus { border-color: #d2b45c; box-shadow: 0 0 0 2px #d2b45c; }
        .ysf-card-photo { position: relative; display: block; aspect-ratio: 1; background: #1a1a1a; }
        .ysf-card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ysf-card-count { position: absolute; right: 6px; bottom: 6px; padding: 2px 6px; border-radius: 999px; background: rgba(0,0,0,.7); font: 700 10px/1.3 Oswald, sans-serif; }
        .ysf-card-body { display: flex; flex-direction: column; gap: 5px; padding: 10px 10px 12px; }
        .ysf-card-when { color: #d2b45c; font: 700 11px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        .ysf-card-text { font: 400 13px/1.4 var(--yat-news-font, Georgia, serif); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
        .ysf-card-by { font: 400 12px/1.3 system-ui, sans-serif; opacity: .7; }
        .ysf-modal { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.82); }
        .ysf-modal-card { position: relative; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); width: min(1100px, 100%); max-height: calc(100dvh - 32px); background: #0d0d0d; color: #f4f4f4; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; overflow: hidden; }
        .ysf-modal-close { position: absolute; top: 8px; right: 8px; z-index: 2; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 20px; cursor: pointer; }
        .ysf-modal-photo { position: relative; display: flex; align-items: center; justify-content: center; background: #000; min-height: 280px; }
        .ysf-modal-photo img { max-width: 100%; max-height: calc(100dvh - 32px); object-fit: contain; display: block; }
        .ysf-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
        .ysf-nav:disabled { opacity: .25; cursor: default; }
        .ysf-nav-prev { left: 8px; }
        .ysf-nav-next { right: 8px; }
        .ysf-modal-count { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.6); font: 700 11px/1.4 Oswald, sans-serif; }
        .ysf-modal-text { display: flex; flex-direction: column; gap: 10px; padding: 22px 20px; overflow-y: auto; }
        .ysf-modal-text p { margin: 0; font: 400 16px/1.6 var(--yat-news-font, Georgia, serif); white-space: pre-line; }
        .ysf-modal-tags { font-size: 13px; opacity: .85; }
        .ysf-modal-tags a { color: #d2b45c; }
        @media (max-width: 760px) {
          .ysf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .ysf-modal { padding: 0; align-items: stretch; }
          .ysf-modal-card { grid-template-columns: 1fr; grid-template-rows: auto 1fr; max-height: 100dvh; border-radius: 0; }
          .ysf-modal-photo img { max-height: 55dvh; }
        }
      `}</style>
    </div>
  );
}
