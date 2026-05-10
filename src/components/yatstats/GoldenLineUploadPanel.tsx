'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const STAGE_OPTIONS = [
  'Youth Baseball',
  'Middle School',
  'High School',
  'College',
  'Minor Leagues',
  'Major Leagues',
  'Fan Memory',
];

export default function GoldenLineUploadPanel() {
  const playerProfile = usePlayerProfile();
  const playerId = String(playerProfile?.playerId || '').trim();
  const hsid = String(playerProfile?.playerHsid || '').trim();
  const playerName = String(playerProfile?.playerName || 'this player').trim();
  const firstName = playerName.split(' ')[0] || 'this player';

  const [stage, setStage] = useState('Youth Baseball');
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const updateStage = () => {
      try {
        const saved = sessionStorage.getItem('yat:goldenLineStage');
        if (saved && STAGE_OPTIONS.includes(saved)) setStage(saved);
      } catch {}
    };

    updateStage();
    window.addEventListener('yat:golden-line-stage', updateStage);
    return () => window.removeEventListener('yat:golden-line-stage', updateStage);
  }, []);

  function handlePreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl('');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('playerId', playerId);
    formData.set('hsid', hsid);
    formData.set('stage', stage);

    setIsUploading(true);
    setUploadStatus('Uploading memory...');

    try {
      const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setUploadStatus('Uploaded. It is pending review and should appear in the Golden Line after refresh.');
      form.reset();
      setPreviewUrl('');
      window.dispatchEvent(new CustomEvent('yat:golden-line-uploaded', { detail: data.moment }));
    } catch (error: any) {
      setUploadStatus(error?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="glu-panel">
      <div className="glu-explainer">
        <div className="glu-kicker">The Golden Line</div>
        <h2>Upload a memory from {firstName}&apos;s baseball journey.</h2>
        <p>
          Add a photo from youth baseball, school ball, college, pro ball, or a fan moment.
          This is the living scrapbook side of YAT?STATS — the people, places, and memories behind the stats.
        </p>
      </div>

      <form className="glu-form" onSubmit={handleSubmit}>
        <label>
          Photo stage
          <select name="stage" value={stage} onChange={(event) => setStage(event.target.value)}>
            {STAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label>
          Your name
          <input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." />
        </label>

        <label>
          Relationship / role
          <input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." />
        </label>

        <label>
          Memory title
          <input name="title" placeholder="Example: First travel ball tournament" />
        </label>

        <label className="glu-wide">
          Caption / memory
          <textarea name="caption" rows={3} placeholder="I remember this because..." />
        </label>

        <label>
          Upload photo
          <input name="photo" type="file" accept="image/*" required onChange={handlePreview} />
        </label>

        {previewUrl && (
          <div className="glu-preview">
            <img src={previewUrl} alt="Selected upload preview" />
          </div>
        )}

        <div className="glu-actions">
          <button type="submit" disabled={isUploading || !playerId}>{isUploading ? 'Uploading...' : 'Submit Memory'}</button>
          <span>{uploadStatus || 'Submitted photos are saved as pending memories.'}</span>
        </div>
      </form>

      <style jsx>{`
        .glu-panel {
          width: min(980px, 100%);
          margin: 0 auto;
          padding: 28px 18px 18px;
          display: grid;
          grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
          gap: 22px;
          color: #f5f5f5;
        }
        .glu-explainer { border-left: 4px solid #f5c85a; padding-left: 18px; }
        .glu-kicker { color: #f5c85a; font: 800 11px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
        .glu-explainer h2 { margin: 8px 0 10px; font: 800 clamp(28px, 4vw, 48px)/.92 'Bebas Neue', Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .glu-explainer p { margin: 0; color: rgba(255,255,255,.72); font: 400 14px/1.45 system-ui, sans-serif; }
        .glu-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px; border: 1px solid rgba(245,200,90,.28); background: rgba(255,255,255,.045); }
        .glu-form label { display: grid; gap: 4px; color: rgba(255,255,255,.72); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        .glu-form input, .glu-form textarea, .glu-form select { width: 100%; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: rgba(0,0,0,.45); color: #fff; padding: 8px; font: 400 13px/1.25 system-ui, sans-serif; }
        .glu-wide, .glu-actions { grid-column: 1 / -1; }
        .glu-preview { width: 100%; aspect-ratio: 7 / 5; border: 1px solid rgba(245,200,90,.4); overflow: hidden; background: #111; }
        .glu-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .glu-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .glu-actions button { min-height: 38px; padding: 0 16px; border: 1px solid rgba(245,200,90,.75); border-radius: 0; background: rgba(245,200,90,.12); color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
        .glu-actions button:disabled { opacity: .55; cursor: wait; }
        .glu-actions span { color: rgba(255,255,255,.7); font: 700 12px/1.35 system-ui, sans-serif; }
        @media (max-width: 760px) { .glu-panel { grid-template-columns: 1fr; padding-top: 18px; } .glu-form { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
