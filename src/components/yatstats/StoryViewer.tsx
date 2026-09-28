'use client';

// src/components/yatstats/StoryViewer.tsx
// One story opened large, laid out like a Facebook post: who posted it and
// who's in it, the story, like / comment counts, a Like · Comment · Share
// bar, the comments, and "Comment as ..." at the bottom. The fan who posted
// it gets a ⋯ menu to edit or delete it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { toPlayerSlug } from '@/lib/slug';

export type StoryPhoto = { web: string | null; thumb: string | null; full: string | null; width: number | null; height: number | null };
export type StoryPlayer = { playerId: string; hsid: string | null; name: string; isPrimary: boolean };
export type Story = {
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
  likedByMe?: boolean;
  isMine?: boolean;
};

type StoryComment = { id: string; text: string; author: string; createdAt: string; isMine: boolean; canDelete: boolean };
type Me = { firstName: string; lastName: string } | null;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function storyWhen(story: Pick<Story, 'date' | 'year'>, short = false) {
  const m = story.date ? Number(story.date.slice(5, 7)) : 0;
  const month = m ? (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]) : '';
  return [month, story.year || ''].filter(Boolean).join(' ');
}

export function playerHref(player: StoryPlayer) {
  const [first, ...rest] = player.name.split(' ');
  return `/${encodeURIComponent(player.hsid || '')}/player/${encodeURIComponent(player.playerId)}/${toPlayerSlug(first || '', rest.join(' '))}`;
}

// "2h", "3d", "1w" - like Facebook's comment times.
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 31536000) return `${Math.floor(s / 604800)}w`;
  return `${Math.floor(s / 31536000)}y`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function openSignIn() {
  document.body.classList.remove('drawer-story-open');
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: 'signin' }));
}

// A Firebase ID token when this site has a Firebase user; the server falls
// back to the signed pass from sign-in otherwise (lib/fanIdentity.ts).
async function authHeaders(): Promise<Record<string, string>> {
  try {
    await auth.authStateReady?.();
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    return token ? { 'x-firebase-token': token } : {};
  } catch {
    return {};
  }
}

export function shareUrlFor(storyId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('story', storyId);
  url.hash = 'ppTab-upload';
  return url.toString();
}

