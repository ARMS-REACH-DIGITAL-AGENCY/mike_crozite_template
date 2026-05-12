'use client';

import { useEffect } from 'react';

const TAB_IDS = [
  'ppTab-schedule',
  'ppTab-stats',
  'ppTab-news',
  'ppTab-social',
  'ppTab-connect',
  'ppTab-upload',
];

const STAGES = ['Youth Baseball', 'Middle School', 'High School', 'College', 'Minor Leagues', 'Major Leagues', 'Fan Memory'];
const CLIENT_UPLOAD_TARGET_BYTES = 700_000;
const CLIENT_UPLOAD_MAX_SIDE = 1280;

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-stats';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  if (TAB_IDS.includes(hash.replace('#', ''))) return hash;
  return '#ppTab-stats';
}

function buildUploadForm(playerName: string) {
  const firstName = String(playerName || 'this player').split(' ')[0] || 'this player';
  return `
    <div class="profile-upload-panel">
      <div class="profile-upload-copy">
        <div class="profile-upload-kicker">The Golden Line</div>
        <h2>Upload a memory from ${esc(firstName)}'s baseball journey.</h2>
        <p>Add a photo from youth baseball, school ball, college, pro ball, or a fan moment. The date helps place the memory in chronological order.</p>
      </div>
      <form class="profile-upload-form" id="goldenLineUploadForm">
        <input type="hidden" name="playerName" value="${esc(playerName)}" />
        <label>Photo stage<select name="stage">${STAGES.map((stage) => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}</select></label>
        <label>Date photo was taken<input name="photoTakenDate" type="date" /></label>
        <label>Your name<input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." /></label>
        <label>Email for review updates<input name="contributorEmail" type="email" placeholder="you@example.com" /></label>
        <label>Phone / text optional<input name="contributorPhone" type="tel" placeholder="Optional" /></label>
        <label>Relationship / role<input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." /></label>
        <label class="profile-upload-wide">Memory title<input name="title" placeholder="Example: First travel ball tournament" /></label>
        <label class="profile-upload-wide">Caption / memory<textarea name="caption" rows="4" placeholder="I remember this because..."></textarea></label>
        <label>Upload photo<input name="photo" id="goldenLinePhotoInput" type="file" accept="image/*" required /></label>
        <div class="profile-upload-preview" id="goldenLinePreview"><span>Selected photo preview</span></div>
        <div class="profile-upload-actions"><button type="submit">Submit Memory</button><span id="goldenLineUploadStatus">Submitted photos are saved as pending memories.</span></div>
      </form>
    </div>`;
}

function ensureUploadForm(playerName: string) {
  const uploadPanel = document.getElementById('ppTab-upload') as HTMLElement | null;
  if (!uploadPanel) return;
  if (uploadPanel.querySelector('#goldenLineUploadForm')) return;
  uploadPanel.innerHTML = buildUploadForm(playerName);
}

function activate(hashValue?: string | null) {
  const zone = document.getElementById('playerFunZone');
  if (!zone) return;

  const hash = normalizeHash(hashValue);
  const activeId = hash.replace('#', '');

  TAB_IDS.forEach((id) => {
    const panel = document.getElementById(id) as HTMLElement | null;
    if (!panel) return;
    const isActive = id === activeId;
    panel.classList.toggle('pp-fz-panel-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.hidden = !isActive;
  });

  document.querySelectorAll<HTMLAnchorElement>('.pp-fz-tab').forEach((tab) => {
    const href = normalizeHash(tab.getAttribute('href'));
    if (tab.getAttribute('href') === '#ppTab-influence') {
      tab.href = '#ppTab-upload';
      tab.innerHTML = '<i class="ri-upload-cloud-line" aria-hidden="true"></i><span>Upload</span>';
    }
    tab.classList.toggle('pp-fz-tab-active', href === hash);
  });

  if (window.location.hash === '#ppTab-influence') {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read selected image.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to compress selected image.'));
    }, 'image/jpeg', quality);
  });
}

