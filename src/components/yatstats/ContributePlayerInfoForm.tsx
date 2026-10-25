'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { ContributePlayer, ContributeSchool, ContributeTeam } from '@/lib/contribute';
import ContributeSearch from './ContributeSearch';

type Fields = {
  first_name:string; last_name:string; class_of:string; roster_years:string[];
  status_label:string; level_label:string; position:string; current_team_name:string;
  committed_teamid:string;
  facebook:string; instagram:string; x:string; tiktok:string; linkedin:string;
};
const EMPTY:Fields = {
  first_name:'',last_name:'',class_of:'',roster_years:[],status_label:'',
  level_label:'',position:'',current_team_name:'',committed_teamid:'',
  facebook:'',instagram:'',x:'',tiktok:'',linkedin:'',
};
const YEARS = Array.from({ length: 115 }, (_,i)=>String(new Date().getFullYear()+1-i));
const STATUS = ['ACTIVE','RETIRED','INJURED 60-DAY','INJURED - FULL SEASON','FREE AGENT','COACH','UNKNOWN'];
const LEVEL = ['HIGH SCHOOL','NJCAA','CCCAA','NWAC','NCAA-D1','NCAA-D2','NCAA-D3','NAIA','ROOKIE','SINGLE-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB','INDY','INTERNATIONAL','RETIRED'];
const POSITION = ['P','C','1B','2B','3B','SS','IF','OF','LF','CF','RF','UT','DH','P-OF','IF-OF'];
const ACCOUNTS = ['facebook','instagram','x','tiktok','linkedin'] as const;
const clean = (s:unknown)=>String(s ?? '').trim();
// A team season is not a graduation year. Offer only the four high-school
// seasons ending in the selected graduation year, never the full year list.
function varsitySeasonOptions(classOf: string): string[] {
  if (!/^\d{4}$/.test(classOf)) return [];
  const year = Number(classOf);
  if (year < 1900 || year > new Date().getFullYear()+1) return [];
  return Array.from({ length: 4 }, (_, i) => String(year-i))
    .filter(yearOption => Number(yearOption) >= 1900);
}
export default function ContributePlayerInfoForm({
  player, school, signedIn, onSignIn,
}: {
  player:ContributePlayer|null; school:ContributeSchool|null;
  signedIn:boolean; onSignIn:()=>void;
}) {
  const [values,setValues] = useState<Fields>(EMPTY);
  const [initial,setInitial] = useState<Fields>(EMPTY);
  const [loading,setLoading] = useState(false);
  const [sending,setSending] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [expandedYears,setExpandedYears] = useState(false);
  const [selectedCommitTeam,setSelectedCommitTeam] = useState<ContributeTeam | null>(null);
  const set=(field:keyof Fields,value:string|string[])=>setValues(v=>({...v,[field]:value}));

  useEffect(()=>{
    let cancelled=false;
    setMessage('');setError('');setValues(EMPTY);setInitial(EMPTY);setSelectedCommitTeam(null);
    if(!player?.playerId) return;
    setLoading(true);
    fetch('/api/contribute/player-fields?playerId='+encodeURIComponent(player.playerId),{cache:'no-store'})
      .then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error || 'Unable to load player data.');return v;})
      .then(({player:p})=>{
        if(cancelled)return;
        const next:Fields={
          ...EMPTY,
          first_name:clean(p.first_name),last_name:clean(p.last_name),
          class_of:clean(p.class_of),
          roster_years:Array.isArray(p.roster_years)?p.roster_years.map(clean):[],
          status_label:clean(p.status_label),level_label:clean(p.level_label),
          position:clean(p.position),current_team_name:clean(p.current_team_name),
          committed_teamid:clean(p.committed_teamid),
        };
        setValues(next);setInitial(next);
        if (next.committed_teamid) setSelectedCommitTeam({
          teamId:next.committed_teamid,
          name:clean(p.committed_team_name) || `College team ${next.committed_teamid}`,
        });
      })
      .catch(e=>{if(!cancelled)setError(e.message);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true};
  },[player?.playerId]);

  // A school selected from search satisfies the school requirement. Clear an
  // earlier validation message when the selection changes, without losing the form.
  useEffect(()=>{
    setError(previous=>/high school|school id|school was not found/i.test(previous)?'':previous);
  },[school?.hsid,school?.name,school?.location,player?.schoolId]);

  const varsityYears = varsitySeasonOptions(values.class_of);
  const recordedYearsOutsideWindow = values.roster_years.filter(y=>!varsityYears.includes(y));
  const isHighSchoolPlayer = values.level_label.toUpperCase() === 'HIGH SCHOOL'
    && !/COACH/.test(values.status_label.toUpperCase());
  const changed:Record<string,string|string[]> = Object.fromEntries(
    Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(initial[key as keyof Fields]))
  );
  // Keep the status and canonical team id together so a commitment is never
  // interpreted as a college playing assignment or an unrelated status edit.
  if (isHighSchoolPlayer && (values.status_label!==initial.status_label || values.committed_teamid!==initial.committed_teamid)) {
    changed.status_label=values.status_label;
    changed.committed_teamid=values.committed_teamid;
  }
  async function submit() {
    setMessage('');setError('');
    if(!signedIn){onSignIn();return;}
    if(!school && !player?.schoolId){setError('Select the high school.');return;}
    if(isHighSchoolPlayer && !['UNCOMMITTED','COMMIT'].includes(values.status_label)){
      setError('High school players must be UNCOMMITTED or committed to a college.');return;
    }
    if(isHighSchoolPlayer && values.status_label==='COMMIT' && !/^\d{1,18}$/.test(values.committed_teamid)){
      setError('Select the college from Global Search before announcing a commitment.');return;
    }
    if(!player && (!values.first_name.trim()||!values.last_name.trim())){setError('Enter the player’s first and last name.');return;}
    if(player && Object.keys(changed).length===0){setError('Change or add at least one field.');return;}
    setSending(true);
    try{
      await auth.authStateReady?.();
      const token=await auth.currentUser?.getIdToken().catch(()=>'');
      const res=await fetch('/api/contribute',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',
        body:JSON.stringify({kind:'profile',playerId:player?.playerId || null,hsid:player?.schoolId || school?.hsid,
          fields:player?changed:values,idToken:token||undefined,pageUrl:location.href})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(body.error||'Unable to send your submission.');
      setMessage(body.review === 'preview_only'
        ? 'Preview test received. This commitment was NOT saved or published.'
        : body.review === 'published'
        ? 'Varsity years saved. The school’s team-year filters will update on your next page refresh.'
        : body.review === 'needs_review'
          ? 'Received. These years need verification before appearing on the school page.'
          : 'Received. Your information is queued for processing. Updates that need verification are held for review.');
      setInitial(values);
    }catch(e){setError(e instanceof Error?e.message:'Unable to send.');}finally{setSending(false);}
  }

  return <div className="ycd-profile-fields">
    <p className="ycd-muted ycd-small">{player
      ? 'Existing player: fields below are prefilled from the flip-card record. Edit only what needs correcting.'
      : 'Add a player who is missing from the database. Use the known school and the fields below.'}</p>
    {loading?<p>Loading current player information…</p>:null}
    <div className="ycd-pair">
      {(['first_name','last_name'] as const).map(k=><label className="ycd-field" key={k}>
        <span className="ycd-label">{k==='first_name'?'First name':'Last name'}</span>
        <input value={values[k]} maxLength={80} onChange={e=>set(k,e.target.value)} />
      </label>)}
    </div>
    <div className="ycd-pair">
      <label className="ycd-field"><span className="ycd-label">Graduation year</span>
        <select value={values.class_of} onChange={e=>set('class_of',e.target.value)}>
          <option value="">Choose a year</option>
          {values.class_of && !YEARS.includes(values.class_of)?<option value={values.class_of}>{values.class_of}</option>:null}
          {YEARS.map(y=><option value={y} key={y}>{y}</option>)}
        </select>
      </label>
      <label className="ycd-field"><span className="ycd-label">Position</span>
        <select value={values.position} onChange={e=>set('position',e.target.value)}>
          <option value="">Select position</option>
          {values.position&&!POSITION.includes(values.position)?<option value={values.position}>{values.position}</option>:null}
          {POSITION.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>
    </div>
    <div className="ycd-field">
      <span className="ycd-label">Varsity team roster years (select every season played)</span>
      {varsityYears.length ? (
        <>
          <button type="button" className="ycd-link" aria-expanded={expandedYears} onClick={()=>setExpandedYears(v=>!v)}>
            {values.roster_years.length?values.roster_years.join(', '):'Choose varsity team years'} {expandedYears?'▲':'▼'}
          </button>
          <p className="ycd-muted ycd-small">Select the actual varsity seasons played, not just the graduation year.</p>
          {expandedYears?<div className="ycd-profile-year-options">
            {varsityYears.map(y=>
              <label key={y}><input type="checkbox" checked={values.roster_years.includes(y)}
                onChange={e=>set('roster_years',e.target.checked?[...values.roster_years,y].sort():values.roster_years.filter(x=>x!==y))}/>{y}</label>)}
          </div>:null}
          {recordedYearsOutsideWindow.length>0?
            <p className="ycd-muted ycd-small">Previously recorded years outside this graduation-year window ({recordedYearsOutsideWindow.join(', ')}) are preserved. Verify the graduation year before submitting a correction.</p>
          :null}
        </>
      ) : <p className="ycd-muted ycd-small">Choose the graduation year above to select up to four varsity seasons.</p>}
    </div>
    <div className="ycd-pair">
      <label className="ycd-field"><span className="ycd-label">Status</span>
        <select value={values.status_label} onChange={e=>{
          const status=e.target.value;
          setValues(v=>({...v,status_label:status,committed_teamid:status==='COMMIT'?v.committed_teamid:''}));
          if(status!=='COMMIT')setSelectedCommitTeam(null);
        }}>
          <option value="">Select status</option>
          {isHighSchoolPlayer ? <>
            {values.status_label&&!['COMMIT','UNCOMMITTED'].includes(values.status_label)
              ? <option value={values.status_label} disabled>{values.status_label} — select a high-school status</option>:null}
            <option value="UNCOMMITTED">UNCOMMITTED</option>
            <option value="COMMIT">{selectedCommitTeam ? `${selectedCommitTeam.name} COMMIT` : 'COLLEGE COMMIT — choose a college below'}</option>
          </> : <>
            {values.status_label&&!STATUS.includes(values.status_label)?<option value={values.status_label}>{values.status_label}</option>:null}
            {STATUS.map(x=><option key={x} value={x}>{x}</option>)}
          </>}
        </select>
      </label>
      <label className="ycd-field"><span className="ycd-label">Highest/current level</span>
        <select value={values.level_label} onChange={e=>set('level_label',e.target.value)}>
          <option value="">Select level</option>
          {values.level_label&&!LEVEL.includes(values.level_label)?<option value={values.level_label}>{values.level_label}</option>:null}
          {LEVEL.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>
    </div>
    {isHighSchoolPlayer ? <div className="ycd-field">
      <span className="ycd-label">College commitment</span>
      {values.status_label==='COMMIT' ? (
        selectedCommitTeam && values.committed_teamid === selectedCommitTeam.teamId ? (
          <div className="ycd-chosen-wrap">
            <div className="ycd-chosen">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedCommitTeam.logoUrl || `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/${encodeURIComponent(selectedCommitTeam.teamId)}.png`}
                alt="" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='/img/yatstats-logo-circle.png';}} />
              <span className="ycd-chosen-text"><b>{selectedCommitTeam.name} COMMIT</b>
                <small>{[selectedCommitTeam.level, `Team ID: ${selectedCommitTeam.teamId}`].filter(Boolean).join(' · ')}</small>
              </span>
            </div>
            <button type="button" className="ycd-link ycd-small" onClick={()=>{setSelectedCommitTeam(null);set('committed_teamid','');}}>Change college</button>
          </div>
        ) : (
          <ContributeSearch mode="college" onTeam={team=>{
            setSelectedCommitTeam(team);
            setValues(v=>({...v,status_label:'COMMIT',committed_teamid:team.teamId}));
          }} />
        )
      ) : <p className="ycd-muted ycd-small">Select COLLEGE COMMIT above to announce a college commitment using Global Search.</p>}
      <p className="ycd-muted ycd-small">A commitment does not change the player's current high-school team or playing level.</p>
    </div> : null}
    <label className="ycd-field"><span className="ycd-label">Current or most recent team (if known)</span>
      <input type="text" maxLength={120} value={values.current_team_name} onChange={e=>set('current_team_name',e.target.value)}/>
    </label>
    <div className="ycd-profile-social">
      <b>Player social media handles (optional)</b>
      {ACCOUNTS.map(k=><label className="ycd-field" key={k}>
        <span className="ycd-label">{k==='x'?'X':k[0].toUpperCase()+k.slice(1)}</span>
        <input type="text" maxLength={120} placeholder="@username or profile URL" value={values[k]} onChange={e=>set(k,e.target.value)}/>
      </label>)}
    </div>
    {error?<p className="ycd-error" role="alert">{error}</p>:null}
    {message?<p className="ycd-ok" role="status">{message}</p>:null}
    <button type="button" className="ycd-btn ycd-btn-primary" disabled={sending||loading} onClick={submit}>
      {!signedIn?'Sign in to send':sending?'Sending…':'Submit player information'}
    </button>
    <small className="ycd-muted">Valid contributions publish automatically. Conflicting player details require verification.</small>
    <style jsx>{`
      .ycd-profile-fields{display:flex;flex-direction:column;gap:13px;}
      .ycd-profile-year-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;padding:10px;border:1px solid var(--line);border-radius:6px}
      .ycd-profile-year-options label{display:flex;gap:7px;align-items:center}
      .ycd-profile-year-options input[type="checkbox"]{width:24px;min-width:24px;height:24px}
      .ycd-profile-social{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .ycd-profile-social>b{grid-column:1/-1;font-size:13px}
      .ycd-profile-fields input,.ycd-profile-fields select{min-width:0;width:100%}
    `}</style>
  </div>;
}
