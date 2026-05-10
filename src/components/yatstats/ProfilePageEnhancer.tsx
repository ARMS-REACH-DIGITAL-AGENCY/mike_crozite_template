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

function buildTimeline(meta: ProfileMeta) {
  const primary = [meta.currentTeamName, meta.levelLabel, meta.statusLabel].filter(Boolean).join(' · ');
  const secondary = [meta.position, meta.batsThrows, meta.heightWeight || meta.classOf].filter(Boolean).join(' · ');

  const ticks = [
    ['Youth', 'Youth Baseball'],
    ['Middle', 'Middle School'],
    ['HS', 'High School'],
    ['College', 'College'],
    ['Minors', 'Minor Leagues'],
    ['MLB', 'Major Leagues'],
  ];

  return `
    <div class="gl-row4" aria-label="Golden Line timeline navigation">
      <div class="gl-row4-bio" aria-label="Player bio snapshot">
        <span class="gl-bio-main">${esc(primary || 'Career Snapshot')}</span>
        <span class="gl-bio-sub">${esc(secondary || 'Golden Line')}</span>
      </div>
      <div class="gl-row4-scroll">
        <div class="gl-row4-line" aria-hidden="true"></div>
        ${ticks.map(([shortLabel, stage], idx) => `
          <button class="gl-row4-tick gl-row4-tick-${idx}" type="button" data-gl-stage="${esc(stage)}">
            <span class="gl-row4-pin"></span>
            <span class="gl-row4-label">${esc(shortLabel)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
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
        <label>Photo stage
          <select name="stage" id="goldenLineStageSelect">
            ${STAGES.map((stage) => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}
          </select>
        </label>
        <label>Date photo was taken<input name="photoTakenDate" type="date" /></label>
        <label>Your name<input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." /></label>
        <label>Email for review updates<input name="contributorEmail" type="email" placeholder="you@example.com" /></label>
        <label>Phone / text optional<input name="contributorPhone" type="tel" placeholder="Optional" /></label>
        <label>Relationship / role<input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." /></label>
        <label class="glu-wide">Memory title<input name="title" placeholder="Example: First travel ball tournament" /></label>
        <label class="glu-wide">Caption / memory<textarea name="caption" rows="3" placeholder="I remember this because..."></textarea></label>
        <label>Upload photo<input name="photo" id="goldenLinePhotoInput" type="file" accept="image/*" required /></label>
        <div class="glu-preview" id="goldenLinePreview"><span>Selected photo preview</span></div>
        <div class="glu-actions">
          <button type="submit">Submit Memory</button>
          <span id="goldenLineUploadStatus">Submitted photos are saved as pending memories.</span>
        </div>
      </form>
    </div>
  `;
}

export default function ProfilePageEnhancer({ meta }: { meta: ProfileMeta }) {
  useEffect(() => {
    const row4 = document.querySelector('.yat-row4-shell') as HTMLElement | null;
    if (row4) {
      row4.innerHTML = buildTimeline(meta);
      row4.classList.add('yat-row4-profile-populated', 'yat-row4-golden-line');
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

    const setUploadStage = (stage: string) => {
      try {
        sessionStorage.setItem('yat:goldenLineStage', stage);
        window.dispatchEvent(new CustomEvent('yat:golden-line-stage'));
      } catch {}
      const select = document.querySelector('#goldenLineStageSelect') as HTMLSelectElement | null;
      if (select) select.value = stage;
    };

    const handleTimelineClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.('[data-gl-stage]') as HTMLElement | null;
      if (!button) return;
      const stage = button.getAttribute('data-gl-stage') || 'Youth Baseball';
      setUploadStage(stage);
      window.dispatchEvent(new CustomEvent('yat:golden-line-scroll-stage', { detail: { stage } }));
    };

    const handleStageEvent = () => {
      try {
        const stage = sessionStorage.getItem('yat:goldenLineStage') || 'Youth Baseball';
        const select = document.querySelector('#goldenLineStageSelect') as HTMLSelectElement | null;
        if (select) select.value = stage;
      } catch {}
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
      formData.set('playerId', meta.playerId);
      formData.set('hsid', meta.hsid);
      formData.set('playerName', meta.displayName || '');
      formData.set('pageUrl', window.location.href);
      if (button) button.disabled = true;
      if (status) status.textContent = 'Uploading memory and notifying ARMS...';
      try {
        const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Upload failed');
        const sync = data?.moment?.arms_sync_status;
        if (status) status.textContent = sync === 'failed'
          ? 'Saved for review. ARMS sync needs attention.'
          : 'Uploaded. It is pending review and was queued for ARMS.';
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

    document.addEventListener('click', handleTimelineClick);
    document.addEventListener('change', handlePreview);
    document.addEventListener('submit', handleSubmit);
    window.addEventListener('yat:golden-line-stage', handleStageEvent);
    handleStageEvent();

    return () => {
      document.removeEventListener('click', handleTimelineClick);
      document.removeEventListener('change', handlePreview);
      document.removeEventListener('submit', handleSubmit);
      window.removeEventListener('yat:golden-line-stage', handleStageEvent);
    };
  }, [meta]);

  return (
    <style jsx global>{`
      :root { --row3-h: 86px; --row4-h: 52px; }
      .yat-row3-shell { min-height: var(--row3-h) !important; }
      .yat-row3-shell .gallery-strip, .yat-row3-shell .golden-line-strip { min-height: var(--row3-h) !important; height: var(--row3-h) !important; }
      .yat-row4-profile-populated { display: flex; align-items: stretch; padding: 0 !important; min-height: var(--row4-h); }
      .gl-row4 { width: 100%; height: var(--row4-h); display: grid; grid-template-columns: minmax(188px, 260px) minmax(0, 1fr); align-items: stretch; background: #090909; border-top: 1px solid rgba(245,200,90,.22); border-bottom: 1px solid rgba(255,255,255,.08); }
      .gl-row4-bio { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 6px 12px; border-right: 1px solid rgba(255,255,255,.1); text-transform: uppercase; background: linear-gradient(90deg, rgba(245,200,90,.05), transparent); }
      .gl-bio-main { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f4f4f4; font:800 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.05em; }
      .gl-bio-sub { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.68); font:700 9px/1 Oswald, sans-serif; letter-spacing:.1em; }
      .gl-row4-scroll { position: relative; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; display: grid; grid-template-columns: repeat(6, minmax(108px, 1fr)); align-items: center; padding: 0 18px; }
      .gl-row4-scroll::-webkit-scrollbar { display: none; }
      .gl-row4-line { position: absolute; left: 18px; right: 18px; top: 20px; height: 2px; background: linear-gradient(90deg, rgba(245,200,90,.1), #f5c85a, rgba(245,200,90,.1)); box-shadow: 0 0 14px rgba(245,200,90,.38); }
      .gl-row4-tick { position: relative; z-index: 1; height: 100%; border: 0; background: transparent; color: #f5c85a; cursor: pointer; display: grid; place-items: start center; padding-top: 11px; text-transform: uppercase; }
      .gl-row4-pin { display: block; width: 9px; height: 9px; background: #f5c85a; border: 2px solid #0b0b0b; box-shadow: 0 0 13px rgba(245,200,90,.75); }
      .gl-row4-label { margin-top: 6px; color: rgba(255,255,255,.9); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .1em; }
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
      @media (max-width: 760px) { :root { --row3-h: 80px; --row4-h: 52px; } .gl-row4 { grid-template-columns: 118px minmax(0, 1fr); } .gl-row4-bio { padding: 5px 8px; gap: 4px; } .gl-bio-main { font-size: 13px; } .gl-bio-sub { font-size: 8px; } .gl-row4-scroll { grid-template-columns: repeat(6, 92px); } .glu-panel { grid-template-columns: 1fr; padding-top: 16px; } .glu-form { grid-template-columns: 1fr; } }
    `}</style>
  );
}
