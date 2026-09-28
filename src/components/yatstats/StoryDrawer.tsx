'use client';

// src/components/yatstats/StoryDrawer.tsx
// "Add a Story" drawer on the player profile page. The only way in is the
// Polaroid on the Career Path Timeline, which fires 'yat:story-drawer-open'
// with the year of the slide the fan is looking at. The drawer slides in
// from the right like the site's other drawers (body.drawer-story-open).
//
// Signed out: asks the fan to sign in, or join if they're new.
// Signed in: their name is already on it, the year comes from the slide;
// they pick the month, tell the story, add photos, tag players, and post.
// The story is live immediately, in the Stories tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerProfile } from '@/context/PlayerProfileContext';
import { auth } from '@/lib/firebase';

export const STORY_DRAWER_OPEN_EVENT = 'yat:story-drawer-open';
export const STORY_POSTED_EVENT = 'yat:story-posted';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PHOTOS = 4;
const MAX_EDGE = 2048;

type FanSession = {
  uid?: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  homeSchoolName?: string | null;
};

type TagCandidate = { playerId: string; displayName: string; schoolName?: string; city?: string; state?: string };

type PickedPhoto = { id: string; file: File; preview: string };

function openAccountDrawer(tab: 'signin' | 'register') {
  document.body.classList.remove('drawer-story-open');
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
}

// Shrinks a phone photo in the browser so a normal photo never hits the
// upload size limit. Keeps the original if the browser can't read it.
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob || file;
  } catch {
    return file;
  }
}

