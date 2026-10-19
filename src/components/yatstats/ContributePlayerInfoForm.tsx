'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { ContributePlayer, ContributeSchool } from '@/lib/contribute';

type Fields = {
  first_name:string; last_name:string; class_of:string; roster_years:string[];
  status_label:string; level_label:string; position:string; current_team_name:string;
  facebook:string; instagram:string; x:string; tiktok:string; linkedin:string;
};
const EMPTY:Fields = {
  first_name:'',last_name:'',class_of:'',roster_years:[],status_label:'',
  level_label:'',position:'',current_team_name:'',
  facebook:'',instagram:'',x:'',tiktok:'',linkedin:'',
};
const YEARS = Array.from({ length: 115 }, (_,i)=>String(new Date().getFullYear()+1-i));
const STATUS = ['ACTIVE','RETIRED','INJURED 60-DAY','INJURED - FULL SEASON','FREE AGENT','COACH','UNKNOWN'];
const LEVEL = ['HIGH SCHOOL','NJCAA','CCCAA','NWAC','NCAA-D1','NCAA-D2','NCAA-D3','NAIA','ROOKIE','SINGLE-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB','INDY','INTERNATIONAL','RETIRED'];
const POSITION = ['P','C','1B','2B','3B','SS','IF','OF','LF','CF','RF','UT','DH','P-OF','IF-OF'];
const ACCOUNTS = ['facebook','instagram','x','tiktok','linkedin'] as const;
const clean = (s:unknown)=>String(s ?? '').trim();
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
  const set=(field:keyof Fields,value:string|string[])=>setValues(v=>({...v,[field]:value}));

  useEffect(()=>{
    let cancelled=false;
    setMessage('');setError('');setValues(EMPTY);setInitial(EMPTY);
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
        };
        setValues(next);setInitial(next);
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

  const changed=Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(initial[key as keyof Fields])));
  async function submit() {
    setMessage('');setError('');
    if(!signedIn){onSignIn();return;}
    if(!school && !player?.schoolId){setError('Select the high school.');return;}
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
      setMessage('Received. Your requested additions have been logged for review.');
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
      <span className="ycd-label">Years on high school varsity (select multiple)</span>
      <button type="button" className="ycd-link" aria-expanded={expandedYears} onClick={()=>setExpandedYears(v=>!v)}>
        {values.roster_years.length?values.roster_years.join(', '):'Choose varsity years'} {expandedYears?'▲':'▼'}
      </button>
      {expandedYears?<div className="ycd-profile-year-options">
        {YEARS.filter(y=>!values.class_of||Number(y)<=Number(values.class_of)).map(y=>
          <label key={y}><input type="checkbox" checked={values.roster_years.includes(y)}
            onChange={e=>set('roster_years',e.target.checked?[...values.roster_years,y].sort():values.roster_years.filter(x=>x!==y))}/>{y}</label>)}
      </div>:null}
    </div>
    <div className="ycd-pair">
      <label className="ycd-field"><span className="ycd-label">Status</span>
        <select value={values.status_label} onChange={e=>set('status_label',e.target.value)}>
          <option value="">Select status</option>
          {values.status_label&&!STATUS.includes(values.status_label)?<option value={values.status_label}>{values.status_label}</option>:null}
          {STATUS.map(x=><option key={x} value={x}>{x}</option>)}
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
    <small className="ycd-muted">Submissions are logged for review before they change published player records.</small>
    <style jsx>{`
      .ycd-profile-fields{display:flex;flex-direction:column;gap:13px;}
      .ycd-profile-year-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));max-height:175px;overflow-y:auto;gap:8px;padding:10px;border:1px solid var(--line);border-radius:6px}
      .ycd-profile-year-options label{display:flex;gap:5px;align-items:center}
      .ycd-profile-social{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .ycd-profile-social>b{grid-column:1/-1;font-size:13px}
      .ycd-profile-fields input,.ycd-profile-fields select{min-width:0;width:100%}
    `}</style>
  </div>;
}
