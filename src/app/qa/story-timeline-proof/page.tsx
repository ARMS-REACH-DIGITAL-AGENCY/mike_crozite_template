'use client';

// Isolated QA branch only. The release excludes this route. All context and
// images here are already public; this fixture never uploads or posts a Story.
import { useCallback, useEffect, useRef, useState } from 'react';
import StoryPreview, { type StoryPlacementState } from '@/components/yatstats/StoryPreview';
import PlayerProfileContextProvider from '@/context/PlayerProfileContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CASES = {
  coach: {
    id: 'YAT000072', name: 'Mike Woods', hsid: '5004', classOf: '', year: 2004, month: 5,
    photos: [
      { id: 'qa-coach-2004', preview: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/team-cards/5004/2004.jpg' },
      { id: 'qa-coach-2003', preview: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/team-cards/5004/2003.jpg' },
    ],
  },
  player: {
    id: '227792', name: 'Cody Holtz', hsid: '13562', classOf: '2017', year: 2016, month: 2,
    photos: [
      { id: 'qa-player-then', preview: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then-web/227792.webp' },
      { id: 'qa-player-now', preview: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now-web/227792.webp' },
    ],
  },
};

export default function TimelineProofQaPage() {
  const [framed, setFramed] = useState<boolean | null>(null);
  const [proofCase, setProofCase] = useState<'coach' | 'player'>('coach');
  const [month, setMonth] = useState(5);
  const [year, setYear] = useState(2004);
  const [status, setStatus] = useState<StoryPlacementState | null>(null);
  const monthInput = useRef<HTMLSelectElement | null>(null);
  const person = CASES[proofCase];
  const revision = JSON.stringify([person.id, year, month, person.photos.map((photo) => photo.id)]);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const report = useCallback((next: StoryPlacementState) => {
    if (next.revision !== revisionRef.current) return;
    setStatus((old) => old?.revision === next.revision && old.status === next.status ? old : next);
  }, []);
  useEffect(() => { setFramed(new URLSearchParams(window.location.search).get('frame') === '1'); }, []);
  if (framed === null) return <p>Loading timeline proof checks…</p>;
  if (!framed) return <main style={{ padding: 16, background: '#11151b', color: '#fff', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
    <h1>Career Timeline proof checks</h1>
    <p>Actual renderer and public photos. QA only; no publishing controls.</p>
    <iframe title="Phone timeline proof" src="?frame=1" width="360" height="1100" style={{ border: 0 }} />
  </main>;
  return <PlayerProfileContextProvider playerId={person.id} playerName={person.name} playerHsid={person.hsid} classOf={person.classOf}>
    <main id="drawerStory" style={{ boxSizing: 'border-box', width: 'min(100%, 440px)', margin: '0 auto', padding: 18, background: '#131922', color: '#f4f5f6', minHeight: '100vh', fontFamily: 'Arial, sans-serif', ['--ink' as string]: '#f4f5f6', ['--line' as string]: 'rgba(255,255,255,.2)' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>Career Timeline proof</h1>
      <label>Profile <select aria-label="Profile" value={proofCase} onChange={(event) => {
        const next = event.target.value as 'coach' | 'player';
        setProofCase(next); setYear(CASES[next].year); setMonth(CASES[next].month); setStatus(null);
      }} style={{ color: '#111', marginBottom: 12 }}><option value="coach">Mike Woods · coach</option><option value="player">Cody Holtz · player</option></select></label>
      <div>
        <label>Month <select ref={monthInput} aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} style={{ color: '#111', margin: '0 8px 14px 4px' }}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
        <label>Year <select aria-label="Year" value={year} onChange={(event) => setYear(Number(event.target.value))} style={{ color: '#111' }}>{Array.from({ length: 68 }, (_, index) => 2027 - index).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <p data-qa-status={status?.revision === revision ? status.status : 'loading'} style={{ margin: '0 0 14px', fontSize: 12 }}>Placement: {status?.revision === revision ? status.status : 'loading'}</p>
      <StoryPreview key={person.id} playerId={person.id} playerName={person.name} photos={person.photos} story="Check the selected year, month, and the photo’s position on the actual Career Timeline before approving." author="Preview fan" official={false} month={month} year={year} tags={[]} placementRevision={revision} onPlacementStateChange={report} onEditDate={() => { monthInput.current?.scrollIntoView({ block: 'center' }); monthInput.current?.focus({ preventScroll: true }); }} />
    </main>
  </PlayerProfileContextProvider>;
}
