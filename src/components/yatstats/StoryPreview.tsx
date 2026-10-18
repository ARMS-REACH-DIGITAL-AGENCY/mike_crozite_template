'use client';

// A local proof of the prepared draft, placed on the player's real Career
// Timeline. The timeline reads published context; draft photos remain the
// same browser-memory images used by Post and are never uploaded here.
import { useCallback, useRef, useState } from 'react';
import ZoomableCareerTimeline from '@/components/yatstats/ZoomableCareerTimeline';

export type StoryPlacementState = { revision: string; status: 'loading' | 'ready' | 'error' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function StoryPreview({
  photos, story, author, official, playerId, playerName, month, year, tags,
  placementRevision, onPlacementStateChange, onEditDate, posting = false,
}: {
  photos: { id: string; preview: string }[];
  story: string;
  author: string;
  official: boolean;
  playerId: string;
  playerName: string;
  month: number;
  year: number;
  tags: { playerId: string; displayName: string }[];
  placementRevision: string;
  onPlacementStateChange: (state: StoryPlacementState) => void;
  onEditDate: () => void;
  posting?: boolean;
}) {
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [placementState, setPlacementState] = useState<StoryPlacementState | null>(null);
  const [timelineAttempt, setTimelineAttempt] = useState(0);
  const revisionRef = useRef(placementRevision);
  revisionRef.current = placementRevision;
  const reportPlacementState = useCallback((state: StoryPlacementState) => {
    if (state.revision !== revisionRef.current) return;
    setPlacementState((previous) => previous?.revision === state.revision && previous.status === state.status ? previous : state);
    onPlacementStateChange(state);
  }, [onPlacementStateChange]);
  const activeIndex = Math.max(0, photos.findIndex((photo) => photo.id === activePhotoId));
  const photo = photos[activeIndex];
  if (!photo) return null;

  const initials = author.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const when = `${MONTHS[month - 1]} ${year}`;
  const placementStatus = placementState?.revision === placementRevision ? placementState.status : 'loading';
  const stepPhoto = (step: number) => setActivePhotoId(photos[(activeIndex + step + photos.length) % photos.length].id);

  return (
    <div className="ysdp-proof" aria-label="Story preview">
      <section className="ysdp-timeline-proof" aria-label={`${playerName}'s Career Timeline preview`}>
        <div className="ysdp-timeline-heading">
          <div>
            <div className="ysdp-where-title">{playerName}&apos;s Career Timeline</div>
            <strong className="ysdp-placement-date">{when}</strong>
          </div>
          <button type="button" className="ysdp-change-date" onClick={onEditDate} disabled={posting}>Change date</button>
        </div>
        <div className="ysdp-timeline-frame" aria-busy={placementStatus === 'loading'}>
          <ZoomableCareerTimeline
            key={`${playerId}:${timelineAttempt}`}
            playerId={playerId}
            preview={{
              year, month, revision: placementRevision,
              photos: photos.map((item) => ({ id: item.id, url: item.preview })),
              activePhotoId: photo.id,
              onStateChange: reportPlacementState,
            }}
          />
        </div>
        <div className="ysdp-placement-note" role="status">
          {placementStatus === 'error' ? (
            <>Couldn&apos;t load the timeline. <button type="button" className="ysdp-retry" disabled={posting} onClick={() => {
              reportPlacementState({ revision: placementRevision, status: 'loading' });
              setTimelineAttempt((attempt) => attempt + 1);
            }}>Retry preview</button></>
          ) : placementStatus === 'ready'
            ? <>Check the highlighted month and your photo on the timeline. Use Change date if this belongs elsewhere.</>
            : <>Positioning your photo in {when}…</>}
        </div>
      </section>

      <article className="ysdp-card">
        <div className="ysdp-header">
          {official ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ysdp-avatar ysdp-crest" src="/img/ys-crest.png" alt="" aria-hidden="true" />
          ) : <span className="ysdp-avatar" aria-hidden="true">{initials}</span>}
          <div className="ysdp-who">
            <div className="ysdp-author"><strong>{author}</strong>{tags.length ? <> is with {tags.map((tag, index) => <span key={tag.playerId}>{index ? (index === tags.length - 1 ? ' and ' : ', ') : ''}<strong>{tag.displayName}</strong></span>)}</> : null}.</div>
            <div className="ysdp-date">{when}</div>
          </div>
        </div>

        <p className="ysdp-story">{story.trim()}</p>

        <figure className="ysdp-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt={`Photo ${activeIndex + 1} of ${photos.length} in your story`} />
          <figcaption>
            {photos.length > 1 ? <button type="button" className="ysdp-step" onClick={() => stepPhoto(-1)} aria-label="Previous preview photo"><i className="ri-arrow-left-s-line" aria-hidden="true" /></button> : null}
            <span aria-live="polite">Photo {activeIndex + 1} of {photos.length}</span>
            {photos.length > 1 ? <button type="button" className="ysdp-step" onClick={() => stepPhoto(1)} aria-label="Next preview photo"><i className="ri-arrow-right-s-line" aria-hidden="true" /></button> : null}
          </figcaption>
        </figure>

        {photos.length > 1 ? (
          <div className="ysdp-thumbnails" aria-label="Preview photos">
            {photos.map((item, index) => (
              <button type="button" key={item.id} className={index === activeIndex ? 'is-active' : ''} aria-label={`Preview photo ${index + 1}`} aria-pressed={index === activeIndex} onClick={() => setActivePhotoId(item.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </article>

      <div className="ysdp-where">
        <div className="ysdp-where-title">This story will appear:</div>
        <ul>
          <li>In {playerName}&apos;s Stories.</li>
          <li>On {playerName}&apos;s Career Timeline in {when}.</li>
          {tags.length ? <li>Also in the Stories and Career Timelines of {tags.map((tag) => tag.displayName).join(', ')}.</li> : null}
        </ul>
      </div>

      <style jsx global>{`
        #drawerStory .ysdp-proof { display:flex; flex-direction:column; gap:12px; width:100%; min-width:0; font-family:var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-timeline-proof { display:flex; flex-direction:column; gap:10px; min-width:0; }
        #drawerStory .ysdp-timeline-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-width:0; }
        #drawerStory .ysdp-timeline-heading > div { min-width:0; overflow-wrap:anywhere; }
        #drawerStory .ysdp-placement-date { display:block; color:var(--ink); font:700 18px/1.25 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-change-date { flex-shrink:0; padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--ink); font:600 12px/1.3 var(--yat-font-ui, Archivo, Arial, sans-serif); cursor:pointer; }
        #drawerStory .ysdp-timeline-frame { position:relative; width:100%; min-width:0; overflow:hidden; border:1px solid var(--line); border-radius:8px; background:#040506; }
        #drawerStory .ysdp-placement-note { font:400 12px/1.45 var(--yat-font-ui, Archivo, Arial, sans-serif); overflow-wrap:anywhere; }
        #drawerStory .ysdp-retry { margin:0; padding:0; border:0; background:none; color:inherit; text-decoration:underline; font:600 12px/1.45 var(--yat-font-ui, Archivo, Arial, sans-serif); cursor:pointer; }
        #drawerStory .ysdp-change-date:focus-visible, #drawerStory .ysdp-retry:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
        #drawerStory .ysdp-change-date:disabled, #drawerStory .ysdp-retry:disabled { cursor:default; opacity:.55; }
        #drawerStory .ysdp-card { display:flex; flex-direction:column; gap:12px; min-width:0; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--card-bg, rgba(255,255,255,.025)); color:var(--ink); }
        #drawerStory .ysdp-header { display:flex; align-items:center; gap:9px; min-width:0; }
        #drawerStory .ysdp-avatar { display:flex; align-items:center; justify-content:center; flex:0 0 36px; width:36px; height:36px; border:1px solid var(--line); border-radius:50%; background:var(--line); font:700 13px/1 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-crest { object-fit:contain; padding:4px; }
        #drawerStory .ysdp-who { min-width:0; overflow-wrap:anywhere; }
        #drawerStory .ysdp-author { font:400 13px/1.4 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-author strong { font-weight:700; }
        #drawerStory .ysdp-date { margin-top:2px; font:400 12px/1.35 var(--yat-font-ui, Archivo, Arial, sans-serif); opacity:.65; }
        #drawerStory .ysdp-story { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font:400 14px/1.5 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-photo { margin:0; min-width:0; }
        #drawerStory .ysdp-photo > img { display:block; width:100%; height:clamp(240px,70vw,380px); object-fit:contain; border-radius:6px; background:rgba(0,0,0,.12); }
        #drawerStory .ysdp-photo figcaption { display:flex; align-items:center; justify-content:center; gap:12px; min-height:40px; margin-top:4px; font:400 12px/1.3 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysdp-step { display:flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0; border:1px solid var(--line); border-radius:6px; background:transparent; color:inherit; font-size:22px; cursor:pointer; }
        #drawerStory .ysdp-thumbnails { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
        #drawerStory .ysdp-thumbnails button { display:block; width:100%; aspect-ratio:1; padding:2px; overflow:hidden; border:2px solid transparent; border-radius:6px; background:var(--line); cursor:pointer; }
        #drawerStory .ysdp-thumbnails button.is-active { border-color:#FFD700; }
        #drawerStory .ysdp-thumbnails img { display:block; width:100%; height:100%; border-radius:3px; object-fit:cover; }
        #drawerStory .ysdp-step:focus-visible, #drawerStory .ysdp-thumbnails button:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
        #drawerStory .ysdp-where-title { margin-bottom:6px; font:700 13px/1.2 var(--yat-font-compact, "Barlow Condensed", "Arial Narrow", sans-serif); letter-spacing:.06em; text-transform:uppercase; }
        #drawerStory .ysdp-where ul { margin:0; padding-left:18px; font:400 12px/1.5 var(--yat-font-ui, Archivo, Arial, sans-serif); overflow-wrap:anywhere; }
      `}</style>
    </div>
  );
}
