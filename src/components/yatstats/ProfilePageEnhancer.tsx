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

function normalize(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function teamLabel(meta: ProfileMeta) {
  const status = normalize(meta.statusLabel);
  const affiliation = normalize(meta.teamAffiliationStatus);

  if (affiliation === 'CURRENT' && status === 'ACTIVE') return 'Current Team';
  if (affiliation === 'RETIRED_LAST_KNOWN' || status === 'RETIRED') return 'Last Known Team';
  if (affiliation === 'FORMER') return 'Previous Team';
  return 'Team';
}

function fallbackReturnUrl(meta: ProfileMeta) {
  return `/${encodeURIComponent(meta.hsid)}?view=active&player=${encodeURIComponent(meta.playerId)}#player-${encodeURIComponent(meta.playerId)}`;
}

function buildTimeline(meta: ProfileMeta) {
  const bioBits = [
    meta.statusLabel,
    meta.currentTeamName,
    meta.levelLabel,
    meta.position,
  ].filter(Boolean).join(' · ');

  const ticks = [
    ['Youth', 'Youth Baseball'],
    ['Middle', 'Middle School'],
    ['HS', 'High School'],
    ['College', 'College'],
    ['Minors', 'Minor Leagues'],
    ['MLB', 'Major Leagues'],
  ];

  return `
    <div class="gl-row4" aria-label="Golden Line timeline">
      <div class="gl-row4-bio">
        <span class="gl-row4-name">${esc(meta.displayName || 'Player')}</span>
        <span class="gl-row4-meta">${esc(bioBits || 'Career timeline')}</span>
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
        <p>Add a photo from youth baseball, school ball, college, pro ball, or a fan moment. This is the living scrapbook side of YAT?STATS — the people, places, and memories behind the stats.</p>
      </div>
      <form class="glu-form" id="goldenLineUploadForm">
        <label>Photo stage
          <select name="stage" id="goldenLineStageSelect">
            ${STAGES.map((stage) => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}
          </select>
        </label>
        <label>Your name<input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." /></label>
        <label>Relationship / role<input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." /></label>
        <label>Memory title<input name="title" placeholder="Example: First travel ball tournament" /></label>
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
      window.location.hash = 'ppTab-upload';
    };

    const handleTimelineClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.('[data-gl-stage]') as HTMLElement | null;
      if (!button) return;
      setUploadStage(button.getAttribute('data-gl-stage') || 'Youth Baseball');
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
      if (button) button.disabled = true;
      if (status) status.textContent = 'Uploading memory...';
      try {
        const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Upload failed');
        if (status) status.textContent = 'Uploaded. It is pending review and should appear in the Golden Line after refresh.';
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
      :root { --row3-h: 86px; --row4-h: 42px; }

      .yat-row3-shell { min-height: var(--row3-h) !important; }
      .yat-row3-shell .gallery-strip,
      .yat-row3-shell .golden-line-strip {
        min-height: var(--row3-h) !important;
        height: var(--row3-h) !important;
      }

      .yat-row4-profile-populated {
        display: flex;
        align-items: stretch;
        padding: 0 !important;
        min-height: var(--row4-h);
      }

      .gl-row4 {
        width: 100%;
        height: var(--row4-h);
        display: grid;
        grid-template-columns: minmax(165px, 230px) minmax(0, 1fr);
        align-items: stretch;
        background: #090909;
        border-top: 1px solid rgba(245,200,90,.22);
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .gl-row4-bio {
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        padding: 5px 12px;
        border-right: 1px solid rgba(255,255,255,.1);
        text-transform: uppercase;
      }

      .gl-row4-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #f4f4f4;
        font: 800 16px/1 "Bebas Neue", Oswald, sans-serif;
        letter-spacing: .05em;
      }

      .gl-row4-meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255,255,255,.62);
        font: 700 8px/1 Oswald, sans-serif;
        letter-spacing: .1em;
        margin-top: 3px;
      }

      .gl-row4-scroll {
        position: relative;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        display: grid;
        grid-template-columns: repeat(6, minmax(108px, 1fr));
        align-items: center;
        padding: 0 18px;
      }

      .gl-row4-scroll::-webkit-scrollbar { display: none; }

      .gl-row4-line {
        position: absolute;
        left: 18px;
        right: 18px;
        top: 17px;
        height: 2px;
        background: linear-gradient(90deg, rgba(245,200,90,.1), #f5c85a, rgba(245,200,90,.1));
        box-shadow: 0 0 14px rgba(245,200,90,.38);
      }

      .gl-row4-tick {
        position: relative;
        z-index: 1;
        height: 100%;
        border: 0;
        background: transparent;
        color: #f5c85a;
        cursor: pointer;
        display: grid;
        place-items: start center;
        padding-top: 8px;
        text-transform: uppercase;
      }

      .gl-row4-pin {
        display: block;
        width: 9px;
        height: 9px;
        background: #f5c85a;
        border: 2px solid #0b0b0b;
        box-shadow: 0 0 13px rgba(245,200,90,.75);
      }

      .gl-row4-label {
        margin-top: 5px;
        color: rgba(255,255,255,.9);
        font: 800 10px/1 Oswald, sans-serif;
        letter-spacing: .1em;
      }

      .glu-panel {
        width: min(980px, 100%);
        margin: 0 auto;
        padding: 20px 18px 14px;
        display: grid;
        grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
        gap: 22px;
        color: #f5f5f5;
      }
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

      @media (max-width: 760px) {
        :root { --row3-h: 80px; --row4-h: 40px; }
        .gl-row4 { grid-template-columns: 120px minmax(0, 1fr); }
        .gl-row4-name { font-size: 13px; }
        .gl-row4-meta { display: none; }
        .gl-row4-scroll { grid-template-columns: repeat(6, 92px); }
        .glu-panel { grid-template-columns: 1fr; padding-top: 16px; }
        .glu-form { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
