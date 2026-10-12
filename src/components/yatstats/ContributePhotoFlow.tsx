'use client';

// The Photos drawer, in the order a fan thinks about a photo:
//   1. Select the picture (they're looking at it while they answer)
//   2. Who's in it - tag one or more players; the first is the main one
//   3. What's it for - flip card front, headshot, card back, a timeline
//      slide, a school or team logo, or something else
//   4. Only when it matters: which season (a timeline slide), which team
//      (a team logo) or which school (a school logo)
//   5. Line it up in the frame it will have on the site, with its guides
// Then the proof - exactly where it will go - and only then is it sent.
// It's checked automatically when it arrives (lib/contributeModeration).

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import FanConfirm from '@/components/yatstats/FanConfirm';
import PhotoCropper from '@/components/yatstats/PhotoCropper';
import ContributeProof from '@/components/yatstats/ContributeProof';
import ContributeSearch from '@/components/yatstats/ContributeSearch';
import { shrinkPhoto } from '@/lib/shrinkPhoto';
import {
  CONTRIBUTE_MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  type ContributePlayer,
  type ContributeSchool,
  type Crop,
  type PhotoPurpose,
  type Season,
} from '@/lib/contribute';

const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const CREST_FALLBACK = '/img/school-placeholder.png';
const THIS_YEAR = new Date().getFullYear();

type Info = { name: string; classOf: number | null; profileUrl: string | null };
type Stage = 'form' | 'proof' | 'sending' | 'done';
type Result = { outcome: 'approved' | 'rejected' | 'pending'; message: string };

