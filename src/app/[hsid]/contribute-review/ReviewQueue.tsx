'use client';

// The Connect & Contribute review queue (reviewers only): fans' photos
// waiting for approval, and the latest corrections, tips and missing-player
// reports. Approving a photo puts it on the site.

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { PHOTO_TYPES } from '@/lib/contribute';

type Photo = {
  id: string; playerid: string; hsid: string; purpose: string; url: string | null; date_taken: string | null;
  uploaded_at: string; player_name: string | null; school_name: string | null;
  details: { note?: string | null; classYear?: string | null; playerName?: string | null; by?: { name?: string; email?: string | null } };
};
type Tip = { id: string; submitted_at: string; intake_source: string; sender_name: string | null; raw_player_name: string | null; article_url: string; notes: string | null; status: string };
type Missing = { id: string; created_at: string; player_name: string; grad_year: number | null; school_name: string | null; notes: string | null };

async function authHeaders(): Promise<Record<string, string>> {
  await auth.authStateReady?.();
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  return token ? { 'x-firebase-token': token } : {};
}

const when = (v: string) => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ReviewQueue() {
  const [data, setData] = useState<{ photos: Photo[]; tips: Tip[]; missing: Missing[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/api/contribute/review', { credentials: 'include', cache: 'no-store', headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok) setError(body?.error || 'Could not load the queue.');
      else setData(body);
    })();
    return () => { live = false; };
  }, []);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy((b) => ({ ...b, [id]: action === 'approve' ? 'Approving…' : 'Rejecting…' }));
    const res = await fetch('/api/contribute/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id, action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy((b) => ({ ...b, [id]: body?.error || 'That did not work.' }));
      return;
    }
    setData((d) => (d ? { ...d, photos: d.photos.filter((p) => p.id !== id) } : d));
  };

  if (error) return <div className="ycr"><p className="ycr-error">{error}</p><Style /></div>;
  if (!data) return <div className="ycr"><p>Loading…</p><Style /></div>;

  return (
    <div className="ycr">
      <h2>Photos waiting ({data.photos.length})</h2>
      {data.photos.length === 0 ? <p className="ycr-muted">Nothing waiting.</p> : null}
      <div className="ycr-grid">
        {data.photos.map((p) => {
          const type = PHOTO_TYPES.find((t) => t.id === p.purpose)?.label || p.purpose;
          const who = p.player_name || p.details.playerName || '';
          return (
            <div className="ycr-card" key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url ? <img src={p.url} alt="" /> : null}
              <div className="ycr-meta">
                <b>{type}</b>
                <span>{who ? `${who}${p.playerid ? '' : ' (not on the site yet)'}` : p.school_name || ''}</span>
                {p.school_name && who ? <span className="ycr-muted">{p.school_name}</span> : null}
                <span className="ycr-muted">
                  {p.date_taken ? new Date(p.date_taken).getUTCFullYear() : ''}{p.details.classYear ? ` · ${p.details.classYear}` : ''}
                </span>
                {p.details.note ? <span>“{p.details.note}”</span> : null}
                <span className="ycr-muted">From {p.details.by?.name || 'a fan'}{p.details.by?.email ? ` (${p.details.by.email})` : ''} · {when(p.uploaded_at)}</span>
                {busy[p.id] ? <span className="ycr-muted">{busy[p.id]}</span> : null}
              </div>
              <div className="ycr-actions">
                <button type="button" className="ycr-btn ycr-yes" onClick={() => act(p.id, 'approve')} disabled={!!busy[p.id]}>Approve: put it on the site</button>
                <button type="button" className="ycr-btn" onClick={() => act(p.id, 'reject')} disabled={!!busy[p.id]}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>

      <h2>Corrections and news tips</h2>
      {data.tips.length === 0 ? <p className="ycr-muted">None yet.</p> : null}
      <ul className="ycr-list">
        {data.tips.map((t) => (
          <li key={t.id}>
            <b>{t.intake_source === 'correction' ? 'Correction' : 'News tip'}</b>
            {t.raw_player_name ? ` · ${t.raw_player_name}` : ''} · <span className="ycr-muted">{t.sender_name || 'a fan'}, {when(t.submitted_at)}</span>
            {t.notes ? <div>{t.notes}</div> : null}
            {t.article_url ? <div><a href={t.article_url} target="_blank" rel="noopener noreferrer">{t.article_url}</a></div> : null}
          </li>
        ))}
      </ul>

      <h2>Missing players</h2>
      {data.missing.length === 0 ? <p className="ycr-muted">None yet.</p> : null}
      <ul className="ycr-list">
        {data.missing.map((m) => (
          <li key={m.id}>
            <b>{m.player_name}</b>{m.grad_year ? `, class of ${m.grad_year}` : ''}{m.school_name ? ` · ${m.school_name}` : ''} · <span className="ycr-muted">{when(m.created_at)}</span>
            {m.notes ? <div className="ycr-muted">{m.notes}</div> : null}
          </li>
        ))}
      </ul>
      <Style />
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      .ycr { max-width: 1100px; margin: 0 auto; padding: 16px 16px 60px; color: var(--ink); }
      .ycr h2 { font: 400 26px/1.1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .05em; margin: 24px 0 10px; }
      .ycr-muted { opacity: .65; }
      .ycr-error { color: #ff6b6b; }
      .ycr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .ycr-card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
      .ycr-card img { width: 100%; aspect-ratio: 5/7; object-fit: contain; background: rgba(255,255,255,.05); border-radius: 6px; }
      .ycr-meta { display: flex; flex-direction: column; gap: 3px; font-size: 13px; line-height: 1.35; }
      .ycr-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .ycr-btn { min-height: 38px; padding: 0 12px; border-radius: 8px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 400 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
      .ycr-yes { background: #FFD700; color: #000; }
      .ycr-btn:disabled { opacity: .5; }
      .ycr-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.45; }
      .ycr-list li { border-bottom: 1px solid var(--line); padding-bottom: 8px; word-break: break-word; }
      .ycr-list a { color: #FFD700; }
    `}</style>
  );
}
