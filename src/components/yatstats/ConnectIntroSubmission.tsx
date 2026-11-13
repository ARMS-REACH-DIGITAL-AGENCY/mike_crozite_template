'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContributePlayer } from '@/lib/contribute';
import { auth } from '@/lib/firebase';
import { openSignIn } from '@/components/yatstats/StoryViewer';
import ContributeSearch from '@/components/yatstats/ContributeSearch';

const API='/api/player-connect-video';
const MIMES:Record<string,string>={mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',m4v:'video/x-m4v'};
type Signed={url:string;key:string;fields:Record<string,string>};
type Review={id:string;playerId:string;key:string;submittedBy:string;submittedAt:string};
async function token(){
  await auth.authStateReady?.();
  return await auth.currentUser?.getIdToken().catch(()=>'') || '';
}

export default function ConnectIntroSubmission({selectedPlayer}:{selectedPlayer:ContributePlayer|null}){
  const [player,setPlayer]=useState<ContributePlayer|null>(null);
  const selected=selectedPlayer||player;
  const [signed,setSigned]=useState<Signed|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [reviewer,setReviewer]=useState(false);
  const [reviews,setReviews]=useState<Review[]>([]);
  const form=useRef<HTMLFormElement>(null),file=useRef<HTMLInputElement>(null),submitted=useRef(false);
  const frameName='yat-connect-intro-upload';
  const refreshReview=async()=>{
    const t=await token();
    if(!t)return;
    const result=await fetch(`${API}?playerId=${encodeURIComponent(selected?.playerId||'1')}&me=1&review=1`,{headers:{'x-firebase-token':t},cache:'no-store'})
      .then(r=>r.ok?r.json():null).catch(()=>null);
    if(result?.submissions)setReviews(result.submissions);
  };
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      const t=await token();
      if(!t||!active)return;
      const r=await fetch(`${API}?playerId=${encodeURIComponent(selected?.playerId||'1')}&me=1`,{headers:{'x-firebase-token':t},cache:'no-store'})
        .then(v=>v.ok?v.json():null).catch(()=>null);
      if(!active)return;
      setReviewer(Boolean(r?.canUpload));
    };
    void check();
    const events=['yat-auth-success','yat-sign-out'];
    events.forEach(event=>window.addEventListener(event,check));
    return()=>{active=false;events.forEach(event=>window.removeEventListener(event,check));};
  },[selected?.playerId]);
  useEffect(()=>{
    if(!signed||!form.current)return;
    submitted.current=true;
    form.current.submit();
  },[signed]);
  const post=async(body:Record<string,unknown>,pid:string)=>{
    const t=await token();
    if(!t){openSignIn();throw new Error('Sign in to upload your introductory video.');}
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-firebase-token':t},
      body:JSON.stringify({playerId:pid,...body})});
    const json=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(json.error||'Please try again.');
    return json;
  };
  const pick=async()=>{
    if(!selected){setMessage('Find and select your player profile first.');return;}
    const video=file.current?.files?.[0];
    if(!video)return;
    setBusy(true);setMessage('');
    try{
      const ext=video.name.split('.').pop()?.toLowerCase()||'';
      const contentType=(video.type||MIMES[ext]||'').toLowerCase();
      if(!Object.hasOwn(MIMES,ext))throw new Error('Choose an MP4, MOV, WebM or M4V file.');
      if(video.size>500*1024*1024)throw new Error('Maximum file size: 500 MB.');
      setSigned(await post({action:'sign-intro',size:video.size,contentType},selected.playerId));
    }catch(err){setMessage((err as Error).message);setBusy(false);if(file.current)file.current.value='';}
  };
  const onUploaded=async()=>{
    if(!submitted.current||!signed||!selected)return;
    submitted.current=false;
    try{
      await post({action:'submit-intro',key:signed.key},selected.playerId);
      setMessage('Video received. A YAT?STATS reviewer will verify and approve it before publication.');
    }catch(err){setMessage((err as Error).message);}
    finally{setBusy(false);setSigned(null);if(file.current)file.current.value='';}
  };
  const review=async(item:Review,decision:'approve'|'reject')=>{
    if(!window.confirm(`${decision==='approve'?'Publish':'Reject'} this introductory video for player ${item.playerId}?`))return;
    setBusy(true);setMessage('');
    try{
      await post({action:'review-intro',reviewId:item.id,decision},item.playerId);
      setMessage(`Submission ${decision==='approve'?'published':'rejected'}.`);
      await refreshReview();
    }catch(err){setMessage((err as Error).message);}
    finally{setBusy(false);}
  };
  return <section className="yat-connect-intro" id="sec-video-upload" aria-label="Send a player introduction video">
    <span className="yat-connect-intro-tag">FOR PLAYERS · PUBLIC INTRODUCTION VIDEOS</span>
    <h3>RECORD YOUR INTRODUCTION</h3>
    <p>Interested in YAT-A-BOY Player Connect? Record a short, vertical video inviting your fans to request a message when bookings launch. This is a <strong>public introduction only</strong>, not a paid fan order.</p>
    {!selected
      ? <div className="yat-connect-intro-find"><strong>FIND YOUR PLAYER PROFILE</strong><ContributeSearch mode="player" playerOnly onPlayer={setPlayer}/></div>
      : <div className="yat-connect-intro-selected"><i className="ri-user-line" aria-hidden="true"/><span><strong>{selected.displayName}</strong><small>{selected.schoolName||'YAT?STATS alumni'}</small></span><button type="button" onClick={()=>setPlayer(null)} disabled={Boolean(selectedPlayer)}>CHANGE</button></div>}
    <form ref={form} action={signed?.url||'#'} method="post" encType="multipart/form-data" target={frameName}>
      {signed&&Object.entries(signed.fields).map(([k,v])=><input type="hidden" name={k} value={v} key={k}/>)}
      <label className={`yat-connect-intro-upload${busy||!selected?' is-disabled':''}`}>
        <i className="ri-upload-cloud-2-line" aria-hidden="true"/>
        {busy?'UPLOADING · KEEP THIS PAGE OPEN':'UPLOAD PORTRAIT INTRO VIDEO'}
        <input type="file" name="file" hidden disabled={busy||!selected}
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v" ref={file} onChange={pick}/>
      </label>
    </form>
    <iframe hidden title="Player intro video upload" name={frameName} onLoad={onUploaded}/>
    <small>Sign in to upload. MP4 portrait (9:16) preferred; up to 500 MB. Submissions require YAT?STATS review before going live. Select only your own profile or a player whose permission you have.</small>
    {message&&<p className="yat-connect-intro-message" role="status">{message}</p>}
    {reviewer&&<div className="yat-connect-intro-review">
      <button type="button" onClick={()=>void refreshReview()}>REVIEW PENDING INTRO VIDEOS</button>
      {reviews.map(item=><div key={item.id} className="yat-connect-intro-review-row">
        <span>PLAYER {item.playerId} · {new Date(item.submittedAt).toLocaleDateString()}</span>
        <a href={`https://yatstats-assets.s3.us-west-2.amazonaws.com/${item.key}`} target="_blank" rel="noopener noreferrer">VIEW VIDEO</a>
        <button type="button" disabled={busy} onClick={()=>void review(item,'approve')}>APPROVE</button>
        <button type="button" disabled={busy} onClick={()=>void review(item,'reject')}>REJECT</button>
      </div>)}
      {reviews.length===0&&<small>Load pending introductions to review.</small>}
    </div>}
    <style jsx>{`
      .yat-connect-intro{display:flex;flex-direction:column;gap:12px;padding:24px 0 5px;border-top:1px solid var(--line);scroll-margin-top:calc(var(--row1-h,36px) + var(--row2-h,54px) + var(--row3-h,95px) + 12px);}
      .yat-connect-intro-tag{color:#cfa344;font:800 11px/1.2 var(--yat-font-compact);}
      .yat-connect-intro h3{margin:0;font:900 26px/1 var(--yat-font-compact);}
      .yat-connect-intro p{max-width:680px;margin:0;font:400 13px/1.5 var(--yat-font-ui);color:var(--muted);}
      .yat-connect-intro-find{display:flex;flex-direction:column;gap:8px;max-width:680px;}
      .yat-connect-intro-find>strong{font:800 14px var(--yat-font-compact);}
      .yat-connect-intro-selected{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:8px;padding:10px;max-width:680px;}
      .yat-connect-intro-selected>span{display:flex;flex-direction:column;flex:1;gap:3px;}
      .yat-connect-intro-selected strong{font:800 16px var(--yat-font-compact);}
      .yat-connect-intro-selected small{color:var(--muted);}
      .yat-connect-intro-selected button{border:0;color:inherit;background:none;text-decoration:underline;font-size:11px;cursor:pointer;}
      .yat-connect-intro-upload{display:inline-flex;align-items:center;gap:8px;background:#ffc044;color:#131313;border-radius:99px;padding:11px 18px;cursor:pointer;font:900 15px/1.1 var(--yat-font-compact);max-width:100%;}
      .yat-connect-intro-upload.is-disabled{opacity:.55;cursor:not-allowed;}
      .yat-connect-intro>small{color:var(--muted);font:400 11px/1.45 var(--yat-font-ui);max-width:680px;}
      .yat-connect-intro-message{color:var(--fg)!important;font-weight:700!important;}
      .yat-connect-intro-review{display:flex;flex-direction:column;gap:9px;border:1px solid var(--line);padding:12px;max-width:680px;}
      .yat-connect-intro-review button{cursor:pointer;}
      .yat-connect-intro-review-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border-top:1px solid var(--line);font-size:12px;}
      @media(max-width:740px){.yat-connect-intro-upload{justify-content:center;width:100%;}}
    `}</style>
  </section>;
}
