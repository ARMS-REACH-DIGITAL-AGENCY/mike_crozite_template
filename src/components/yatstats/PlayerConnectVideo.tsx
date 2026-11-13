'use client';
// The player's outgoing "personal message" video on the CONNECT tab, in a
// portrait (9:16) phone-shaped frame. Reviewers also see an upload button.
//
// The file goes straight from the browser to S3 through a signed form post
// into a hidden iframe (no bucket CORS needed); then /api/player-connect-video
// checks it arrived and makes it live.
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import ConnectOccasionGallery from '@/components/yatstats/ConnectOccasionGallery';

type Video = { url: string; contentType: string; uploadedAt: string };
type Signed = { url: string; key: string; fields: Record<string, string> };

const API = '/api/player-connect-video';
const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v';
const TYPE_BY_EXT: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v' };

async function token() {
  await auth.authStateReady?.();
  return (await auth.currentUser?.getIdToken().catch(() => '')) || '';
}

export default function PlayerConnectVideo({ playerId, firstName, portalHref = '/connect-contribute#sec-video-request' }: { playerId: string; firstName: string; portalHref?: string }) {
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
      <header className="yp-connect-program-intro">
        <div className="yp-connect-program-eyebrow"><i className="ri-video-chat-line" aria-hidden="true" /> YAT-A-BOY PLAYER CONNECT <span>COMING SOON</span></div>
        <h2>CONNECT WITH {name}</h2>
        <p>Celebrate the people and moments that matter with a personal video message from a hometown baseball alumnus.</p>
      </header>

      <ConnectOccasionGallery playerName={firstName || undefined} />

      {video ? (
        <div className="yp-connect-recorded">
          <div className="yp-connect-video-frame">
            <video key={video.url} className="yp-connect-video-player"
              src={`${video.url}#t=0.1`} controls playsInline preload="metadata"
              aria-label={`A personal message from ${firstName || 'the player'}`} />
          </div>
          <div className="yp-connect-recorded-copy">
            <strong>A MESSAGE FROM {name}</strong>
            <p>Watch this introduction from {firstName || 'the player'}. Personal video requests are not open yet.</p>
          </div>
        </div>
      ) : null}

      <div className="yp-connect-program-availability" role="status">
        <i className="ri-calendar-check-line" aria-hidden="true" />
        <div>
          <strong>PERSONALIZED VIDEO REQUESTS · COMING SOON</strong>
          <span>Player participation, pricing and turnaround will be announced before bookings open.</span>
        </div>
      </div>
      <div className="yp-connect-program-actions">
        <a className="yp-connect-program-cta" href={portalHref}>
          GET LAUNCH UPDATES <i className="ri-arrow-right-line" aria-hidden="true" />
        </a>
        <small>No orders or payments are being taken today.</small>
      </div>
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
      <style jsx>{`
        .yp-connect-program-intro{align-self:stretch;display:flex;flex-direction:column;gap:7px;text-align:left;}
        .yp-connect-program-eyebrow{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font:800 11px/1.25 var(--yat-font-compact,'Arial Narrow',sans-serif);letter-spacing:.08em;}
        .yp-connect-program-eyebrow i{color:#ffbc36;font-size:19px;}
        .yp-connect-program-eyebrow span{border:1px solid #f2b736;color:#e7aa28;border-radius:99px;padding:3px 7px;font-size:10px;}
        .yp-connect-program-intro h2{margin:0;font:900 clamp(25px,4vw,37px)/1.05 var(--yat-font-compact,'Arial Narrow',sans-serif);letter-spacing:.02em;}
        .yp-connect-program-intro p{margin:0;max-width:600px;text-align:left!important;color:var(--muted,#bcbcbc);font:400 13px/1.5 var(--yat-font-ui,Arial,sans-serif);}
        .yp-connect-recorded{display:flex;gap:14px;align-items:center;align-self:stretch;padding:12px;border:1px solid #ffffff45;border-radius:12px;background:#ffffff09;}
        .yp-connect-recorded .yp-connect-video-frame{flex:0 0 auto;width:clamp(105px,28%,150px)!important;aspect-ratio:9/16;height:auto!important;max-height:265px;box-shadow:none!important;}
        .yp-connect-recorded-copy{display:flex;flex-direction:column;gap:7px;text-align:left;}
        .yp-connect-recorded-copy strong{font:900 18px/1.1 var(--yat-font-compact,'Arial Narrow',sans-serif);}
        .yp-connect-recorded-copy p{margin:0;text-align:left!important;font:400 12px/1.45 var(--yat-font-ui,Arial,sans-serif);color:var(--muted,#bcbcbc);}
        .yp-connect-program-availability{display:flex;align-items:center;gap:12px;align-self:stretch;padding:12px;border:1px solid #8a6b34;border-radius:10px;background:#ffc34f13;}
        .yp-connect-program-availability i{color:#ffbd3c;font-size:25px;flex:none;}
        .yp-connect-program-availability div{display:flex;flex-direction:column;gap:5px;}
        .yp-connect-program-availability strong{font:800 14px/1.1 var(--yat-font-compact,'Arial Narrow',sans-serif);}
        .yp-connect-program-availability span{font:400 11px/1.4 var(--yat-font-ui,Arial,sans-serif);color:var(--muted,#bcbcbc);}
        .yp-connect-program-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;align-self:stretch;}
        .yp-connect-program-cta{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:10px 17px;border:1px solid #ffbe38;border-radius:999px;background:#ffbe38;color:#161410!important;text-decoration:none;font:900 16px/1.1 var(--yat-font-compact,'Arial Narrow',sans-serif);letter-spacing:.025em;}
        .yp-connect-program-cta:hover{background:#ffd275;}
        .yp-connect-program-cta:focus-visible{outline:2px solid currentColor;outline-offset:3px;}
        .yp-connect-program-actions small{font:400 11px/1.35 var(--yat-font-ui,Arial,sans-serif);color:var(--muted,#bcbcbc);}
        @media(max-width:550px){.yp-connect-program-actions{align-items:stretch;flex-direction:column;}.yp-connect-program-actions small{text-align:center;}.yp-connect-recorded{align-items:flex-start;}.yp-connect-program-intro h2{font-size:27px;}}
      `}</style>
    </div>
  );
}