export default function ContributePhotoFlow({
  hubSchool,
  signedIn,
  email,
  initialPlayer,
  initialType,
  onSignIn,
  onClose,
}: {
  hubSchool: ContributeSchool | null;
  signedIn: boolean;
  email?: string;
  initialPlayer?: ContributePlayer | null;
  initialType?: PhotoPurpose;
  onSignIn: () => void;
  onClose: () => void;
}) {
  // 1. The picture
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  // 2. Who's in it (the first is the main player)
  const [tagged, setTagged] = useState<ContributePlayer[]>(initialPlayer ? [initialPlayer] : []);
  const [adding, setAdding] = useState(false);
  // The main player's seasons
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const seasonRequest = useRef(0);
  // 3. What it's for, 4. the season / team / school
  const [purpose, setPurpose] = useState<PhotoPurpose | null>(initialType || null);
  const [seasonKey, setSeasonKey] = useState('');
  const [teamId, setTeamId] = useState('');
  const [school, setSchool] = useState<ContributeSchool | null>(hubSchool);
  // 5. Placement
  const [landscape, setLandscape] = useState(false);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [note, setNote] = useState('');
  // Sending
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const main = tagged[0] || null;
  const type = PHOTO_TYPES.find((t) => t.id === purpose) || null;
  const season = seasons?.find((s) => s.key === seasonKey) || null;
  const current = seasons?.find((s) => s.current) || null;
  const aspect = type?.aspects ? (type.aspects.length > 1 && landscape ? type.aspects[1] : type.aspects[0]) : null;

  const loadSeasons = useCallback((p: ContributePlayer | null) => {
    const request = ++seasonRequest.current;
    setSeasons(null); setInfo(null); setSeasonKey(''); setTeamId('');
    if (!p?.playerId) return;
    fetch(`/api/contribute/seasons?playerId=${encodeURIComponent(p.playerId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (request !== seasonRequest.current) return;
        setSeasons(Array.isArray(body?.seasons) ? body.seasons : []);
        setInfo(body?.player ? { name: body.player.name, classOf: body.player.classOf, profileUrl: body.player.profileUrl } : null);
      })
      .catch(() => { if (request === seasonRequest.current) setSeasons([]); });
  }, []);

  // The player the drawer was opened for.
  const loadedFor = useRef('');
  useEffect(() => {
    if (initialPlayer?.playerId && loadedFor.current !== initialPlayer.playerId) {
      loadedFor.current = initialPlayer.playerId;
      loadSeasons(initialPlayer);
    }
  }, [initialPlayer, loadSeasons]);

  const setMain = (list: ContributePlayer[]) => {
    const before = tagged[0]?.playerId;
    setTagged(list);
    if (list[0]?.playerId !== before) {
      loadSeasons(list[0] || null);
      if (list[0]?.schoolId) setSchool({ hsid: list[0].schoolId, name: list[0].schoolName || '' });
    }
  };
  const addTag = (p: ContributePlayer) => {
    if (!tagged.some((t) => t.playerId === p.playerId)) setMain([...tagged, p]);
    setAdding(false);
  };
  const removeTag = (id: string) => setMain(tagged.filter((t) => t.playerId !== id));
  const makeMain = (id: string) => {
    const p = tagged.find((t) => t.playerId === id);
    if (p) setMain([p, ...tagged.filter((t) => t.playerId !== id)]);
  };

  const pickFile = (files: FileList | null) => {
    const f = files?.[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCrop(null);
    setError('');
  };

  const choosePurpose = (id: PhotoPurpose) => {
    setPurpose(id);
    setCrop(null);
    setLandscape(false);
    setError('');
  };

  // The teams the main player played for (for a team logo).
  const teams = Array.from(new Map((seasons || []).filter((s) => s.teamId && s.stage !== 'hs').map((s) => [s.teamId!, s.team])).entries());

  const yearToSend = (): number | null => {
    if (!type) return null;
    if (type.id === 'flip_card') return info?.classOf || THIS_YEAR;
    if (type.id === 'headshot' || type.id === 'back_hero') return current?.year || THIS_YEAR;
    if (type.asks === 'season') return season?.year || (type.id === 'other_photo' ? THIS_YEAR : null);
    return THIS_YEAR;
  };

  const problem = (): string | null => {
    if (!file) return 'Select the picture.';
    if (!type) return "Pick what it's for.";
    if (type.needsPlayer && !main) return "Tag who's in the picture.";
    if (type.id === 'timeline_hero' && !season) return 'Pick the season.';
    if (type.asks === 'team' && !teamId) return 'Pick the team.';
    if (type.asks === 'school' && !school) return 'Pick the high school.';
    return null;
  };

  const preview_ = () => {
    if (!signedIn) return onSignIn();
    const p = problem();
    if (p) return setError(p);
    setError('');
    setStage('proof');
  };

  const send = async () => {
    if (!file || !type) return;
    setStage('sending');
    setError('');
    try {
      await auth.authStateReady?.();
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
      const isLogo = type.id === 'school_logo' || type.id === 'team_logo';
      // Logos keep their transparency; phone photos are shrunk first (same
      // proportions, so the placement still lines up).
      const blob = isLogo && file.size <= CONTRIBUTE_MAX_PHOTO_BYTES ? file : await shrinkPhoto(file);
      const form = new FormData();
      if (token) form.set('idToken', token);
      form.set('photo', blob, file.name);
      form.set('purpose', type.id);
      form.set('year', String(yearToSend() || THIS_YEAR));
      form.set('playerId', type.id === 'school_logo' || type.id === 'team_logo' ? '' : main?.playerId || '');
      form.set('playerName', main?.displayName || '');
      form.set('hsid', (type.id === 'school_logo' ? school?.hsid : main?.schoolId || school?.hsid || hubSchool?.hsid) || '');
      form.set('tagged', JSON.stringify(tagged.map((t) => t.playerId)));
      if (season && type.asks === 'season') form.set('season', JSON.stringify({ team: season.team, level: season.level, label: season.label }));
      if (type.asks === 'team') form.set('teamId', teamId);
      if (crop && aspect) form.set('crop', JSON.stringify(crop));
      if (type.id === 'timeline_hero' && landscape) form.set('landscape', '1');
      form.set('note', note.trim());
      form.set('pageUrl', window.location.href);
      const res = await fetch('/api/contribute/photo', { method: 'POST', body: form, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStage('proof');
        setConfirm(true);
        return;
      }
      if (!res.ok) throw new Error(body?.error || 'Your photo could not be sent.');
      const outcome: Result['outcome'] = body?.status === 'approved' || body?.status === 'rejected' ? body.status : 'pending';
      setResult({ outcome, message: body?.message || 'Thanks!' });
      setStage('done');
    } catch (e) {
      setStage('proof');
      setError(e instanceof Error ? e.message : 'Your photo could not be sent.');
    }
  };

  const startOver = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(''); setPurpose(null); setCrop(null); setNote('');
    setSeasonKey(''); setTeamId(''); setLandscape(false);
    setResult(null); setError(''); setConfirm(false); setStage('form');
  };

  // ---- Done --------------------------------------------------------------
  if (stage === 'done' && result) {
    return (
      <div className="ypf-done">
        <div className={`ypf-done-title is-${result.outcome}`}>
          {result.outcome === 'approved' ? 'It’s on the site!' : result.outcome === 'rejected' ? 'We can’t use this one' : 'Thank you!'}
        </div>
        <p>{result.message}</p>
        <div className="ycd-actions">
          {result.outcome === 'rejected' ? (
            <button type="button" className="ycd-btn ycd-btn-primary" onClick={() => { setStage('form'); setResult(null); fileInput.current?.click(); }}>Choose a different photo</button>
          ) : (
            <button type="button" className="ycd-btn ycd-btn-primary" onClick={startOver}>Send another photo</button>
          )}
          <button type="button" className="ycd-btn" onClick={onClose}>Done</button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files)} />
      </div>
    );
  }

  // ---- Proof -------------------------------------------------------------
  if ((stage === 'proof' || stage === 'sending') && type && preview) {
    return (
      <div className="ycd-proof">
        <div className="ycd-proof-head">Check before you send</div>
        <p className="ycd-muted ycd-small">Here&apos;s exactly where your photo will go. If anything looks wrong, go back and change it.</p>
        <div className="ycd-proof-item">
          <div className="ycd-label"><b>{type.prefix}</b> · {type.label}</div>
          <ContributeProof
            purpose={type.id}
            src={preview}
            crop={aspect ? crop : null}
            landscape={landscape}
            season={type.asks === 'season' ? season : current}
            teamName={type.asks === 'team' ? teams.find(([id]) => id === teamId)?.[1] || '' : ''}
            teamId={type.asks === 'team' ? teamId : ''}
            tagged={tagged.map((t) => t.displayName)}
            player={{
              name: info?.name || main?.displayName || '',
              classOf: info?.classOf ?? null,
              currentTeam: current?.team || '',
              schoolName: type.id === 'school_logo' ? school?.name || '' : main?.schoolName || school?.name || '',
              schoolLocation: school?.location || hubSchool?.location || '',
            }}
          />
        </div>
        {confirm ? <FanConfirm email={email} onConfirmed={() => { setConfirm(false); void send(); }} /> : null}
        {error ? <div className="ycd-error">{error}</div> : null}
        <div className="ycd-actions">
          <button type="button" className="ycd-btn ycd-btn-primary" onClick={() => { void send(); }} disabled={stage === 'sending'}>
            {stage === 'sending' ? 'Checking your photo…' : 'Looks right, send it'}
          </button>
          <button type="button" className="ycd-btn" onClick={() => setStage('form')} disabled={stage === 'sending'}>Go back</button>
        </div>
      </div>
    );
  }

  // ---- The form ----------------------------------------------------------
  return (
    <div className="ycd-main">
      {/* 1. The picture, and 5. placing it */}
      <div className="ycd-col">
        <div className="ycd-label"><span className="ycd-step">1</span> Select the picture</div>
        {!file ? (
          <button type="button" className="ypf-drop" onClick={() => fileInput.current?.click()}>
            <i className="ri-image-add-line" aria-hidden="true" />
            <span>Select the picture</span>
            <small>A photo from your phone or computer</small>
          </button>
        ) : (
          <div className="ypf-photo">
            {type && aspect ? (
              <>
                <div className="ycd-label"><span className="ycd-step">5</span> Line it up</div>
                {type.aspects && type.aspects.length > 1 ? (
                  <div className="ycd-switch" role="radiogroup" aria-label="Orientation">
                    <button type="button" role="radio" aria-checked={!landscape} className={!landscape ? 'is-on' : ''} onClick={() => { setLandscape(false); setCrop(null); }}>Tall 5x7</button>
                    <button type="button" role="radio" aria-checked={landscape} className={landscape ? 'is-on' : ''} onClick={() => { setLandscape(true); setCrop(null); }}>Wide 7x5</button>
                  </div>
                ) : null}
                <PhotoCropper key={`${type.id}-${landscape}`} src={preview} aspect={aspect} guide={type.guide} onChange={setCrop} />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={`ypf-picked${type && !type.aspects && type.id !== 'other_photo' ? ' is-logo' : ''}`} src={preview} alt="" />
            )}
            <button type="button" className="ycd-link ycd-small" onClick={() => fileInput.current?.click()}>Choose a different picture</button>
          </div>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files)} />
      </div>

      <div className="ycd-col">
        {/* 2. Who's in it */}
        <div className="ycd-field">
          <div className="ycd-label"><span className="ycd-step">2</span> Who&apos;s in the picture?</div>
          {tagged.length ? (
            <div className="ypf-tags">
              {tagged.map((t, i) => (
                <span className={`ypf-tag${i === 0 ? ' is-main' : ''}`} key={t.playerId}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${S3}/players/now/${encodeURIComponent(t.playerId)}.jpg`} alt="" onError={(e) => { e.currentTarget.src = '/img/headshot-silhouette.png'; }} />
                  <span><b>{t.displayName}</b>{i === 0 ? <small>Main player</small> : <button type="button" className="ycd-link" onClick={() => makeMain(t.playerId)}>Make main</button>}</span>
                  <button type="button" className="ypf-tag-x" onClick={() => removeTag(t.playerId)} aria-label={`Remove ${t.displayName}`}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          {!tagged.length || adding ? (
            <ContributeSearch onPlayer={addTag} />
          ) : (
            <button type="button" className="ycd-link ycd-small" onClick={() => setAdding(true)}>+ Tag someone else</button>
          )}
          {!tagged.length ? <div className="ycd-muted ycd-small">A logo? You can skip this.</div> : null}
        </div>

        {/* 3. What it's for */}
        <div className="ycd-field">
          <div className="ycd-label"><span className="ycd-step">3</span> What&apos;s it for?</div>
          <div className="ypf-types" role="radiogroup" aria-label="What it's for">
            {PHOTO_TYPES.map((t) => {
              const blocked = t.needsPlayer && !main;
              return (
                <label className={`ypf-type${purpose === t.id ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`} key={t.id}>
                  <input type="radio" name="ypf-type" checked={purpose === t.id} disabled={blocked} onChange={() => choosePurpose(t.id)} />
                  <span><b>{t.prefix}</b> · {t.label}{purpose === t.id ? <small>{t.spec}</small> : blocked ? <small>Tag him first.</small> : null}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 4. Season / team / school, when it matters */}
        {type?.asks === 'season' && main ? (
          <div className="ycd-field">
            <div className="ycd-label"><span className="ycd-step">4</span> Which season{type.id === 'other_photo' ? ' (if you know)' : ''}?</div>
            {!seasons ? <div className="ycd-muted ycd-small">Loading his seasons…</div>
              : !seasons.length ? <div className="ycd-muted ycd-small">We don&apos;t have his seasons yet. Tell us in the note below.</div>
              : (
                <div className="ycd-seasons" role="listbox" aria-label="Seasons">
                  {seasons.map((s) => (
                    <button type="button" key={s.key} role="option" aria-selected={s.key === seasonKey} className={`ycd-season${s.key === seasonKey ? ' is-on' : ''}`} onClick={() => setSeasonKey(s.key)}>
                      <b>{s.year}</b><span>{s.team}</span><small>{s.label}{s.current ? ' · Current' : ''}</small>
                    </button>
                  ))}
                </div>
              )}
          </div>
        ) : type?.asks === 'team' ? (
          <div className="ycd-field">
            <div className="ycd-label"><span className="ycd-step">4</span> Which team?</div>
            {!main ? <div className="ycd-muted ycd-small">Tag a player who played for that team, and we&apos;ll list his teams.</div>
              : !seasons ? <div className="ycd-muted ycd-small">Loading his teams…</div>
              : !teams.length ? <div className="ycd-muted ycd-small">We don&apos;t have his college or pro teams yet.</div>
              : (
                <div className="ypf-teams">
                  {teams.map(([id, name]) => (
                    <button type="button" key={id} className={`ypf-team${teamId === id ? ' is-on' : ''}`} onClick={() => setTeamId(id)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${S3}/teams/${id}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        ) : type?.asks === 'school' ? (
          <div className="ycd-field">
            <div className="ycd-label"><span className="ycd-step">4</span> Which high school?</div>
            {school ? (
              <div className="ycd-chosen-wrap">
                <div className="ycd-chosen">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${S3}/schools/${school.hsid}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
                  <span className="ycd-chosen-text"><b>{school.name}</b>{school.location ? <small>{school.location}</small> : null}</span>
                </div>
                <button type="button" className="ycd-link ycd-small" onClick={() => setSchool(null)}>Change school</button>
              </div>
            ) : <ContributeSearch mode="school" onSchool={setSchool} />}
          </div>
        ) : null}

        <div className="ycd-field">
          <label className="ycd-label" htmlFor="ypfNote">Anything we should know? (optional)</label>
          <textarea id="ypfNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who took it, the game or event…" />
        </div>

        {error ? <div className="ycd-error">{error}</div> : null}
        <div className="ycd-actions">
          <button type="button" className="ycd-btn ycd-btn-primary" onClick={preview_}>{signedIn ? 'Preview' : 'Sign in to send'}</button>
        </div>
        <div className="ycd-muted ycd-small">Each photo is checked automatically when you send it. Most go live right away.</div>

        {main && info?.profileUrl ? (
          <p className="ycd-memories">
            * Looking to add personal memories of {main.displayName.split(' ')[0]}? Post them on his profile page, on his Career Path
            Timeline: click the Polaroid icon at the bottom left of his timeline. Stories there let you tell what happened, and let
            others like, comment, share and tag. <a href={`${info.profileUrl}#ppTab-upload`}>Go to {info.name}&apos;s profile page</a>
          </p>
        ) : null}
      </div>

      <style jsx global>{`
        .ypf-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 260px; padding: 24px; border: 2px dashed rgba(255,215,0,.6); border-radius: 12px; background: rgba(255,215,0,.04); color: inherit; cursor: pointer; }
        .ypf-drop i { font-size: 44px; color: #FFD700; }
        .ypf-drop span { font: 600 20px/1 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
        .ypf-drop small { opacity: .65; }
        .ypf-photo { display: flex; flex-direction: column; gap: 8px; }
        .ypf-picked { max-width: 100%; max-height: 420px; object-fit: contain; border-radius: 8px; align-self: flex-start; }
        .ypf-picked.is-logo { width: 220px; height: 220px; padding: 10px; background: repeating-conic-gradient(#2a2a2a 0 25%, #1c1c1c 0 50%) 0 0 / 20px 20px; outline: 2px dashed rgba(255,215,0,.6); }
        .ypf-tags { display: flex; flex-direction: column; gap: 6px; }
        .ypf-tag { display: grid; grid-template-columns: 40px 1fr 24px; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 10px; }
        .ypf-tag.is-main { border-color: rgba(255,215,0,.7); }
        .ypf-tag img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
        .ypf-tag span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ypf-tag b { font: 700 14px/1.1 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-tag small { color: #FFD700; font: 500 11px/1 Oswald, sans-serif; text-transform: uppercase; letter-spacing: .05em; }
        .ypf-tag .ycd-link { font-size: 12px; }
        .ypf-tag-x { border: 0; background: none; color: inherit; font-size: 20px; cursor: pointer; opacity: .7; }
        .ypf-types { display: flex; flex-direction: column; gap: 6px; }
        .ypf-type { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; font-size: 14px; }
        .ypf-type input { margin-top: 3px; accent-color: #FFD700; }
        .ypf-type span { display: flex; flex-direction: column; gap: 4px; }
        .ypf-type small { font-size: 12px; opacity: .7; line-height: 1.4; }
        .ypf-type.is-on { border-color: #FFD700; background: rgba(255,215,0,.07); }
        .ypf-type.is-blocked { opacity: .45; cursor: default; }
        .ypf-teams { display: flex; flex-wrap: wrap; gap: 8px; }
        .ypf-team { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
        .ypf-team img { width: 30px; height: 30px; object-fit: contain; }
        .ypf-team.is-on { border-color: #FFD700; background: rgba(255,215,0,.08); }
        .ypf-done { display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
        .ypf-done-title { font: 600 26px/1.1 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-done-title.is-approved { color: #3ddc84; }
        .ypf-done-title.is-rejected { color: #ff6b6b; }
        .ypf-done p { margin: 0; line-height: 1.5; }
      `}</style>
    </div>
  );
}
