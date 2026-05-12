'use client';

import { useEffect } from 'react';

type ProfileMeta = {
  playerId: string;
  hsid: string;
  displayName: string;
  statusLabel: string;
  currentTeamName: string;
  levelLabel: string;
  position: string;
  batsThrows: string;
  heightWeight: string;
  classOf: string;
  teamAffiliationStatus?: string;
};

const STAGES = ['Youth Baseball', 'Middle School', 'High School', 'College', 'Minor Leagues', 'Major Leagues', 'Fan Memory'];
const CLIENT_UPLOAD_TARGET_BYTES = 1_250_000;
const CLIENT_UPLOAD_MAX_SIDE = 1600;

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fallbackReturnUrl(meta: ProfileMeta) {
  return `/${encodeURIComponent(meta.hsid)}?view=active&player=${encodeURIComponent(meta.playerId)}#player-${encodeURIComponent(meta.playerId)}`;
}

function buildProfileMetaStrip(meta: ProfileMeta) {
  const top = meta.currentTeamName || 'Team pending';
  const bottom = [meta.position, meta.batsThrows, meta.heightWeight].filter(Boolean).join(' · ') || [meta.levelLabel, meta.statusLabel].filter(Boolean).join(' · ');
  return `<section class="yp-meta-strip" aria-label="Player profile metadata"><span class="yp-meta-team">${esc(top)}</span><span class="yp-meta-sub">${esc(bottom || 'Player details')}</span></section>`;
}

function buildUploadPanel(meta: ProfileMeta) {
  const firstName = String(meta.displayName || 'this player').split(' ')[0] || 'this player';
  return `
    <div class="glu-panel">
      <div class="glu-explainer">
        <div class="glu-kicker">The Golden Line</div>
        <h2>Upload a memory from ${esc(firstName)}'s baseball journey.</h2>
        <p>Add a photo from youth baseball, school ball, college, pro ball, or a fan moment. The date helps place the memory in chronological order.</p>
      </div>
      <form class="glu-form" id="goldenLineUploadForm">
        <input type="hidden" name="playerName" value="${esc(meta.displayName || '')}" />
        <label>Photo stage<select name="stage" id="goldenLineStageSelect">${STAGES.map((stage) => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}</select></label>
        <label>Date photo was taken<input name="photoTakenDate" type="date" /></label>
        <label>Your name<input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." /></label>
        <label>Email for review updates<input name="contributorEmail" type="email" placeholder="you@example.com" /></label>
        <label>Phone / text optional<input name="contributorPhone" type="tel" placeholder="Optional" /></label>
        <label>Relationship / role<input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." /></label>
        <label class="glu-wide">Memory title<input name="title" placeholder="Example: First travel ball tournament" /></label>
        <label class="glu-wide">Caption / memory<textarea name="caption" rows="3" placeholder="I remember this because..."></textarea></label>
        <label>Upload photo<input name="photo" id="goldenLinePhotoInput" type="file" accept="image/*" required /></label>
        <div class="glu-preview" id="goldenLinePreview"><span>Selected photo preview</span></div>
        <div class="glu-actions"><button type="submit">Submit Memory</button><span id="goldenLineUploadStatus">Submitted photos are saved as pending memories.</span></div>
      </form>
    </div>`;
}