export default function StoryViewer({
  story,
  playerId,
  onClose,
  onChange,
  onDeleted,
}: {
  story: Story;
  playerId: string;
  onClose: () => void;
  onChange: (story: Story) => void;
  onDeleted: (id: string) => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [comments, setComments] = useState<StoryComment[] | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'' | 'like' | 'comment' | 'save' | 'delete'>('');
  const [note, setNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ text: string; month: number; year: number } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const others = story.players.filter((p) => p.playerId !== playerId);
  const photo = story.photos[photoIndex];

  // Comments and who's viewing, each time a story opens.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stories/${story.id}/comments`, { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { comments: [] }))
      .then((data) => { if (!cancelled) setComments(Array.isArray(data?.comments) ? data.comments : []); })
      .catch(() => { if (!cancelled) setComments([]); });
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const s = data?.authenticated ? data.session : null;
        setMe(s ? { firstName: String(s.firstName || ''), lastName: String(s.lastName || '') } : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [story.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('textarea, input, select')) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setPhotoIndex((i) => Math.min(i + 1, story.photos.length - 1));
      if (event.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, story.photos.length]);

  const flash = useCallback((text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2600);
  }, []);

  const call = async (url: string, init: RequestInit = {}) => {
    const headers = { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) };
    const res = await fetch(url, { ...init, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const toggleLike = async () => {
    if (!me) return openSignIn();
    if (busy) return;
    const was = Boolean(story.likedByMe);
    setBusy('like');
    onChange({ ...story, likedByMe: !was, likeCount: Math.max(0, story.likeCount + (was ? -1 : 1)) });
    try {
      const { res, data } = await call(`/api/stories/${story.id}/like`, { method: 'POST' });
      if (res.status === 401) { onChange({ ...story }); return openSignIn(); }
      if (!res.ok) throw new Error(data?.error);
      onChange({ ...story, likedByMe: Boolean(data.liked), likeCount: Number(data.likeCount) || 0 });
    } catch {
      onChange({ ...story });
      flash('That like didn’t go through.');
    } finally {
      setBusy('');
    }
  };

  const postComment = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!me) return openSignIn();
    setBusy('comment');
    try {
      const { res, data } = await call(`/api/stories/${story.id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
      if (res.status === 401) return openSignIn();
      if (!res.ok) throw new Error(data?.error || 'Your comment could not be posted.');
      setComments((list) => [...(list || []), data.comment]);
      setDraft('');
      onChange({ ...story, commentCount: story.commentCount + 1 });
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Your comment could not be posted.');
    } finally {
      setBusy('');
    }
  };

  const removeComment = async (comment: StoryComment) => {
    if (!window.confirm('Delete this comment?')) return;
    const { res, data } = await call(`/api/stories/${story.id}/comments/${comment.id}`, { method: 'DELETE' });
    if (!res.ok) return flash(data?.error || 'The comment could not be removed.');
    setComments((list) => (list || []).filter((c) => c.id !== comment.id));
    onChange({ ...story, commentCount: Math.max(0, story.commentCount - 1) });
  };

  const share = async () => {
    const url = shareUrlFor(story.id);
    const title = `${story.author}'s story${story.year ? ` · ${storyWhen(story)}` : ''}`;
    let method = 'link';
    try {
      if (navigator.share) {
        await navigator.share({ title, text: story.story.slice(0, 140), url });
        method = 'native';
      } else {
        await navigator.clipboard.writeText(url);
        flash('Link copied. Paste it anywhere to share.');
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        flash('Link copied. Paste it anywhere to share.');
      } catch {
        window.prompt('Copy this link to share the story:', url);
      }
    }
    call(`/api/stories/${story.id}/share`, { method: 'POST', body: JSON.stringify({ method }) }).catch(() => {});
  };

  const startEdit = () => {
    setMenuOpen(false);
    const m = story.date ? Number(story.date.slice(5, 7)) : 1;
    setEditing({ text: story.story, month: m || 1, year: story.year || new Date().getFullYear() });
  };

  const saveEdit = async () => {
    if (!editing || busy) return;
    setBusy('save');
    try {
      const { res, data } = await call(`/api/stories/${story.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ story: editing.text, month: editing.month, year: editing.year }),
      });
      if (res.status === 401) return openSignIn();
      if (!res.ok) throw new Error(data?.error || 'Your changes could not be saved.');
      onChange({ ...story, story: data.story, date: data.date, year: data.year });
      setEditing(null);
      window.dispatchEvent(new CustomEvent('yat:story-posted', { detail: { id: story.id } }));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Your changes could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this story? It will be removed from every timeline and Stories tab it’s on.')) return;
    setBusy('delete');
    try {
      const { res, data } = await call(`/api/stories/${story.id}`, { method: 'DELETE' });
      if (res.status === 401) return openSignIn();
      if (!res.ok) throw new Error(data?.error || 'The story could not be deleted.');
      onDeleted(story.id);
      window.dispatchEvent(new CustomEvent('yat:story-posted', { detail: { id: story.id } }));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'The story could not be deleted.');
    } finally {
      setBusy('');
    }
  };

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= 1960; y--) years.push(y);
  const myName = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : '';

  return createPortal(
    <div className="ysv" role="dialog" aria-modal="true" aria-label="Story" onClick={onClose}>
      <div className="ysv-card" onClick={(e) => { e.stopPropagation(); if (menuOpen) setMenuOpen(false); }}>
        <button type="button" className="ysv-close" onClick={onClose} aria-label="Close"><i className="ri-close-line" /></button>

        <div className="ysv-photo">
          {photo?.full ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.full} alt="" />
          ) : null}
          {story.photos.length > 1 && (
            <>
              <button type="button" className="ysv-nav ysv-nav-prev" disabled={photoIndex === 0} onClick={() => setPhotoIndex((i) => i - 1)} aria-label="Previous photo">‹</button>
              <button type="button" className="ysv-nav ysv-nav-next" disabled={photoIndex === story.photos.length - 1} onClick={() => setPhotoIndex((i) => i + 1)} aria-label="Next photo">›</button>
              <span className="ysv-count">{photoIndex + 1}/{story.photos.length}</span>
            </>
          )}
        </div>

        <div className="ysv-side">
          <div className="ysv-scroll">
            {/* Who posted it, who's in it, when. */}
            <div className="ysv-head">
              <span className="ysv-avatar" aria-hidden="true">{initials(story.author)}</span>
              <div className="ysv-who">
                <div className="ysv-byline">
                  <strong>{story.author}</strong>
                  {others.length > 0 && (
                    <>
                      {' '}is with{' '}
                      {others.map((p, i) => (
                        <span key={p.playerId}>
                          {i > 0 ? (i === others.length - 1 ? ' and ' : ', ') : ''}
                          <a href={playerHref(p)}><strong>{p.name || 'Player'}</strong></a>
                        </span>
                      ))}
                    </>
                  )}
                  .
                </div>
                <div className="ysv-when">{storyWhen(story)}</div>
              </div>
              {story.isMine && (
                <div className="ysv-menu-wrap">
                  <button type="button" className="ysv-menu-btn" aria-label="Story options" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
                    <i className="ri-more-fill" />
                  </button>
                  {menuOpen && (
                    <div className="ysv-menu" role="menu">
                      <button type="button" role="menuitem" onClick={startEdit}><i className="ri-pencil-line" /> Edit story</button>
                      <button type="button" role="menuitem" className="ysv-danger" onClick={remove}><i className="ri-delete-bin-line" /> Delete story</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {editing ? (
              <div className="ysv-edit">
                <div className="ysv-edit-date">
                  <select value={editing.month} onChange={(e) => setEditing({ ...editing, month: Number(e.target.value) })} aria-label="Month">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={editing.year} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} aria-label="Year">
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={6} />
                <div className="ysv-edit-actions">
                  <button type="button" className="ysv-btn" onClick={() => setEditing(null)} disabled={busy === 'save'}>Cancel</button>
                  <button type="button" className="ysv-btn ysv-btn-primary" onClick={saveEdit} disabled={busy === 'save' || !editing.text.trim()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <p className="ysv-story">{story.story}</p>
            )}

            {/* Counts, then Like · Comment · Share. */}
            {(story.likeCount > 0 || story.commentCount > 0) && (
              <div className="ysv-counts">
                <span>{story.likeCount > 0 ? <><i className="ri-thumb-up-fill ysv-like-dot" /> {story.likeCount}</> : null}</span>
                <span>{story.commentCount > 0 ? `${story.commentCount} comment${story.commentCount === 1 ? '' : 's'}` : ''}</span>
              </div>
            )}
            <div className="ysv-actions">
              <button type="button" className={story.likedByMe ? 'ysv-liked' : ''} onClick={toggleLike} aria-pressed={Boolean(story.likedByMe)}>
                <i className={story.likedByMe ? 'ri-thumb-up-fill' : 'ri-thumb-up-line'} /> Like
              </button>
              <button type="button" onClick={() => (me ? composerRef.current?.focus() : openSignIn())}>
                <i className="ri-chat-3-line" /> Comment
              </button>
              <button type="button" onClick={share}>
                <i className="ri-share-forward-line" /> Share
              </button>
            </div>

            <div className="ysv-comments">
              {comments === null ? (
                <div className="ysv-muted">Loading comments…</div>
              ) : comments.length === 0 ? (
                <div className="ysv-muted">No comments yet. Be the first.</div>
              ) : (
                comments.map((c) => (
                  <div className="ysv-comment" key={c.id}>
                    <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(c.author)}</span>
                    <div className="ysv-comment-main">
                      <div className="ysv-bubble">
                        <strong>{c.author}</strong>
                        <span>{c.text}</span>
                      </div>
                      <div className="ysv-comment-meta">
                        <span>{ago(c.createdAt)}</span>
                        {c.canDelete && <button type="button" onClick={() => removeComment(c)}>Delete</button>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {note && <div className="ysv-note" role="status">{note}</div>}

          {/* Comment as ... (signed-in fans); a sign-in prompt otherwise. */}
          <div className="ysv-composer">
            {me ? (
              <>
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  placeholder={`Comment as ${myName || 'you'}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                />
                <button type="button" onClick={postComment} disabled={!draft.trim() || busy === 'comment'} aria-label="Post comment">
                  <i className="ri-send-plane-2-fill" />
                </button>
              </>
            ) : (
              <button type="button" className="ysv-signin" onClick={openSignIn}>Sign in to like and comment</button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .ysv { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.82); }
        .ysv-card { position: relative; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr); width: min(1100px, 100%); height: min(760px, calc(100dvh - 32px)); background: #0d0d0d; color: #f4f4f4; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; overflow: hidden; }
        .ysv-close { position: absolute; top: 8px; right: 8px; z-index: 3; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 20px; cursor: pointer; }
        .ysv-photo { position: relative; display: flex; align-items: center; justify-content: center; background: #000; min-height: 0; }
        .ysv-photo img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .ysv-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
        .ysv-nav:disabled { opacity: .25; cursor: default; }
        .ysv-nav-prev { left: 8px; }
        .ysv-nav-next { right: 8px; }
        .ysv-count { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.6); font: 700 11px/1.4 Oswald, sans-serif; }
        .ysv-side { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid rgba(255,255,255,.08); }
        .ysv-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 16px 8px; }
        .ysv-head { display: flex; align-items: flex-start; gap: 10px; padding-right: 36px; }
        .ysv-avatar { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #FFD700; color: #000; font: 400 17px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; }
        .ysv-avatar-sm { width: 32px; height: 32px; font-size: 14px; background: rgba(255,255,255,.14); color: #fff; }
        .ysv-who { flex: 1; min-width: 0; }
        .ysv-byline { font: 400 15px/1.3 system-ui, sans-serif; color: rgba(255,255,255,.85); }
        .ysv-byline strong { color: #fff; font-weight: 700; }
        .ysv-byline a { color: inherit; text-decoration: none; }
        .ysv-byline a:hover { text-decoration: underline; }
        .ysv-when { margin-top: 2px; color: #FFD700; font: 700 10px/1.2 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .ysv-menu-wrap { position: relative; }
        .ysv-menu-btn { width: 34px; height: 34px; border-radius: 50%; border: 0; background: transparent; color: rgba(255,255,255,.8); font-size: 20px; cursor: pointer; }
        .ysv-menu-btn:hover { background: rgba(255,255,255,.08); }
        .ysv-menu { position: absolute; right: 0; top: 38px; z-index: 4; min-width: 170px; padding: 6px; border-radius: 10px; background: #1b1b1b; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 10px 30px rgba(0,0,0,.5); }
        .ysv-menu button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-radius: 6px; background: transparent; color: #fff; font: 400 14px/1 system-ui, sans-serif; text-align: left; cursor: pointer; }
        .ysv-menu button:hover { background: rgba(255,255,255,.08); }
        .ysv-menu .ysv-danger { color: #ff7b7b; }
        .ysv-story { margin: 14px 0 12px; font: 400 16px/1.6 var(--yat-news-font, Georgia, serif); white-space: pre-line; }
        .ysv-edit { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 12px; }
        .ysv-edit-date { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; }
        .ysv-edit select, .ysv-edit textarea, .ysv-composer textarea { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(255,255,255,.06); color: #fff; padding: 9px 12px; font: 400 14px/1.45 system-ui, sans-serif; }
        .ysv-edit textarea { resize: vertical; min-height: 120px; }
        .ysv-edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .ysv-btn { min-height: 36px; padding: 0 16px; border-radius: 8px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 400 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; cursor: pointer; }
        .ysv-btn-primary { background: #FFD700; color: #000; }
        .ysv-btn:disabled { opacity: .55; cursor: default; }
        .ysv-counts { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; color: rgba(255,255,255,.65); font: 400 13px/1 system-ui, sans-serif; }
        .ysv-like-dot { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: #FFD700; color: #000; font-size: 11px; vertical-align: -3px; }
        .ysv-actions { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(255,255,255,.1); border-bottom: 1px solid rgba(255,255,255,.1); }
        .ysv-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; border: 0; background: transparent; color: rgba(255,255,255,.75); font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .06em; cursor: pointer; border-radius: 6px; }
        .ysv-actions button i { font-size: 18px; }
        .ysv-actions button:hover { background: rgba(255,255,255,.06); }
        .ysv-actions .ysv-liked { color: #FFD700; }
        .ysv-comments { display: flex; flex-direction: column; gap: 12px; padding: 12px 0 4px; }
        .ysv-muted { color: rgba(255,255,255,.5); font: 400 13px/1.4 system-ui, sans-serif; }
        .ysv-comment { display: flex; gap: 8px; }
        .ysv-comment-main { min-width: 0; }
        .ysv-bubble { display: inline-flex; flex-direction: column; gap: 2px; max-width: 100%; padding: 8px 12px; border-radius: 16px; background: rgba(255,255,255,.08); font: 400 14px/1.35 system-ui, sans-serif; overflow-wrap: anywhere; white-space: pre-line; }
        .ysv-bubble strong { font-size: 13px; }
        .ysv-comment-meta { display: flex; gap: 12px; padding: 3px 12px 0; color: rgba(255,255,255,.5); font: 700 12px/1 system-ui, sans-serif; }
        .ysv-comment-meta button { border: 0; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer; }
        .ysv-comment-meta button:hover { color: #ff7b7b; }
        .ysv-note { margin: 0 16px 6px; padding: 8px 12px; border-radius: 8px; background: rgba(255,215,0,.14); color: #FFD700; font: 400 13px/1.3 system-ui, sans-serif; }
        .ysv-composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid rgba(255,255,255,.1); }
        .ysv-composer textarea { flex: 1; resize: none; max-height: 120px; border-radius: 20px; padding: 10px 14px; }
        .ysv-composer > button:not(.ysv-signin) { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: #FFD700; color: #000; font-size: 18px; cursor: pointer; }
        .ysv-composer > button:disabled { opacity: .4; cursor: default; }
        .ysv-signin { flex: 1; min-height: 42px; border-radius: 20px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; cursor: pointer; }
        @media (max-width: 760px) {
          .ysv { padding: 0; align-items: stretch; }
          .ysv-card { grid-template-columns: 1fr; grid-template-rows: minmax(0, 42dvh) minmax(0, 1fr); width: 100%; height: 100dvh; border-radius: 0; border: 0; }
          .ysv-side { border-left: 0; border-top: 1px solid rgba(255,255,255,.08); }
        }
      `}</style>
    </div>,
    document.body
  );
}