export default function StoryDrawer() {
  const profile = usePlayerProfile();
  const playerId = String(profile?.playerId || '').trim();
  const playerName = String(profile?.playerName || '').trim() || 'this player';
  const firstName = playerName.split(' ')[0] || 'this player';

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(0);
  const [story, setStory] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [tags, setTags] = useState<TagCandidate[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [tagResults, setTagResults] = useState<TagCandidate[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'posting' | 'error' | 'done'; text?: string; storyId?: string }>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Rendered straight into <body>: inside the profile page's containers a
  // position:fixed drawer is pinned to the page section, not the screen.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const signedIn = Boolean(session?.uid && session?.email);
  const fanName = [session?.firstName, session?.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ') || session?.email || '';

  const close = useCallback(() => {
    setOpen(false);
    document.body.classList.remove('drawer-story-open');
    if (!document.body.className.match(/drawer-(left|right|sort|account|favorites)-open/)) document.body.classList.remove('drawer-open');
  }, []);

  const resetForm = useCallback(() => {
    setMonth(0);
    setStory('');
    setPhotos((current) => {
      current.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    setTags([]);
    setTagQuery('');
    setTagResults([]);
    setStatus({ kind: 'idle' });
  }, []);

  // Open from the Polaroid, with the year of the slide the fan is on.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ year?: number | null }>).detail || {};
      const slideYear = Number(detail.year);
      const thisYear = new Date().getFullYear();
      setYear(Number.isInteger(slideYear) && slideYear > 1950 && slideYear <= thisYear + 1 ? slideYear : thisYear);
      if (status.kind === 'done') resetForm();
      setOpen(true);
      document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open');
      document.body.classList.add('drawer-story-open', 'drawer-open');
      setSessionLoading(true);
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setSession(data?.authenticated ? (data.session as FanSession) : null))
        .catch(() => setSession(null))
        .finally(() => setSessionLoading(false));
    };
    window.addEventListener(STORY_DRAWER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(STORY_DRAWER_OPEN_EVENT, onOpen);
  }, [resetForm, status.kind]);

  // Close on Escape or a tap on the dark mask.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onMask = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('.yat-drawer-mask')) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onMask);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onMask);
    };
  }, [open, close]);

  // Player search for tagging.
  useEffect(() => {
    const q = tagQuery.trim();
    if (q.length < 2) {
      setTagResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setTagResults(Array.isArray(data?.players) ? data.players : []))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tagQuery]);

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const list: number[] = [];
    for (let y = thisYear + 1; y >= 1960; y--) list.push(y);
    return list;
  }, []);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
      .slice(0, Math.max(0, room))
      .map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...picked]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const gone = current.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((p) => p.id !== id);
    });
  };

  const addTag = (candidate: TagCandidate) => {
    if (candidate.playerId === playerId) return;
    setTags((current) => (current.some((t) => t.playerId === candidate.playerId) ? current : [...current, candidate]));
    setTagQuery('');
    setTagResults([]);
  };

  const showInStories = (storyId?: string) => {
    close();
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (storyId) window.dispatchEvent(new CustomEvent('yat:story-focus', { detail: { id: storyId } }));
    document.getElementById('playerFunZone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async () => {
    if (!month) return setStatus({ kind: 'error', text: 'Choose the month.' });
    if (!story.trim()) return setStatus({ kind: 'error', text: 'Tell the story behind this photo.' });
    if (photos.length === 0) return setStatus({ kind: 'error', text: 'Add at least one photo.' });

    setStatus({ kind: 'posting', text: 'Posting your story…' });
    try {
      await auth.authStateReady?.();
      const user = auth.currentUser;
      if (!user) {
        setStatus({ kind: 'error', text: 'Please sign in again to post.' });
        return;
      }
      const idToken = await user.getIdToken();

      const form = new FormData();
      form.set('idToken', idToken);
      form.set('playerId', playerId);
      form.set('year', String(year));
      form.set('month', String(month));
      form.set('story', story.trim());
      form.set('tagged', JSON.stringify(tags.map((t) => t.playerId)));
      form.set('pageUrl', window.location.href);
      for (const photo of photos) {
        const blob = await shrinkPhoto(photo.file);
        form.append('photos', blob, photo.file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg');
      }

      const res = await fetch('/api/stories', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Your story could not be posted. Please try again.');

      setStatus({ kind: 'done', storyId: data?.id });
      window.dispatchEvent(new CustomEvent(STORY_POSTED_EVENT, { detail: { id: data?.id, playerIds: [playerId, ...tags.map((t) => t.playerId)] } }));
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Your story could not be posted.' });
    }
  };

  const posting = status.kind === 'posting';

  if (!portalReady) return null;

  return createPortal(
    <aside className="yat-drawer yat-drawer-right yat-story-drawer" id="drawerStory" aria-label="Add a story" aria-hidden={!open}>
      <div className="ysd-header">
        <div>
          <div className="ysd-kicker">Add a story</div>
          <h3 className="ysd-title">to {playerName}&apos;s Career Timeline</h3>
        </div>
        <button type="button" className="yat-icon-btn ysd-close" onClick={close} aria-label="Close">
          <i className="ri-close-line" />
        </button>
      </div>

      <div className="ysd-body">
        {sessionLoading ? (
          <p className="ysd-muted">Loading…</p>
        ) : !signedIn ? (
          <div className="ysd-gate">
            <p>Sign in to add a story to {firstName}&apos;s Career Timeline.</p>
            <p className="ysd-muted">Stories are posted from your YAT?STATS fan account. New here? Joining is free.</p>
            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={() => openAccountDrawer('signin')}>Sign in</button>
              <button type="button" className="ysd-btn" onClick={() => openAccountDrawer('register')}>Join free</button>
            </div>
          </div>
        ) : status.kind === 'done' ? (
          <div className="ysd-done">
            <p className="ysd-done-title">Your story is live.</p>
            <p className="ysd-muted">It&apos;s in {firstName}&apos;s Stories{tags.length ? ` and on ${tags.length === 1 ? tags[0].displayName + "'s" : 'the tagged players\''} too` : ''}.</p>
            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={() => showInStories(status.storyId)}>See it in Stories</button>
              <button type="button" className="ysd-btn" onClick={resetForm}>Add another</button>
            </div>
          </div>
        ) : (
          <>
            <div className="ysd-poster">
              Posting as <strong>{fanName}</strong>
              {session?.homeSchoolName ? <span> · {session.homeSchoolName}</span> : null}
            </div>

            <div className="ysd-field">
              <div className="ysd-label">When was this?</div>
              <div className="ysd-date">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
                  <option value={0}>Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="ysd-muted ysd-small">
                {month ? `Goes on ${firstName}'s timeline in ${MONTHS[month - 1]} ${year}. Is that right?` : `Pick the month. A best guess is fine.`}
              </div>
            </div>

            <div className="ysd-field">
              <label className="ysd-label" htmlFor="ysdStory">Tell the story</label>
              <textarea
                id="ysdStory"
                rows={7}
                value={story}
                maxLength={10000}
                onChange={(e) => setStory(e.target.value)}
                placeholder={`Where was this? What happened? Why does this moment with ${firstName} matter to you?`}
              />
            </div>

            <div className="ysd-field">
              <div className="ysd-label">Photos <span className="ysd-muted">({photos.length}/{MAX_PHOTOS})</span></div>
              <div className="ysd-photos">
                {photos.map((p) => (
                  <div className="ysd-photo" key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" />
                    <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove photo">×</button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button type="button" className="ysd-photo-add" onClick={() => fileInput.current?.click()}>
                    <i className="ri-image-add-line" aria-hidden="true" />
                    <span>Add photo</span>
                  </button>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            </div>

            <div className="ysd-field">
              <label className="ysd-label" htmlFor="ysdTag">Anyone else in the photo? Tag players</label>
              {tags.length > 0 && (
                <div className="ysd-tags">
                  {tags.map((t) => (
                    <span className="ysd-tag" key={t.playerId}>
                      {t.displayName}
                      <button type="button" onClick={() => setTags((c) => c.filter((x) => x.playerId !== t.playerId))} aria-label={`Remove ${t.displayName}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <input id="ysdTag" type="search" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Search players by name" autoComplete="off" />
              {tagResults.length > 0 && (
                <ul className="ysd-results">
                  {tagResults.filter((r) => r.playerId !== playerId).map((r) => (
                    <li key={r.playerId}>
                      <button type="button" onClick={() => addTag(r)}>
                        <strong>{r.displayName}</strong>
                        <span>{[r.schoolName, r.state].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {status.kind === 'error' && <div className="ysd-error">{status.text}</div>}

            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={submit} disabled={posting}>
                {posting ? 'Posting…' : 'Post story'}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        body.drawer-story-open #drawerStory { transform: translateX(0); }
        body.drawer-story-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }
        .yat-story-drawer { width: min(94vw, 440px); }
        .ysd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 16px 10px; border-bottom: 1px solid var(--line); }
        /* The YAT?STATS crest screened back behind the header, the same as
           the News reader drawer (ProfileContentDrawer): large at 15%
           opacity, bleeding off the right edge. */
        .ysd-header { position: relative; isolation: isolate; overflow: hidden; }
        .ysd-header::before { content: ""; position: absolute; z-index: -1; top: 50%; right: -14%; width: 62%; aspect-ratio: 1637/1281; transform: translateY(-50%); background: url("/img/ys-crest.png") center/contain no-repeat; opacity: .15; pointer-events: none; }
        body.light-theme .ysd-header::before { filter: invert(1); opacity: .09; }
        .ysd-kicker { color: #d2b45c; font: 700 12px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
        .ysd-title { margin: 6px 0 0 !important; padding: 0 !important; font: 700 20px/1.05 "Bebas Neue", Oswald, sans-serif !important; letter-spacing: .04em; }
        .ysd-close { position: static !important; flex: none; }
        .ysd-body { display: flex; flex-direction: column; gap: 16px; padding: 14px 16px 28px; }
        .ysd-muted { opacity: .65; }
        .ysd-small { font-size: 12px; margin-top: 6px; }
        .ysd-poster { font-size: 13px; }
        .ysd-poster strong { font-weight: 700; }
        .ysd-field { display: flex; flex-direction: column; gap: 6px; }
        .ysd-label { font: 700 11px/1.2 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        .ysd-date { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; }
        .yat-story-drawer select, .yat-story-drawer textarea, .yat-story-drawer input[type="search"] {
          width: 100%; border: 1px solid var(--line); border-radius: 6px; background: rgba(127,127,127,.08);
          color: var(--ink); padding: 10px; font: 400 15px/1.45 system-ui, sans-serif;
        }
        .yat-story-drawer textarea { resize: vertical; min-height: 140px; }
        .ysd-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .ysd-photo, .ysd-photo-add { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); }
        .ysd-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ysd-photo button { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: rgba(0,0,0,.7); color: #fff; font-size: 15px; line-height: 1; cursor: pointer; }
        .ysd-photo-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; color: inherit; cursor: pointer; font: 700 10px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .ysd-photo-add i { font-size: 22px; }
        .ysd-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .ysd-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border-radius: 999px; background: rgba(210,180,92,.18); border: 1px solid rgba(210,180,92,.6); font-size: 13px; }
        .ysd-tag button { border: 0; background: none; color: inherit; font-size: 15px; cursor: pointer; }
        .ysd-results { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        .ysd-results button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: inherit; text-align: left; cursor: pointer; }
        .ysd-results li:last-child button { border-bottom: 0; }
        .ysd-results span { font-size: 12px; opacity: .65; }
        .ysd-error { color: #ff6b6b; font-size: 13px; }
        .ysd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ysd-btn { min-height: 42px; padding: 0 18px; border-radius: 6px; border: 1px solid rgba(210,180,92,.85); background: transparent; color: #d2b45c; font: 700 13px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
        .ysd-btn-primary { background: #d2b45c; color: #111; }
        .ysd-btn:disabled { opacity: .6; cursor: wait; }
        .ysd-gate p, .ysd-done p { margin: 0 0 8px; line-height: 1.45; }
        .ysd-done-title { font: 700 22px/1.1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; }
      `}</style>
    </aside>,
    document.body
  );
}