function readPxVar(name: string, fallback: number) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function forceProfileTabsAboveFooter() {
  const tabsShell = document.querySelector('.pp-fz-tabs-shell') as HTMLElement | null;
  const tabs = document.querySelector('.pp-fz-tabs') as HTMLElement | null;
  const footer = document.querySelector('.yat-footer') as HTMLElement | null;
  const funzone = document.querySelector('.pp-funzone') as HTMLElement | null;
  const outer = document.querySelector('.pp-funzone-outer') as HTMLElement | null;
  const footerHeight = Math.max(footer?.getBoundingClientRect().height || 0, readPxVar('--footerH', 64));
  const tabsHeight = window.matchMedia('(max-width: 760px)').matches ? 72 : 68;
  const safeBottom = Math.max(0, window.innerHeight - (window.visualViewport?.height || window.innerHeight));

  document.documentElement.style.setProperty('--profile-tabs-h', `${tabsHeight}px`);
  document.body.style.paddingBottom = `${footerHeight + tabsHeight + safeBottom + 12}px`;

  if (footer) Object.assign(footer.style, { zIndex: '10020', position: 'fixed', left: '0', right: '0', bottom: '0' });
  if (tabsShell) Object.assign(tabsShell.style, { position: 'fixed', left: '0', right: '0', bottom: `${footerHeight + safeBottom}px`, height: `${tabsHeight}px`, zIndex: '10010', display: 'block', visibility: 'visible', opacity: '1', background: 'rgba(12,12,12,.985)', borderTop: '1px solid rgba(255,255,255,.12)', boxShadow: '0 -10px 26px rgba(0,0,0,.58)', transform: 'none' });
  if (tabs) Object.assign(tabs.style, { width: 'min(100%, 1280px)', height: `${tabsHeight}px`, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', alignItems: 'stretch' });
  document.querySelectorAll<HTMLElement>('.pp-fz-tab').forEach((tab) => Object.assign(tab.style, { height: `${tabsHeight}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '0' }));
  if (funzone) funzone.style.paddingBottom = `${tabsHeight + 22}px`;
  if (outer) outer.style.paddingBottom = `${tabsHeight + footerHeight + safeBottom + 8}px`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read selected image.')); };
    img.src = url;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to compress selected image.')), 'image/jpeg', quality);
  });
}

async function prepareUploadFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are supported.');
  if (file.size <= CLIENT_UPLOAD_TARGET_BYTES && file.type === 'image/jpeg') return file;

  const img = await loadImage(file);
  const scale = Math.min(1, CLIENT_UPLOAD_MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare selected image.');
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, 0.82);
  if (blob.size > CLIENT_UPLOAD_TARGET_BYTES) blob = await canvasToBlob(canvas, 0.68);
  if (blob.size > CLIENT_UPLOAD_TARGET_BYTES) blob = await canvasToBlob(canvas, 0.52);

  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'golden-line-memory';
  return new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' });
}

async function parseApiResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const trimmed = text.trim();
    if (/request entity too large|body exceeded|payload too large/i.test(trimmed)) {
      throw new Error('That photo is still too large after compression. Please choose a smaller image.');
    }
    throw new Error(trimmed ? `Upload failed: ${trimmed.slice(0, 180)}` : 'Upload failed: server returned an empty response.');
  }
}

export default function ProfilePageEnhancer({ meta }: { meta: ProfileMeta }) {
  useEffect(() => {
    const row3Host = document.querySelector('.yat-profile-meta-row-host') as HTMLElement | null;
    if (row3Host) {
      row3Host.innerHTML = buildProfileMetaStrip(meta);
      row3Host.classList.add('yat-profile-meta-row-host-populated');
    }

    const returnUrl = (() => {
      try {
        const saved = sessionStorage.getItem('yat:lastFlipCardReturnUrl') || '';
        if (saved && saved.includes(`#player-${meta.playerId}`)) return saved;
      } catch {}
      return fallbackReturnUrl(meta);
    })();

    document.querySelectorAll<HTMLAnchorElement>('a[aria-label="Back to Flip Card"], a[title="Back to Flip Card"]').forEach((link) => {
      link.href = returnUrl;
      link.setAttribute('data-return-to-flip-card', 'true');
    });

    const uploadPanel = document.querySelector('#ppTab-upload') as HTMLElement | null;
    if (uploadPanel) uploadPanel.innerHTML = buildUploadPanel(meta);

    const handleStageEvent = () => {
      try {
        const stage = sessionStorage.getItem('yat:goldenLineStage') || 'Fan Memory';
        const select = document.querySelector('#goldenLineStageSelect') as HTMLSelectElement | null;
        if (select) select.value = stage;
      } catch {}
    };

    const handlePrefillEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const year = detail.year || sessionStorage.getItem('yat:goldenLinePrefillYear');
      const dateInput = document.querySelector('#goldenLineUploadForm input[name="photoTakenDate"]') as HTMLInputElement | null;
      if (dateInput && year) dateInput.value = `${year}-07-01`;
    };

    const handleTabClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!link) return;
      const hash = link.getAttribute('href') || '';
      if (!hash.startsWith('#ppTab-')) return;
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      document.querySelectorAll<HTMLElement>('.pp-fz-panel').forEach((panel) => { panel.style.display = `#${panel.id}` === hash ? 'block' : 'none'; });
      document.querySelectorAll<HTMLElement>('.pp-fz-tab').forEach((tab) => { tab.classList.toggle('pp-fz-tab-active', tab.getAttribute('href') === hash); });
      requestAnimationFrame(forceProfileTabsAboveFooter);
    };

    const handlePreview = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.id !== 'goldenLinePhotoInput') return;
      const file = input.files?.[0];
      const preview = document.querySelector('#goldenLinePreview') as HTMLElement | null;
      if (!preview || !file) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="Selected upload preview" />`;
    };

    const handleSubmit = async (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.id !== 'goldenLineUploadForm') return;
      event.preventDefault();
      const status = document.querySelector('#goldenLineUploadStatus') as HTMLElement | null;
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      const formData = new FormData(form);
      const selectedPhoto = formData.get('photo');

      if (button) button.disabled = true;
      try {
        if (!(selectedPhoto instanceof File) || selectedPhoto.size === 0) throw new Error('Please choose a photo before submitting.');
        if (status) status.textContent = selectedPhoto.size > CLIENT_UPLOAD_TARGET_BYTES ? 'Optimizing photo for upload...' : 'Preparing upload...';
        const preparedPhoto = await prepareUploadFile(selectedPhoto);
        formData.set('photo', preparedPhoto);
        formData.set('playerId', meta.playerId);
        formData.set('hsid', meta.hsid);
        formData.set('playerName', meta.displayName || '');
        formData.set('pageUrl', window.location.href);

        if (status) status.textContent = 'Uploading memory and notifying ARMS...';
        const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
        const data = await parseApiResponse(res);
        if (!res.ok) throw new Error(data?.error || 'Upload failed');
        const sync = data?.moment?.arms_sync_status;
        if (status) status.textContent = sync === 'failed' ? 'Saved for review. ARMS sync needs attention.' : 'Uploaded. It is pending review and was queued for ARMS.';
        form.reset();
        const preview = document.querySelector('#goldenLinePreview') as HTMLElement | null;
        if (preview) preview.innerHTML = '<span>Selected photo preview</span>';
        window.dispatchEvent(new CustomEvent('yat:golden-line-uploaded', { detail: data.moment }));
      } catch (error: any) {
        if (status) status.textContent = error?.message || 'Upload failed';
      } finally {
        if (button) button.disabled = false;
      }
    };

    const applyChrome = () => requestAnimationFrame(forceProfileTabsAboveFooter);
    const observer = new MutationObserver(applyChrome);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    document.addEventListener('click', handleTabClick, true);
    document.addEventListener('change', handlePreview);
    document.addEventListener('submit', handleSubmit);
    window.addEventListener('resize', applyChrome);
    window.visualViewport?.addEventListener('resize', applyChrome);
    window.visualViewport?.addEventListener('scroll', applyChrome);
    window.addEventListener('yat:golden-line-stage', handleStageEvent);
    window.addEventListener('yat:golden-line-prefill', handlePrefillEvent);
    handleStageEvent();
    applyChrome();
    window.setTimeout(applyChrome, 250);
    window.setTimeout(applyChrome, 1000);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleTabClick, true);
      document.removeEventListener('change', handlePreview);
      document.removeEventListener('submit', handleSubmit);
      window.removeEventListener('resize', applyChrome);
      window.visualViewport?.removeEventListener('resize', applyChrome);
      window.visualViewport?.removeEventListener('scroll', applyChrome);
      window.removeEventListener('yat:golden-line-stage', handleStageEvent);
      window.removeEventListener('yat:golden-line-prefill', handlePrefillEvent);
    };
  }, [meta]);

  return (
    <style jsx global>{`
      :root { --row3-h: 100px; --row4-h: 48px; --profile-tabs-h: 68px; --profile-meta-w: 178px; --profile-meta-w-mobile: 136px; }
      html, body { height: 100%; overflow: hidden !important; }
      body { padding-bottom: calc(var(--footerH) + var(--profile-tabs-h) + env(safe-area-inset-bottom, 0px)) !important; }
      main { height: calc(100dvh - var(--row1-h, 40px) - var(--row2-h, 84px) - var(--row3-h) - var(--row4-h) - var(--profile-tabs-h) - var(--footerH, 64px)) !important; min-height: 0 !important; overflow: hidden !important; }
      .yat-row1-shell, .yat-topbar { position: relative !important; z-index: 4100 !important; }
      .yat-row2-shell, .yat-schoolrow { position: relative !important; z-index: 4050 !important; }
      .yat-row3-shell { position: relative !important; z-index: 4000 !important; min-height: var(--row3-h) !important; height: var(--row3-h) !important; overflow: hidden !important; background: #050505 !important; }
      .yat-row3-shell .gallery-strip, .yat-row3-shell .golden-line-strip, .yat-profile-career-strip, .yat-profile-meta-row-host { min-height: var(--row3-h) !important; height: var(--row3-h) !important; max-height: var(--row3-h) !important; overflow: hidden !important; }
      .yat-row4-shell { position: sticky !important; top: calc(var(--row1-h, 40px) + var(--row2-h, 84px) + var(--row3-h)) !important; z-index: 3900 !important; min-height: var(--row4-h) !important; height: var(--row4-h) !important; overflow: hidden !important; background: #050505 !important; }
      .yat-row4-shell #playerCareerStrip { min-height: var(--row4-h) !important; height: var(--row4-h) !important; }
      .pp-funzone-outer, .pp-funzone { height: 100% !important; max-height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
      .pp-fz-panel { height: 100% !important; max-height: 100% !important; overflow-y: auto !important; overflow-x: hidden !important; }
      .yat-profile-career-strip { position: relative; display: grid; grid-template-columns: var(--profile-meta-w) minmax(0, 1fr); background: linear-gradient(90deg, #090909, #111 42%, #050505); border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.12); overflow: hidden; }
      .yat-profile-meta-row-host { width: var(--profile-meta-w); display: block; background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(0,0,0,.92)); border-right: 1px solid rgba(255,255,255,.1); overflow: hidden; }
      .yp-meta-strip { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 8px 10px; color: #fff; text-transform: uppercase; }
      .yp-meta-team { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff; font:900 16px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .yp-meta-sub { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.72); font:800 9px/1 Oswald, sans-serif; letter-spacing:.1em; }
      .pp-fz-tabs-shell { position: fixed !important; left: 0 !important; right: 0 !important; bottom: calc(var(--footerH) + env(safe-area-inset-bottom, 0px)) !important; height: var(--profile-tabs-h) !important; z-index: 10010 !important; display: block !important; visibility: visible !important; opacity: 1 !important; background: rgba(12,12,12,.985) !important; border-top: 1px solid rgba(255,255,255,.12) !important; box-shadow: 0 -10px 26px rgba(0,0,0,.58) !important; }
      .pp-fz-tabs { width: min(100%, 1280px) !important; height: var(--profile-tabs-h) !important; margin: 0 auto !important; display: grid !important; grid-template-columns: repeat(6, minmax(0, 1fr)) !important; align-items: stretch !important; }
      .pp-fz-tab { height: var(--profile-tabs-h) !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 4px !important; min-width: 0 !important; }
      .pp-fz-tab-active { color: #fff !important; }
      .pp-funzone { padding-bottom: calc(var(--profile-tabs-h) + 22px) !important; }
      .pp-fz-panel { scroll-margin-bottom: calc(var(--profile-tabs-h) + var(--footerH) + 24px) !important; }
      .yat-footer { z-index: 10020 !important; }
      .glu-panel { width: min(980px, 100%); margin: 0 auto; padding: 20px 18px 14px; display: grid; grid-template-columns: minmax(220px, 34%) minmax(0, 1fr); gap: 22px; color: #f5f5f5; }
      .glu-explainer { border-left: 4px solid #f5c85a; padding-left: 18px; }
      .glu-kicker { color: #f5c85a; font: 800 11px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
      .glu-explainer h2 { margin: 8px 0 10px; font: 800 clamp(28px, 4vw, 48px)/.92 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
      .glu-explainer p { margin: 0; color: rgba(255,255,255,.72); font: 400 14px/1.45 system-ui, sans-serif; }
      .glu-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px; border: 1px solid rgba(245,200,90,.28); background: rgba(255,255,255,.045); }
      .glu-form label { display: grid; gap: 4px; color: rgba(255,255,255,.72); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      .glu-form input, .glu-form textarea, .glu-form select { width: 100%; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: rgba(0,0,0,.45); color: #fff; padding: 8px; font: 400 13px/1.25 system-ui, sans-serif; }
      .glu-wide, .glu-actions { grid-column: 1 / -1; }
      .glu-preview { width: 100%; aspect-ratio: 7 / 5; border: 1px solid rgba(245,200,90,.4); overflow: hidden; background: #111; display: grid; place-items: center; color: rgba(255,255,255,.45); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      .glu-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .glu-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .glu-actions button { min-height: 38px; padding: 0 16px; border: 1px solid rgba(245,200,90,.75); border-radius: 0; background: rgba(245,200,90,.12); color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
      .glu-actions button:disabled { opacity: .55; cursor: wait; }
      .glu-actions span { color: rgba(255,255,255,.7); font: 700 12px/1.35 system-ui, sans-serif; }
      @media (max-width: 760px) { :root { --row3-h: 100px; --row4-h: 48px; --profile-tabs-h: 72px; --profile-meta-w: var(--profile-meta-w-mobile); } .yp-meta-strip { padding: 6px 8px; } .yp-meta-team { font-size: 13px; } .yp-meta-sub { font-size: 8px; } .glu-panel { grid-template-columns: 1fr; padding-top: 16px; padding-bottom: calc(var(--profile-tabs-h) + 24px); } .glu-form { grid-template-columns: 1fr; } }
    `}</style>
  );
}
