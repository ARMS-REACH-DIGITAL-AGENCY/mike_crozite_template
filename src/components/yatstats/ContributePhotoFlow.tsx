'use client';

// The Photo Contribution drawer, top to bottom:
//   1. Upload +
//   2. Purpose - flip card front, headshot, card back, a timeline slide, a
//      school or team logo, or something else
//   3. Select: Player | School | Team - the purpose picks which (a player
//      photo tags one or more players, the first is the main one)
//      3a. (If needed) the season - a timeline slide, a headshot
//   4. Verify position - line it up in the frame it will have on the site
//   5. Approve - the proof: exactly where it will go, and "Looks right"
//   6. Submit
//   7. More? - send another
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
  yearsOfHisLife,
} from '@/lib/contribute';

const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const CREST_FALLBACK = '/img/school-placeholder.png';
const THIS_YEAR = new Date().getFullYear();

type Info = { name: string; classOf: number | null; profileUrl: string | null };
type Stage = 'form' | 'sending' | 'done';
type Pick = 'player' | 'school' | 'team';
type Result = { outcome: 'approved' | 'rejected' | 'pending'; message: string; link?: string | null };

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
  const [showPurposePicker, setShowPurposePicker] = useState(!initialType);
  const [seasonKey, setSeasonKey] = useState('');
  // "Other": a year and a team or league we don't have (the Arizona Fall
  // League, a travel team...).
  const [other, setOther] = useState<{ year: number | ''; team: string }>({ year: '', team: '' });
  const [teamId, setTeamId] = useState('');
  const [school, setSchool] = useState<ContributeSchool | null>(hubSchool);
  // 5. Placement
  const [landscape, setLandscape] = useState(false);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [note, setNote] = useState('');
  // 3. Player | School | Team (only "Other" lets the fan choose)
  const [pickOverride, setPickOverride] = useState<Pick | null>(null);
  // 5. Approved: the proof the fan said looks right (anything changed
  // after that needs a new look).
  const [approvedSig, setApprovedSig] = useState('');
  // Sending
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const main = tagged[0] || null;
  const type = PHOTO_TYPES.find((t) => t.id === purpose) || null;
  const years = seasons ? yearsOfHisLife(seasons, info?.classOf ?? null, THIS_YEAR) : null;
  const season: Season | null = seasonKey === 'other'
    ? (other.year ? { key: 'other', year: Number(other.year), stage: 'other', team: other.team.trim(), level: '', label: 'Other', current: false } : null)
    : years?.find((s) => s.key === seasonKey) || null;
  const current = seasons?.find((s) => s.current) || null;
  const aspect = type?.aspects ? (type.aspects.length > 1 && landscape ? type.aspects[1] : type.aspects[0]) : null;
  const pickFor: Pick = type?.asks === 'school' ? 'school' : type?.asks === 'team' ? 'team' : 'player';
  const pick: Pick = type?.id === 'other_photo' ? pickOverride || 'player' : pickFor;

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
    setShowPurposePicker(false);
    setPickOverride(null);
    setCrop(null);
    setLandscape(false);
    setError('');
  };

  // The teams the main player played for (for a team logo).
  const teams = Array.from(new Map((seasons || []).filter((s) => s.teamId && s.stage !== 'hs').map((s) => [s.teamId!, s.team])).entries());

  const yearToSend = (): number | null => {
    if (!type) return null;
    if (type.id === 'flip_card') return info?.classOf || THIS_YEAR;
    if (type.id === 'back_hero') return current?.year || THIS_YEAR;
    if (type.asks === 'season') return season?.year || (type.id === 'other_photo' ? THIS_YEAR : null);
    return THIS_YEAR;
  };

  const problem = (): string | null => {
    if (!file) return 'Upload the picture.';
    if (!type) return 'Pick its purpose.';
    if (type.needsPlayer && !main) return 'Select the player.';
    if ((type.id === 'timeline_hero' || type.id === 'headshot') && !season) return seasonKey === 'other' ? 'Pick the year.' : 'Pick the season.';
    if (type.asks === 'team' && !teamId) return 'Pick the team.';
    if (type.asks === 'school' && !/^\d+$/.test(String(school?.hsid ?? '').trim())) return 'Select a high school from the search results.';
    return null;
  };

  // What the proof shows; approving it holds only while this stays the same.
  const sig = JSON.stringify([preview, purpose, tagged.map((t) => t.playerId), seasonKey, other, teamId, school?.hsid, landscape, crop]);
  const approved = approvedSig === sig;
  const ready = !problem();
  const submissionHsid = String(type?.id === 'school_logo' ? school?.hsid ?? '' : main?.schoolId || school?.hsid || hubSchool?.hsid || '').trim();
  const validSubmissionHsid = /^\d+$/.test(submissionHsid);

  const send = async () => {
    if (!file || !type) return;
    if (!signedIn) return onSignIn();
    const p = problem();
    if (p) return setError(p);
    if (!validSubmissionHsid) return setError('Select a high school from the search results.');
    if (!approved) return setError('Check the proof and approve it first.');
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
      form.set('hsid', submissionHsid);
      form.set('tagged', JSON.stringify(tagged.map((t) => t.playerId)));
      if (season && type.asks === 'season') form.set('season', JSON.stringify({ team: season.team, level: season.level, label: season.label || (season.stage === 'other' ? 'Other' : '') }));
      if (type.asks === 'team') form.set('teamId', teamId);
      if (crop && aspect) form.set('crop', JSON.stringify(crop));
      if (type.id === 'timeline_hero' && landscape) form.set('landscape', '1');
      // A headshot from his newest season becomes his headshot everywhere.
      if (type.id === 'headshot' && season?.current) form.set('currentSeason', '1');
      form.set('note', note.trim());
      form.set('pageUrl', window.location.href);
      const res = await fetch('/api/contribute/photo', { method: 'POST', body: form, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStage('form');
        setConfirm(true);
        return;
      }
      if (!res.ok) throw new Error(body?.error || 'Your photo could not be sent.');
      const outcome: Result['outcome'] = body?.status === 'approved' || body?.status === 'rejected' ? body.status : 'pending';
      setResult({ outcome, message: body?.message || 'Thanks!', link: typeof body?.link === 'string' && body.link.startsWith('/') ? body.link : null });
      setStage('done');
    } catch (e) {
      setStage('form');
      setError(e instanceof Error ? e.message : 'Your photo could not be sent.');
    }
  };

  const startOver = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(''); setPurpose(initialType || null); setShowPurposePicker(!initialType); setCrop(null); setNote('');
    setSeasonKey(''); setOther({ year: '', team: '' }); setTeamId(''); setLandscape(false); setPickOverride(null); setApprovedSig('');
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
        {result.outcome === 'approved' && result.link ? (
          <a className="ypf-see" href={result.link}>See it on the site <span aria-hidden="true">›</span></a>
        ) : null}
        <div className="ycd-label"><span className="ycd-step">7</span> More?</div>
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

  // ---- The form: 1 Upload, 2 Purpose, 3 Select, 3a Season, 4 Verify
  // position, 5 Approve, 6 Submit -----------------------------------------
  const proofPlayer = {
    name: info?.name || main?.displayName || '',
    classOf: info?.classOf ?? null,
    currentTeam: current?.team || '',
    schoolName: type?.id === 'school_logo' ? school?.name || '' : main?.schoolName || school?.name || '',
    schoolLocation: school?.location || hubSchool?.location || '',
  };
  const needsSeason = Boolean(type?.asks === 'season' && main && pick === 'player');
  const sending = stage === 'sending';

  return (
    <div className="ypf-flow">
      {/* Enter from a particular contribution card with its destination set.
          Changing the destination is optional and never a required step. */}
      {type && !showPurposePicker ? (
        <div className="ypf-selected-purpose">
          <div><span className="ypf-selected-kicker">{type.prefix}</span><strong>{type.label}</strong></div>
          <button type="button" className="ycd-link ycd-small" onClick={() => setShowPurposePicker(true)}>Change</button>
          <details><summary>What photo should I send?</summary><p>{type.spec}</p></details>
        </div>
      ) : null}
      {/* 1. Upload + */}
      <section className="ypf-step">
        <div className="ycd-label"><span className="ycd-step">1</span> {type ? 'Upload ' + type.label : 'Upload Photo'}</div>
        {!file ? (
          <button type="button" className="ypf-drop" onClick={() => fileInput.current?.click()}>
            <i className="ri-image-add-line" aria-hidden="true" />
            <span>Upload +</span>
            <small>A photo from your phone or computer</small>
          </button>
        ) : (
          <div className="ypf-uploaded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" />
            <button type="button" className="ycd-link ycd-small" onClick={() => fileInput.current?.click()}>Choose a different picture</button>
          </div>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files)} />
      </section>

      {/* The complete list of destinations only appears for generic uploads
          or when the contributor explicitly chooses to change the purpose. */}
      {(!type || showPurposePicker) ? <section className="ypf-step">
        <div className="ycd-label"><span className="ycd-step">2</span> Where will this image go?</div>
        <div className="ypf-types" role="radiogroup" aria-label="Purpose">
          {PHOTO_TYPES.map((t) => (
            <label className={`ypf-type${purpose === t.id ? ' is-on' : ''}`} key={t.id}>
              <input type="radio" name="ypf-type" checked={purpose === t.id} onChange={() => choosePurpose(t.id)} />
              <span><b>{t.label}</b><small>{t.prefix}{t.id === 'team_logo' ? ' · COLLEGE OR PRO TEAM LOGO' : t.id === 'school_logo' ? ' · HIGH SCHOOL CREST' : ''}</small>{purpose === t.id ? <small>{t.spec}</small> : null}</span>
            </label>
          ))}
        </div>
      </section> : null}

      {/* 3. Select: Player | School | Team */}
      {type ? (
        <section className="ypf-step">
          <div className="ycd-label"><span className="ycd-step">3</span> {pick === 'school' ? 'Select the school' : pick === 'team' ? 'Select the team' : 'Select the player'}</div>
          <div className="ycd-switch ypf-pick" role="radiogroup" aria-label="Select">
            {(['player', 'school', 'team'] as Pick[]).map((k) => (
              <button
                type="button"
                role="radio"
                key={k}
                aria-checked={pick === k}
                className={pick === k ? 'is-on' : ''}
                disabled={type.id !== 'other_photo' && pickFor !== k}
                onClick={() => setPickOverride(k)}
              >
                {k === 'player' ? 'Player' : k === 'school' ? 'School' : 'Team'}
              </button>
            ))}
          </div>

          {pick === 'school' ? (
            school ? (
              <div className="ycd-chosen-wrap">
                <div className="ycd-chosen">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${S3}/schools/${school.hsid}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
                  <span className="ycd-chosen-text"><b>{school.name}</b>{school.location ? <small>{school.location}</small> : null}</span>
                </div>
                <button type="button" className="ycd-link ycd-small" onClick={() => setSchool(null)}>Change school</button>
              </div>
            ) : <ContributeSearch mode="school" onSchool={setSchool} />
          ) : (
            <>
              {/* Players: everyone in it (the first is the main one). For a
                  team, a player who played there lists his teams. */}
              {tagged.length ? (
                <div className="ypf-tags">
                  {tagged.map((t, i) => (
                    <span className={`ypf-tag${i === 0 ? ' is-main' : ''}`} key={t.playerId}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${S3}/players/now/${encodeURIComponent(t.playerId)}.jpg`} alt="" onError={(e) => { e.currentTarget.src = '/img/headshot-silhouette.png'; }} />
                      <span><b>{t.displayName}</b>{i === 0 ? <small>{pick === 'team' ? 'Played for the team' : 'Main player'}</small> : <button type="button" className="ycd-link" onClick={() => makeMain(t.playerId)}>Make main</button>}</span>
                      <button type="button" className="ypf-tag-x" onClick={() => removeTag(t.playerId)} aria-label={`Remove ${t.displayName}`}>×</button>
                    </span>
                  ))}
                </div>
              ) : null}
              {pick === 'team' && !tagged.length ? <div className="ycd-muted ycd-small">Search a player who played for the team, and we&apos;ll list his teams.</div> : null}
              {!tagged.length || (adding && pick === 'player') ? (
                <ContributeSearch onPlayer={addTag} />
              ) : pick === 'player' ? (
                <button type="button" className="ycd-link ycd-small" onClick={() => setAdding(true)}>+ Tag someone else in the picture</button>
              ) : null}
              {pick === 'team' && main ? (
                !seasons ? <div className="ycd-muted ycd-small">Loading his teams…</div>
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
                  )
              ) : null}
            </>
          )}

          {/* 3a. The season, when it matters */}
          {needsSeason ? (
            <div className="ycd-field ypf-sub">
              <div className="ycd-label"><span className="ycd-step ypf-step-sm">3a</span> Select season{type.id === 'other_photo' ? ' (if you know)' : ''}</div>
              {!years ? <div className="ycd-muted ycd-small">Loading his seasons…</div>
                : (
                  <div className="ycd-seasons" role="listbox" aria-label="Seasons">
                    {years.map((s) => (
                      <button type="button" key={s.key} role="option" aria-selected={s.key === seasonKey} className={`ycd-season${s.key === seasonKey ? ' is-on' : ''}${s.team ? '' : ' is-plain'}`} onClick={() => setSeasonKey(s.key)}>
                        <b>{s.year}</b><span>{s.team || s.label || '\u00a0'}</span><small>{s.team ? `${s.label}${s.current ? ' · Current' : ''}` : ''}</small>
                      </button>
                    ))}
                    <button type="button" role="option" aria-selected={seasonKey === 'other'} className={`ycd-season${seasonKey === 'other' ? ' is-on' : ''}`} onClick={() => setSeasonKey('other')}>
                      <b>Other</b><span>A year or team that isn&apos;t listed</span><small>Fall league, summer ball, travel team…</small>
                    </button>
                  </div>
                )}
              {seasonKey === 'other' ? (
                <div className="ypf-other">
                  <select value={other.year} onChange={(e) => setOther((o) => ({ ...o, year: e.target.value ? Number(e.target.value) : '' }))} aria-label="Year">
                    <option value="">Year…</option>
                    {Array.from({ length: THIS_YEAR + 2 - 1960 }, (_, i) => THIS_YEAR + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <input type="text" value={other.team} onChange={(e) => setOther((o) => ({ ...o, team: e.target.value }))} placeholder="Team or league (e.g. Arizona Fall League)" maxLength={120} />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 4. Verify position, 5. Approve */}
      {type && file ? (
        <div className="ypf-verify">
          <section className="ypf-step">
            <div className="ycd-label"><span className="ycd-step">4</span> Verify position</div>
            {aspect ? (
              <>
                {type.aspects && type.aspects.length > 1 ? (
                  <div className="ycd-switch" role="radiogroup" aria-label="Orientation">
                    <button type="button" role="radio" aria-checked={!landscape} className={!landscape ? 'is-on' : ''} onClick={() => { setLandscape(false); setCrop(null); }}>Tall 5x7</button>
                    <button type="button" role="radio" aria-checked={landscape} className={landscape ? 'is-on' : ''} onClick={() => { setLandscape(true); setCrop(null); }}>Wide 7x5</button>
                  </div>
                ) : null}
                <PhotoCropper key={`${type.id}-${landscape}-${preview}`} src={preview} aspect={aspect} guide={type.guide} onChange={setCrop} />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={`ypf-picked${type.id !== 'other_photo' ? ' is-logo' : ''}`} src={preview} alt="" />
            )}
            <div className="ycd-field">
              <label className="ycd-label" htmlFor="ypfNote">Anything we should know? (optional)</label>
              <textarea id="ypfNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who took it, the game or event…" />
            </div>
          </section>

          <section className="ypf-step">
            <div className="ycd-label"><span className="ycd-step">5</span> Approve</div>
            {ready ? (
              <>
                <ContributeProof
                  purpose={type.id}
                  src={preview}
                  crop={aspect ? crop : null}
                  landscape={landscape}
                  season={type.asks === 'season' ? season : current}
                  teamName={type.asks === 'team' ? teams.find(([id]) => id === teamId)?.[1] || '' : ''}
                  teamId={type.asks === 'team' ? teamId : ''}
                  tagged={tagged.map((t) => t.displayName)}
                  player={proofPlayer}
                />
                <label className={`ypf-approve${approved ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={approved} onChange={(e) => setApprovedSig(e.target.checked ? sig : '')} />
                  <span>Looks right. This is where my photo goes.</span>
                </label>
              </>
            ) : (
              <div className="ycd-muted ycd-small">{problem()} The proof shows here: exactly where your photo will go.</div>
            )}
          </section>
        </div>
      ) : null}

      {/* 6. Submit */}
      <section className="ypf-step">
        <div className="ycd-label"><span className="ycd-step">6</span> Submit</div>
        {confirm ? <FanConfirm email={email} onConfirmed={() => { setConfirm(false); void send(); }} /> : null}
        {error ? <div className="ycd-error">{error}</div> : null}
        <div className="ycd-actions">
          <button type="button" className="ycd-btn ycd-btn-primary" onClick={() => { void send(); }} disabled={sending || (signedIn && !approved)}>
            {!signedIn ? 'Sign in to submit' : sending ? 'Checking your photo…' : 'Submit'}
          </button>
        </div>
        <div className="ycd-muted ycd-small">Each photo is checked automatically when you submit it. Most go live right away.</div>
      </section>

      {main && info?.profileUrl ? (
        <p className="ycd-memories">
          * Looking to add personal memories of {main.displayName.split(' ')[0]}? Post them on his profile page, on his Career Path
          Timeline: click the Polaroid icon at the bottom left of his timeline. Stories there let you tell what happened, and let
          others like, comment, share and tag. <a href={`${info.profileUrl}#ppTab-upload`}>Go to {info.name}&apos;s profile page</a>
        </p>
      ) : null}

      <style jsx global>{`
        .ypf-flow { display: flex; flex-direction: column; gap: 10px; max-width: 1100px; }
        .ypf-selected-purpose { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; align-items:center; padding:9px 12px; border-left:3px solid #d69a24; border-bottom:1px solid var(--sb-card-border); }
        .ypf-selected-purpose > div { display:flex; flex-direction:column; gap:3px; min-width:0; }
        .ypf-selected-purpose strong { font:800 14px/1.2 var(--yat-font-ui); }
        .ypf-selected-kicker { font:800 9px/1.2 var(--yat-font-ui); color:#d69a24; letter-spacing:.08em; }
        .ypf-selected-purpose details { grid-column:1 / -1; font-size:12px; color:var(--sb-ink-muted); }
        .ypf-selected-purpose summary { cursor:pointer; font-size:11px; }
        .ypf-selected-purpose p { margin:5px 0; }
        .ypf-step { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: var(--sb-card-bg); min-width: 0; }
        .ypf-sub { margin-top: 6px; }
        .ypf-step-sm { font-size: 11px !important; }
        .ypf-uploaded { display: flex; align-items: center; gap: 12px; }
        .ypf-uploaded img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
        .ypf-pick { align-self: flex-start; }
        .ypf-pick button:disabled { opacity: .35; cursor: default; }
        .ypf-verify { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .ypf-verify { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .ypf-verify .ypf-step { border-bottom: 0; } }
        .ypf-other { display: flex; gap: 8px; flex-wrap: wrap; }
        .ypf-other select { flex: 0 0 110px; }
        .ypf-other input { flex: 1 1 220px; }
        .ycd-season.is-plain span { opacity: .75; }
        .ypf-approve { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--sb-card-border); border-radius: 6px; cursor: pointer; font-size: 13px; }
        .ypf-approve input { width: 18px; height: 18px; accent-color: var(--sb-green-hi); }
        .ypf-approve.is-on { border-color: var(--sb-green-hi); background: var(--sb-green-soft); }
        .ypf-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 130px; padding: 16px; border: 1px dashed var(--sb-green-hi); border-radius: 12px; background: var(--sb-green-soft); color: inherit; cursor: pointer; }
        .ypf-drop i { font-size: 30px; color: var(--sb-text); }
        .ypf-drop span { font: 700 15px/1 var(--yat-font-compact); letter-spacing: .05em; text-transform: uppercase; }
        .ypf-drop small { opacity: .65; }
        .ypf-photo { display: flex; flex-direction: column; gap: 8px; }
        .ypf-picked { max-width: 100%; max-height: 420px; object-fit: contain; border-radius: 8px; align-self: flex-start; }
        .ypf-picked.is-logo { width: 220px; height: 220px; padding: 10px; background: repeating-conic-gradient(#2a2a2a 0 25%, #1c1c1c 0 50%) 0 0 / 20px 20px; outline: 2px dashed var(--sb-gold); }
        .ypf-tags { display: flex; flex-direction: column; gap: 6px; }
        .ypf-tag { display: grid; grid-template-columns: 40px 1fr 24px; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 10px; }
        .ypf-tag.is-main { border-color: var(--sb-green-hi); }
        .ypf-tag img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
        .ypf-tag span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ypf-tag b { font: 700 12px/1.1 var(--yat-font-compact); text-transform: uppercase; }
        .ypf-tag small { color: var(--sb-text); font: 600 11px/1 var(--yat-font-compact); text-transform: uppercase; letter-spacing: .05em; }
        .ypf-tag .ycd-link { font-size: 12px; }
        .ypf-tag-x { border: 0; background: none; color: inherit; font-size: 20px; cursor: pointer; opacity: .7; }
        .ypf-types { display: flex; flex-direction: column; gap: 6px; }
        .ypf-type { display: flex; gap: 10px; align-items: flex-start; padding: 7px 10px; border: 1px solid var(--sb-card-border); border-radius: 6px; cursor: pointer; font-size: 13px; }
        .ypf-type input { margin-top: 3px; accent-color: var(--sb-green-hi); }
        .ypf-type span { display: flex; flex-direction: column; gap: 4px; }
        .ypf-type small { font-size: 12px; opacity: .7; line-height: 1.4; }
        .ypf-type.is-on { border-color: var(--sb-green-hi); background: var(--sb-green-soft); }
        .ypf-type.is-blocked { opacity: .45; cursor: default; }
        .ypf-teams { display: flex; flex-wrap: wrap; gap: 8px; }
        .ypf-team { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
        .ypf-team img { width: 30px; height: 30px; object-fit: contain; }
        .ypf-team.is-on { border-color: var(--sb-green-hi); background: var(--sb-green-soft); }
        .ypf-done { display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
        .ypf-done-title { font: 700 18px/1.1 var(--yat-font-compact); text-transform: uppercase; }
        .ypf-done-title.is-approved { color: #3ddc84; }
        .ypf-done-title.is-rejected { color: #ff6b6b; }
        .ypf-done p { margin: 0; line-height: 1.5; }
        .ypf-see { align-self: flex-start; color: var(--sb-text); font: 700 18px/1 var(--yat-font-compact); letter-spacing: .03em; text-transform: uppercase; text-decoration: none; }
        .ypf-see:hover { text-decoration: underline; text-underline-offset: 3px; }
      `}</style>
    </div>
  );
}