async function prepareUploadFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are supported.');

  const img = await loadImage(file);
  let maxSide = CLIENT_UPLOAD_MAX_SIDE;
  let quality = 0.78;
  let bestBlob: Blob | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to prepare selected image.');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, quality);
    bestBlob = blob;
    if (blob.size <= CLIENT_UPLOAD_TARGET_BYTES) break;
    maxSide = Math.max(640, Math.round(maxSide * 0.78));
    quality = Math.max(0.42, quality - 0.1);
  }

  if (!bestBlob) throw new Error('Unable to prepare selected image.');
  if (bestBlob.size > CLIENT_UPLOAD_TARGET_BYTES * 1.35) {
    throw new Error('That photo is too large to upload from the browser. Please choose a smaller image or screenshot.');
  }

  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'golden-line-memory';
  return new File([bestBlob], `${cleanName}.jpg`, { type: 'image/jpeg' });
}

async function parseApiResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const trimmed = text.trim();
    if (/request entity too large|payload too large|body exceeded|function_payload_too_large/i.test(trimmed)) {
      throw new Error('That photo is still too large after compression. Please choose a smaller image or screenshot.');
    }
    throw new Error(trimmed ? `Upload failed: ${trimmed.slice(0, 180)}` : 'Upload failed.');
  }
}

