'use client';

// src/components/yatstats/FanConfirm.tsx
// "Confirm it's you": shown when a Stories action is refused because this
// site can't prove who the fan is.
//
// The header can show a fan as signed in on any *.yatstats.com site (the
// shared session cookie), but Firebase keeps its sign-in per site address,
// and the signed pass (lib/authPass.ts) only exists after a real sign-in on
// a yatstats.com site. The Join / Log in drawer can't help here - it sees
// the shared cookie and shows the account as signed in. So the fan types
// their password once, right here: that signs them into Firebase on this
// site and sets the pass, which then covers every school's site for 30 days.

import { useState } from 'react';
import { auth, sendPasswordResetEmail, signInWithEmailAndPassword } from '@/lib/firebase';

export default function FanConfirm({ email: initialEmail, onConfirmed }: { email?: string | null; onConfirmed: () => void }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const confirm = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      // Sets the signed pass for all of yatstats.com (no school given, so
      // the fan's home school is left as it is).
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uid: cred.user.uid, email: cred.user.email || email.trim(), idToken }),
      }).catch(() => {});
      setPassword('');
      onConfirmed();
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      setMessage({
        kind: 'error',
        text: /wrong-password|invalid-credential|user-not-found|invalid-email/.test(code)
          ? 'That email and password don’t match. Try again.'
          : /too-many-requests/.test(code)
            ? 'Too many tries. Please wait a minute and try again.'
            : 'We couldn’t confirm it’s you right now. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) return setMessage({ kind: 'error', text: 'Enter your email first.' });
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage({ kind: 'info', text: `We sent a password reset link to ${email.trim()}.` });
    } catch {
      setMessage({ kind: 'error', text: 'We couldn’t send a reset email. Check the address and try again.' });
    }
  };

  return (
    <form className="yfc" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
      <div className="yfc-title">Confirm it&apos;s you</div>
      <p className="yfc-text">Enter your YAT?STATS password once. You&apos;ll stay confirmed on every school&apos;s site for 30 days.</p>
      <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      {message && <div className={message.kind === 'error' ? 'yfc-error' : 'yfc-info'}>{message.text}</div>}
      <div className="yfc-row">
        <button type="submit" className="yfc-btn" disabled={busy || !password || !email.trim()}>{busy ? 'Confirming…' : 'Confirm'}</button>
        <button type="button" className="yfc-link" onClick={reset}>Forgot password?</button>
      </div>
      <style jsx>{`
        .yfc { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid rgba(255,215,0,.45); border-radius: 10px; background: rgba(255,215,0,.06); }
        .yfc-title { font: 400 18px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .yfc-text { margin: 0; font-size: 14px; line-height: 1.4; opacity: .8; }
        .yfc input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255,255,255,.06); color: var(--ink, #fff); font-family: inherit; font-size: 14px; }
        .yfc-row { display: flex; align-items: center; gap: 14px; }
        .yfc-btn { min-height: 40px; padding: 0 22px; border-radius: 8px; border: 0; background: #FFD700; color: #000; font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; cursor: pointer; }
        .yfc-btn:disabled { opacity: .5; cursor: default; }
        .yfc-link { border: 0; background: none; padding: 0; color: inherit; opacity: .75; font-family: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
        .yfc-error { color: #ff7b7b; font-size: 13px; }
        .yfc-info { color: #FFD700; font-size: 13px; }
      `}</style>
    </form>
  );
}
