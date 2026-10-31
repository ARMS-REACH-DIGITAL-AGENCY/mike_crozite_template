'use client';

import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { openSignIn, useFanMe } from './StoryViewer';

type Comment = { id: string; text: string; when: string; author: string };
type Reactions = { likes: number; liked: boolean; comments: Comment[] };
const EMPTY: Reactions = { likes: 0, liked: false, comments: [] };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'Y';
}

async function sessionHeaders(): Promise<Record<string, string>> {
  await auth.authStateReady?.();
  const token = await auth.currentUser?.getIdToken().catch(() => '');
  return token ? { 'x-firebase-token': token } : {};
}

// Uses the exact compact Stories card action bar (ysf-card-actions), icons
// and StoryViewer comment-bubble/composer classes. The retired-questionnaire
// API remains independent: each answer keeps its own likes and comments.
export default function WhereYatReactions({ id, storyKey = 'legacy' }: { id: number; storyKey?: string }) {
  const me = useFanMe();
  const [data, setData] = useState<Reactions>(EMPTY);
  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const myName = [me?.firstName, me?.lastName].filter(Boolean).join(' ');
  const load = async () => {
    try {
      const headers = await sessionHeaders();
      const url = '/api/contribute/where-yat-now/social?id=' + encodeURIComponent(String(id)) +
        '&storyKey=' + encodeURIComponent(storyKey);
      const response = await fetch(url, { headers, credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Reactions are unavailable.');
      const result = await response.json() as Reactions;
      setData({
        likes: Number(result.likes) || 0,
        liked: Boolean(result.liked),
        comments: Array.isArray(result.comments) ? result.comments : [],
      });
    } catch {
      setError('Unable to load reactions.');
    }
  };
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('yat-auth-success', refresh);
    window.addEventListener('yat-sign-out', refresh);
    return () => {
      window.removeEventListener('yat-auth-success', refresh);
      window.removeEventListener('yat-sign-out', refresh);
    };
    // Reload whenever the published answer or signed-in fan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, storyKey]);

  const act = async (action: 'like' | 'comment') => {
    if (busy) return;
    const headers = await sessionHeaders();
    if (!me && !Object.keys(headers).length) { openSignIn(); return; }
    if (action === 'comment' && !draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/contribute/where-yat-now/social', {
        method: 'POST', credentials: 'include',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, text: draft.trim(), storyKey }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { openSignIn(); return; }
      if (!response.ok) throw new Error(result.error || 'Unable to save your reaction.');
      if (action === 'comment') { setDraft(''); setComposerOpen(false); }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your reaction.');
    } finally {
      setBusy(false);
    }
  };

  const comment = () => {
    if (!me && !auth.currentUser) { openSignIn(); return; }
    setComposerOpen(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const share = async () => {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('whereYatStory',storyKey);
    url.hash = 'ppTab-schedule';
    if (navigator.share) {
      try { await navigator.share({ title: '#YATABOY — A life after baseball memory', url: url.toString() }); return; }
      catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setError('Link copied. Paste it anywhere to share.');
    } catch { setError('Unable to copy link.'); }
  };

  return (
    <section className="wyn-reactions" aria-label="Like, comment and share this alumni story">
      <div className="ysf-card-actions">
        <button type="button" className={data.liked ? 'ysf-liked' : ''} aria-pressed={data.liked}
          disabled={busy} onClick={() => void act('like')}>
          <i className={data.liked ? 'ri-thumb-up-fill' : 'ri-thumb-up-line'} aria-hidden="true" />
          Like{data.likes > 0 ? ` · ${data.likes}` : ''}
        </button>
        <button type="button" onClick={comment}>
          <i className="ri-chat-3-line" aria-hidden="true" />
          Comment{data.comments.length > 0 ? ` · ${data.comments.length}` : ''}
        </button>
        <button type="button" onClick={() => void share()}>
          <i className="ri-share-forward-line" aria-hidden="true" /> Share
        </button>
      </div>

      {data.comments.length > 0 && (
        <div className="ysv-comments">
          {data.comments.map(c => (
            <div className="ysv-comment" key={c.id}>
              <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(c.author)}</span>
              <div className="ysv-comment-main">
                <div className="ysv-bubble"><strong>{c.author}</strong><span>{c.text}</span></div>
                <div className="ysv-comment-meta">
                  <span>{new Date(c.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {composerOpen && (
        <div className="ysv-composer">
          <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(myName || 'YAT')}</span>
          <div className="ysv-compose-box">
            <textarea
              ref={composerRef} value={draft} rows={2} maxLength={2000}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void act('comment'); } }}
              placeholder={`Were you there? Add a comment as ${myName || 'you'}`}
              aria-label="Write a comment"
            />
          </div>
          <button type="button" onClick={() => void act('comment')} disabled={busy || !draft.trim()}
            aria-label="Post comment" title="Post comment">
            <i className={busy ? 'ri-loader-4-line ysv-spin' : 'ri-send-plane-2-fill'} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && <div className="ysv-note" role="status">{error}</div>}
    </section>
  );
}
