'use client';
// The player's outgoing "personal message" video on the CONNECT tab, in a
// portrait (9:16) phone-shaped frame. Reviewers also see an upload button.
//
// The file goes straight from the browser to S3 through a signed form post
// into a hidden iframe (no bucket CORS needed); then /api/player-connect-video
// checks it arrived and makes it live.
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';

type Video = { url: string; contentType: string; uploadedAt: string };
type Signed = { url: string; key: string; fields: Record<string, string> };

const API = '/api/player-connect-video';
const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v';
const TYPE_BY_EXT: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v' };

async function token() {
  await auth.authStateReady?.();
  return (await auth.currentUser?.getIdToken().catch(() => '')) || '';
}

export default function PlayerConnectVideo({ playerId, firstName }: { playerId: string; firstName: string }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'saving'>('idle');
  const [message, setMessage] = useState('');
  const [signed, setSigned] = useState<Signed | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const frameName = `yat-connect-upload-${playerId}`;
  const name = (firstName || 'this player').toUpperCase();

  // The live video for everyone; whether this viewer may upload.
  useEffect(() => {
    let active = true;
    fetch(`${API}?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setVideo(d.video || null); })
      .catch(() => {});
    const check = async () => {
      const t = await token();
      if (!t) { if (active) setCanUpload(false); return; }
      const d = await fetch(`${API}?playerId=${encodeURIComponent(playerId)}&me=1`, { headers: { 'x-firebase-token': t }, cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (active) setCanUpload(Boolean(d?.canUpload));
    };
    void check();
    window.addEventListener('yat-auth-success', check);
    window.addEventListener('yat-sign-out', check);
    return () => { active = false; window.removeEventListener('yat-auth-success', check); window.removeEventListener('yat-sign-out', check); };
  }, [playerId]);

  // Once the signed fields are on the form, send it (the file input is last).
  useEffect(() => {
    if (!signed || !formRef.current) return;
    submitted.current = true;
    setStatus('uploading');
    formRef.current.submit();
  }, [signed]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-firebase-token': await token() },
      body: JSON.stringify({ playerId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
    return data;
  };

  const onPick = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const contentType = (file.type || TYPE_BY_EXT[ext] || '').toLowerCase();
    setMessage('');
    setStatus('signing');
    try {
      setSigned(await post({ action: 'sign', contentType, size: file.size }));
    } catch (e) {
      setStatus('idle');
      setMessage((e as Error).message);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // S3 answered (success or error page) inside the hidden iframe.
  const onFrameLoad = async () => {
    if (!submitted.current || !signed) return;
    submitted.current = false;
    setStatus('saving');
    try {
      const d = await post({ action: 'publish', key: signed.key });
      setVideo(d.video);
      setMessage('Video is live on this profile.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setStatus('idle');
      setSigned(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRemove = async () => {
    if (!window.confirm(`Take ${firstName || 'this player'}'s video off the profile?`)) return;
    setStatus('saving');
    try {
      await post({ action: 'remove' });
      setVideo(null);
      setMessage('Video removed.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setStatus('idle');
    }
  };

  const busy = status !== 'idle';

  return (
    <div className="yp-connect-video">
      <div className="yp-connect-video-frame">
        {video ? (
          <video
            key={video.url}
            className="yp-connect-video-player"
            src={`${video.url}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            aria-label={`A personal message from ${firstName || 'the player'}`}
          />
        ) : (
          <div className="yp-player-video-placeholder" role="img" aria-label="Player video coming soon">
            <i className="ri-play-circle-line" aria-hidden="true" />
            <strong>A PERSONAL MESSAGE FROM {name}</strong>
            <span>PLAYER VIDEO COMING SOON</span>
          </div>
        )}
      </div>
      {video && <strong className="yp-connect-video-title">A PERSONAL MESSAGE FROM {name}</strong>}

      {canUpload && (
        <div className="yp-connect-video-admin">
          <form ref={formRef} action={signed?.url || '#'} method="post" encType="multipart/form-data" target={frameName}>
            {signed && Object.entries(signed.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label className={`yp-connect-video-btn${busy ? ' is-busy' : ''}`}>
              <i className={busy ? 'ri-loader-4-line' : 'ri-upload-cloud-2-line'} aria-hidden="true" />{' '}
              {status === 'signing' ? 'PREPARING…' : status === 'uploading' ? 'UPLOADING… KEEP THIS PAGE OPEN' : status === 'saving' ? 'SAVING…' : video ? 'REPLACE VIDEO' : 'UPLOAD PLAYER VIDEO'}
              <input ref={fileRef} type="file" name="file" accept={ACCEPT} disabled={busy} onChange={onPick} hidden />
            </label>
          </form>
          {video && !busy && (
            <button type="button" className="yp-connect-video-remove" onClick={onRemove}>REMOVE</button>
          )}
          <iframe name={frameName} title="Video upload" onLoad={onFrameLoad} hidden />
          <small>Reviewers only. Vertical (portrait) MP4 works best, up to 500 MB. iPhone: Settings → Camera → Formats → Most Compatible.</small>
          {message && <p className="yp-connect-video-msg" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