export default function ProfileFunZoneStabilizer({ playerId, hsid, playerName }: { playerId: string; hsid: string; playerName: string }) {
  useEffect(() => {
    ensureUploadForm(playerName);
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const tab = target?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      const hash = normalizeHash(tab.getAttribute('href'));
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      ensureUploadForm(playerName);
      activate(hash);
    };

    const onHash = () => {
      ensureUploadForm(playerName);
      activate(window.location.hash);
    };

    const onChange = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.id !== 'goldenLinePhotoInput') return;
      const file = input.files?.[0];
      const preview = document.getElementById('goldenLinePreview');
      if (!preview || !file) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="Selected upload preview" />`;
    };

    const onSubmit = async (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.id !== 'goldenLineUploadForm') return;
      event.preventDefault();
      const status = document.getElementById('goldenLineUploadStatus');
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      const formData = new FormData(form);
      const selectedPhoto = formData.get('photo');
      if (button) button.disabled = true;
      try {
        if (!(selectedPhoto instanceof File) || selectedPhoto.size === 0) throw new Error('Please choose a photo before submitting.');
        if (status) status.textContent = 'Optimizing photo for upload...';
        const preparedPhoto = await prepareUploadFile(selectedPhoto);
        formData.set('photo', preparedPhoto);
        formData.set('playerId', playerId);
        formData.set('hsid', hsid);
        formData.set('playerName', playerName || '');
        formData.set('pageUrl', window.location.href);
        if (status) status.textContent = 'Uploading memory...';
        const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
        const data = await parseApiResponse(res);
        if (!res.ok) throw new Error(data?.error || 'Upload failed.');
        if (status) status.textContent = 'Uploaded. It is pending review.';
        form.reset();
        const preview = document.getElementById('goldenLinePreview');
        if (preview) preview.innerHTML = '<span>Selected photo preview</span>';
        window.dispatchEvent(new CustomEvent('yat:golden-line-uploaded', { detail: data?.moment }));
      } catch (error: any) {
        if (status) status.textContent = error?.message || 'Upload failed.';
      } finally {
        if (button) button.disabled = false;
      }
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('hashchange', onHash);

    const observer = new MutationObserver(() => {
      ensureUploadForm(playerName);
      activate(window.location.hash);
    });
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
    };
  }, [playerId, hsid, playerName]);

  return (
    <style jsx global>{`
      .pp-funzone-outer,
      #playerFunZone { background: #070707 !important; }

      #playerFunZone {
        --profile-tabs-h: 88px;
        position: relative !important;
        height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--footerH, 76px)) !important;
        min-height: 330px !important;
        overflow: hidden !important;
        display: block !important;
      }

      #playerFunZone > .pp-fz-panel {
        position: absolute !important;
        inset: 0 0 var(--profile-tabs-h) 0 !important;
        display: none !important;
        visibility: hidden !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.045), transparent 38%), #070707 !important;
        color: #f4f4f4 !important;
        padding-bottom: 18px !important;
      }

      #playerFunZone > .pp-fz-panel.pp-fz-panel-active { display: block !important; visibility: visible !important; }
      #playerFunZone > .pp-fz-panel[hidden] { display: none !important; }

      #playerFunZone .pp-fz-tabs-shell {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        height: var(--profile-tabs-h) !important;
        z-index: 40 !important;
        background: rgba(7,7,7,.96) !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
      }

      #playerFunZone .pp-fz-tabs {
        height: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
      }

      #playerFunZone .pp-fz-tab {
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        color: rgba(255,255,255,.72) !important;
        text-decoration: none !important;
      }

      #playerFunZone .pp-fz-tab::before,
      #playerFunZone .pp-fz-tab::after,
      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab-default::after { display: none !important; opacity: 0 !important; }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active { color: #fff !important; }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::before {
        content: '' !important;
        display: block !important;
        opacity: 1 !important;
        position: absolute !important;
        left: 12% !important;
        right: 12% !important;
        top: 0 !important;
        height: 3px !important;
        background: #d2b45c !important;
      }

      #playerFunZone .pp-fz-tab i { font-size: 28px !important; line-height: 1 !important; }
      #playerFunZone .pp-fz-tab span { font: 900 12px/1 Oswald, sans-serif !important; letter-spacing: .08em !important; text-transform: uppercase !important; }

      .profile-upload-panel {
        width: min(1040px, 100%);
        margin: 0 auto;
        padding: 28px 18px 120px;
        display: grid;
        grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
        gap: 24px;
      }
      .profile-upload-copy { border-left: 5px solid #d2b45c; padding-left: 18px; }
      .profile-upload-kicker { color: #d2b45c; font: 900 12px/1 Oswald, sans-serif; letter-spacing: .18em; text-transform: uppercase; }
      .profile-upload-copy h2 { margin: 10px 0 12px; color: #fff; font: 900 clamp(34px, 5vw, 58px)/.9 Oswald, sans-serif; letter-spacing: .02em; text-transform: uppercase; }
      .profile-upload-copy p { margin: 0; color: rgba(255,255,255,.72); font: 400 16px/1.45 system-ui, sans-serif; }
      .profile-upload-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; border: 1px solid rgba(210,180,92,.4); background: rgba(255,255,255,.045); }
      .profile-upload-form label { display: grid; gap: 5px; color: rgba(255,255,255,.72); font: 900 11px/1 Oswald, sans-serif; letter-spacing: .13em; text-transform: uppercase; }
      .profile-upload-form input, .profile-upload-form select, .profile-upload-form textarea { width: 100%; border: 1px solid rgba(255,255,255,.2); border-radius: 0; background: #090909; color: #fff; padding: 10px; font: 500 14px/1.25 system-ui, sans-serif; }
      .profile-upload-wide, .profile-upload-actions { grid-column: 1 / -1; }
      .profile-upload-preview { width: 100%; aspect-ratio: 7 / 5; border: 1px solid rgba(210,180,92,.55); background: #111; display: grid; place-items: center; overflow: hidden; color: rgba(255,255,255,.45); font: 900 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      .profile-upload-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .profile-upload-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .profile-upload-actions button { min-height: 40px; padding: 0 18px; border: 1px solid rgba(210,180,92,.85); border-radius: 0; background: rgba(210,180,92,.12); color: #d2b45c; font: 900 13px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
      .profile-upload-actions button:disabled { opacity: .55; }
      .profile-upload-actions span { color: rgba(255,255,255,.72); font: 700 13px/1.35 system-ui, sans-serif; }

      @media (max-width: 760px) {
        #playerFunZone {
          --profile-tabs-h: 94px;
          height: calc(100dvh - var(--row1-h, 34px) - var(--row2-h, 48px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--footerH, 76px)) !important;
          min-height: 360px !important;
        }
        #playerFunZone .pp-fz-tab i { font-size: 31px !important; }
        #playerFunZone .pp-fz-tab span { font-size: 12px !important; }
        .profile-upload-panel { grid-template-columns: 1fr; padding: 24px 18px 130px; }
        .profile-upload-form { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
