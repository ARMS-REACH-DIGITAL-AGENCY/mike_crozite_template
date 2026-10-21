'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';

type Target = { playerId: string; hsid: string; name: string };
export const WHERE_YAT_OPEN = 'yat:where-yat-now-open';
export function openWhereYatNow(target: Target) {
  window.dispatchEvent(new CustomEvent<Target>(WHERE_YAT_OPEN, { detail: target }));
}

const FIELD_STYLES = { width: '100%', padding: '10px', background: '#fff', color: '#191919', border: '1px solid #aaa', borderRadius: 4, fontSize: 15 } as const;
export default function WhereYatNowDrawer() {
  const [target, setTarget] = useState<Target | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setReady(true);
    const handler = (e: Event) => {
      const d = (e as CustomEvent<Target>).detail;
      if (!d?.playerId || !d?.hsid) return;
      setTarget(d);
      setError('');
      setSuccess(false);
      document.body.classList.add('drawer-open');
    };
    window.addEventListener(WHERE_YAT_OPEN, handler);
    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-where-yat-profile-player]');
      if (!element) return;
      event.preventDefault();
      const playerId = element.dataset.whereYatProfilePlayer || '';
      const hsid = element.dataset.whereYatProfileSchool || '';
      const name = element.dataset.whereYatProfileName || 'this alumnus';
      if (playerId && hsid) window.dispatchEvent(new CustomEvent(WHERE_YAT_OPEN, { detail: { playerId, hsid, name } }));
    };
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener(WHERE_YAT_OPEN, handler); document.removeEventListener("click", onClick); };
  }, []);

  const close = () => {
    setTarget(null);
    setBusy(false);
    document.body.classList.remove('drawer-open');
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setError('');
    try {
      await auth.authStateReady?.();
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      const data = new FormData(event.currentTarget);
      if (token) data.set('idToken', token);
      data.set('playerId', target.playerId);
      data.set('hsid', target.hsid);
      const response = await fetch('/api/contribute/where-yat-now', { method: 'POST', body: data, credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to submit.');
      setSuccess(true);
      formRef.current?.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !target) return null;
  const field = (label: string, name: string, placeholder = '', required = false) => (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', marginBottom: 11 }}>
      {label}
      <input style={{ ...FIELD_STYLES, marginTop: 4 }} name={name} placeholder={placeholder} required={required} maxLength={name === 'email' ? 220 : 300} />
    </label>
  );
  return createPortal(
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 130000, background: 'rgba(0,0,0,.78)' }} onClick={close}>
      <aside role="dialog" aria-modal="true" aria-label="Where YAT now these days alumni update"
        onClick={(e) => e.stopPropagation()}
        style={{ marginLeft: 'auto', width: 'min(100%,490px)', height: '100dvh', overflowY: 'auto', background: '#f5f0e7', color: '#211b14', padding: '18px 20px 45px', boxShadow: '-8px 0 30px #0009', fontFamily: 'Arial,sans-serif' }}>
        <button type="button" onClick={close} aria-label="Close survey" style={{ float: 'right', fontSize: 28, border: 0, background: 'transparent', cursor: 'pointer' }}>×</button>
        <div style={{ color: '#9a732b', fontWeight: 800, fontSize: 12, letterSpacing: '.1em' }}>YAT?STATS · ALUMNI CONNECTION</div>
        <h2 style={{ fontSize: 25, lineHeight: 1.1, margin: '12px 0' }}>WHERE YAT NOW THESE DAYS?</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>Help former teammates, coaches, and fans reconnect with {target.name}. This alumni update is free, and submissions are reviewed before appearing on the profile.</p>
        {success ? (
          <div role="status" style={{ marginTop: 30 }}>
            <h3>Thanks for the update!</h3>
            <p>Your information and photo have been submitted for review. Once approved, they can appear on the alumni profile.</p>
            <p>Want to promote your business beyond the free alumni listing? Explore our optional partnership opportunities.</p>
            <a style={{ color: '#145a3c', fontWeight: 800 }} href={`/${target.hsid}#sec-partner`} onClick={close}>EXPLORE PARTNERSHIP OPTIONS →</a>
            <p><button type="button" onClick={close}>Close</button></p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={submit}>
            {field('YOUR NAME', 'displayName', 'First and last name', true)}
            {field('EMAIL (FOR FOLLOW-UP, NOT PUBLIC)', 'email', 'you@example.com', true)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {field('CITY', 'city', 'City')}
              {field('STATE', 'state', 'State')}
            </div>
            {field('WHAT DO YOU DO THESE DAYS?', 'occupation', 'Career or current role')}
            {field('BUSINESS OR ORGANIZATION', 'company', 'Company name')}
            {field('BUSINESS WEBSITE', 'website', 'https://...')}
            {field('LINKEDIN', 'linkedin', 'Profile URL')}
            {field('INSTAGRAM', 'instagram', 'Profile URL')}
            {field('FACEBOOK', 'facebook', 'Profile URL')}
            {field('X / TWITTER', 'x', 'Profile URL')}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 11 }}>WHAT HAVE YOU BEEN UP TO?
              <textarea name="story" maxLength={2400} rows={4} style={{ ...FIELD_STYLES, resize: 'vertical', marginTop: 4 }} placeholder="Your story, family, memories, work, and what matters to you today..." />
            </label>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 18 }}>UPLOAD A RECENT PHOTO (OPTIONAL)
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" style={{ display: 'block', marginTop: 7, maxWidth: '100%' }} />
              <small style={{ display: 'block', fontWeight: 400, marginTop: 3 }}>One photo, maximum 8 MB. Reviewed before publishing.</small>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 16, fontSize: 13 }}>
              <input type="checkbox" name="sponsorship" value="yes" style={{ marginTop: 2 }} />
              I'm interested in hearing about optional advertising or partnership opportunities for my business.
            </label>
            <p style={{ fontSize: 11, lineHeight: 1.4 }}>By submitting, you authorize YAT?STATS to review and display the approved public information and photo. Do not include private contact details in your public story. Submitting someone else's details does not verify you are that alumnus.</p>
            {error && <p role="alert" style={{ color: '#ae2222', fontWeight: 700 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ width: '100%', background: '#145a3c', color: '#fff', padding: 15, border: 0, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              {busy ? 'SUBMITTING…' : 'SUBMIT FREE ALUMNI UPDATE'}
            </button>
            <p style={{ fontSize: 12 }}>Want to advertise instead? <a href={`/${target.hsid}#sec-partner`} onClick={close}>View the Partnership Program</a>.</p>
          </form>
        )}
      </aside>
    </div>,
    document.body,
  );
}
