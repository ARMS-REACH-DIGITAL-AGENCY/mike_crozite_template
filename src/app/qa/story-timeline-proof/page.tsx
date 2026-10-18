'use client';

// Deployed only on the isolated QA branch. This route is excluded from the
// release tree. It exercises the real proof with public player context and
// repository images; it has no sign-in, upload, or publishing controls.
import { useCallback, useEffect, useRef, useState } from 'react';
import StoryPreview, { type StoryPlacementState } from '@/components/yatstats/StoryPreview';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PHOTOS = [
  { id: 'qa-photo-1', preview: '/img/contribute/placement-high-school.jpg' },
  { id: 'qa-photo-2', preview: '/img/contribute/placement-action-pics.jpg' },
];

export default function TimelineProofQaPage() {
  const [framed, setFramed] = useState<boolean | null>(null);
  const [month, setMonth] = useState(2);
  const [year, setYear] = useState(2016);
  const [status, setStatus] = useState<StoryPlacementState | null>(null);
  const monthInput = useRef<HTMLSelectElement | null>(null);
  const revision = JSON.stringify(['227792', year, month, PHOTOS.map((photo) => photo.id)]);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const report = useCallback((next: StoryPlacementState) => {
    if (next.revision !== revisionRef.current) return;
    setStatus((old) => old?.revision === next.revision && old.status === next.status ? old : next);
  }, []);
  useEffect(() => { setFramed(new URLSearchParams(window.location.search).get('frame') === '1'); }, []);
  if (framed === null) return <p>Loading timeline proof checks…</p>;
  if (!framed) return <main style={{ padding: 20, background: '#11151b', color: '#fff', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
    <h1>Career Timeline proof checks</h1>
    <p>Actual renderer, public player context, local sample images. QA only.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <section><h2>Desktop drawer</h2><iframe title="Desktop timeline proof" src="?frame=1" width="820" height="1100" style={{ border: 0 }} /></section>
      <section><h2>Phone drawer</h2><iframe title="Phone timeline proof" src="?frame=1" width="360" height="1100" style={{ border: 0 }} /></section>
    </div>
  </main>;
  return <PlayerProfileContextProvider playerId="227792" playerName="Cody Holtz" playerHsid="13562" classOf="2017">
    <main id="drawerStory" style={{ boxSizing: 'border-box', width: 'min(100%, 440px)', margin: '0 auto', padding: 18, background: '#131922', color: '#f4f5f6', minHeight: '100vh', fontFamily: 'Arial, sans-serif', ['--ink' as string]: '#f4f5f6', ['--line' as string]: 'rgba(255,255,255,.2)' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>Career Timeline proof</h1>
      <label>Month <select ref={monthInput} aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} style={{ color: '#111', margin: '0 8px 14px 4px' }}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Year <select aria-label="Year" value={year} onChange={(event) => setYear(Number(event.target.value))} style={{ color: '#111' }}>{Array.from({ length: 68 }, (_, index) => 2027 - index).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <p data-qa-status={status?.revision === revision ? status.status : 'loading'} style={{ margin: '0 0 14px', fontSize: 12 }}>Placement: {status?.revision === revision ? status.status : 'loading'}</p>
      <StoryPreview playerId="227792" playerName="Cody Holtz" photos={PHOTOS} story="A sample memory placed on Cody’s actual Career Timeline. Check the selected year and highlighted month before approving." author="Preview fan" official={false} month={month} year={year} tags={[]} placementRevision={revision} onPlacementStateChange={report} onEditDate={() => { monthInput.current?.scrollIntoView({ block: 'center' }); monthInput.current?.focus({ preventScroll: true }); }} />
    </main>
  </PlayerProfileContextProvider>;
}
