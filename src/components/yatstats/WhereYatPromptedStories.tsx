'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import {copyStoryPhoto,prepareStoryPhoto} from '@/lib/storyPhotoUpload';
import {WHERE_YAT_PROMPTS,WHERE_YAT_MEMORY_MAX_CHARS,type WhereYatPromptKey} from '@/lib/whereYatPrompts';
import WhereYatMemory from './WhereYatMemory';
import {openContribute} from '@/lib/contribute';
import type {FlipCardSaved} from './WhereYatFlipCardEditor';
type Photo={web:string;full:string;thumb:string};
type Saved=FlipCardSaved;
const col:Record<WhereYatPromptKey,keyof Saved>={favoriteHs:'favorite_hs_memory',favoriteAfter:'favorite_post_hs_memory',family:'family_life',story:'story'};
export default function WhereYatPromptedStories({playerId,hsid,name,school}:{playerId:string;hsid:string;name:string;school:string}){
 const [saved,setSaved]=useState<Saved|null>(null),[loaded,setLoaded]=useState(false),[editing,setEditing]=useState<WhereYatPromptKey|null>(null);
 const [draft,setDraft]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attested,setAttested]=useState(false);
 useEffect(()=>{let active=true;async function load(){await auth.authStateReady?.();const t=await auth.currentUser?.getIdToken().catch(()=>'');if(!t){if(active)setLoaded(true);return;}const r=await fetch('/api/contribute/where-yat-now/mine?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid),{headers:{'x-firebase-token':t},cache:'no-store'}).catch(()=>null);const j=r?.ok?await r.json().catch(()=>null):null;if(active){setSaved(j?.submission||null);setLoaded(true);}}void load();window.addEventListener('yat-auth-success',load);return()=>{active=false;window.removeEventListener('yat-auth-success',load)}},[playerId,hsid]);
 function open(key:WhereYatPromptKey){setEditing(key);setDraft(String(saved?.[col[key]]||''));setFile(null);setError('');}
 function join(){document.body.classList.add('drawer-account-open','drawer-open');window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:'register'}));}
 async function save(key:WhereYatPromptKey){
  if(busy||!draft.trim()||draft.length>WHERE_YAT_MEMORY_MAX_CHARS)return;
  setBusy(true);setError('');
  try{
   await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();
   if(!token){join();throw Error('Join or sign in to save your memory. Your draft remains here.');}
   let id=saved?.id;
   if(!id){
    if(!attested)throw Error('Please confirm that you are this alumnus or have permission to contribute.');
    const a=await fetch('/api/contribute/where-yat-now/start',{method:'POST',headers:{'content-type':'application/json','x-firebase-token':token},body:JSON.stringify({playerId,hsid,name,claimAttested:true})});
    const j=await a.json();if(!a.ok)throw Error(j.error||'Could not start your profile.');id=j.id;
   }
   const data=new FormData();data.set('submissionId',String(id));data.set('storyKey',key);data.set('story',draft.trim());
   const previous=saved?.memory_photos_json?.[key]||[];
   previous.forEach(p=>data.append('keepPhotos',p.full));
   if(file){const x=await prepareStoryPhoto(await copyStoryPhoto(file));data.append('photos',x.blob,x.name);}
   const r=await fetch('/api/contribute/where-yat-now/memory',{method:'PATCH',headers:{'x-firebase-token':token},body:data});const result=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(result.error||'Unable to save memory.');
   setSaved(old=>({...old,id:id!,status:old?.status||'pending',[col[key]]:result.story,memory_photos_json:{...(old?.memory_photos_json||{}),[key]:result.photos}} as Saved));
   setEditing(null);setFile(null);
   window.dispatchEvent(new CustomEvent('yat:where-yat-submitted',{detail:{playerId,hsid}}));
  }catch(e){setError(e instanceof Error?e.message:'Could not save memory.')}finally{setBusy(false)}
 }
 return <section className="wyn-prompt-feed" aria-label="Life after baseball story prompts">
  <p className="wyn-prompt-intro">We want to know how life has been since baseball. Open any memory, share your story and add a photo. Connect. Contribute. Remember.</p>
  {saved?.status==='pending'&&<p className="wyn-prompt-status" role="status">YOUR STORIES ARE SAVED — PENDING ALUMNI IDENTITY APPROVAL. They are only visible to you until approved.</p>}
  {WHERE_YAT_PROMPTS.map(({key,label})=>{
   const actual=label.replace('YOUR HIGH SCHOOL',school.toUpperCase());const value=String(saved?.[col[key]]||'');
   return <article className="wyn-prompt-card" key={key}>
    {value&&saved?.id?<WhereYatMemory id={saved.id} storyKey={key} label={actual} alumnusName={saved?.display_name||name} showReactions={saved.status==='approved'} initialText={value} initialPhotos={saved.memory_photos_json?.[key]||[]} playerId={playerId} hsid={hsid}/>:<button type="button" className="wyn-prompt-opener" onClick={()=>open(key)}><strong>{actual}</strong><span>{loaded?'WRITE YOUR STORY +':'LOADING…'}</span></button>}
    {editing===key&&<div className="wyn-prompt-editor">
     <textarea aria-label={actual} rows={5} maxLength={WHERE_YAT_MEMORY_MAX_CHARS} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Tell us your memory…"/>
     <div className="wyn-prompt-controls"><span>{draft.length} / {WHERE_YAT_MEMORY_MAX_CHARS} characters</span><label>ADD PHOTO <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div>
     {!saved&&<label className="wyn-prompt-claim"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/> I am this alumnus or have permission to contribute. I understand that identity verification is required before publication.</label>}
     {error&&<p role="alert">{error}</p>}
     <div className="wyn-prompt-buttons"><button type="button" onClick={()=>setEditing(null)}>CANCEL</button><button type="button" disabled={busy||!draft.trim()} onClick={()=>void save(key)}>{busy?'SAVING…':'SAVE MEMORY'}</button></div>
    </div>}
   </article>
  })}
  <button type="button" className="wyn-design-card-cta" onClick={()=>openContribute({tab:'retired_card',player:{playerId,displayName:name,schoolId:hsid,schoolName:school}})}><i className="ri-id-card-line" aria-hidden="true"/> NOW DESIGN YOUR FLIP CARD</button>
  <style>{`
   .wyn-prompt-feed{display:grid;gap:10px}.wyn-design-card-cta{width:100%;min-height:52px;background:#e5ba42;color:#111;border:1px solid #bc8a19;border-radius:6px;font:800 15px Oswald,Arial,sans-serif;cursor:pointer}.wyn-prompt-intro{margin:0;padding:10px;font:400 14px/1.4 var(--yat-font-ui,Arial,sans-serif)}.wyn-prompt-status{padding:10px 12px;border:1px solid #b99236;font:700 12px/1.4 var(--yat-font-ui,Arial,sans-serif)}.wyn-prompt-card{border:1px solid var(--wyn-border,rgba(128,128,128,.35));border-radius:8px;overflow:hidden;background:var(--wyn-card-bg,rgba(128,128,128,.08))}.wyn-prompt-opener{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;padding:16px;background:transparent;color:inherit;text-align:left;cursor:pointer}.wyn-prompt-opener strong{font:700 13px/1.4 var(--yat-font-condensed,Oswald,Arial,sans-serif)}.wyn-prompt-opener span{white-space:nowrap;font-size:11px}.wyn-prompt-editor{display:grid;gap:10px;padding:12px;border-top:1px solid var(--wyn-border)}body.light-theme .wyn-prompt-editor textarea{background:#fff!important;color:#1a1a1a!important;caret-color:#1a1a1a!important;border-color:#aaa!important}body.light-theme .wyn-prompt-editor textarea::placeholder{color:#666!important}.wyn-prompt-editor textarea{box-sizing:border-box;width:100%;min-height:140px;padding:12px;border-radius:6px;border:1px solid #888;background:var(--wyn-card-bg,#1b1b1b);color:inherit;font:400 15px/1.5 var(--yat-font-ui,Arial,sans-serif)}.wyn-prompt-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px}.wyn-prompt-controls input{max-width:180px}.wyn-prompt-claim{display:flex;gap:8px;align-items:flex-start;font-size:12px}.wyn-prompt-buttons{display:flex;justify-content:flex-end;gap:8px}.wyn-prompt-buttons button{padding:9px 14px;border:1px solid #888;border-radius:5px;background:#222;color:white;cursor:pointer}.wyn-prompt-buttons button:last-child{background:#e6b93e;color:#111;font-weight:800}.wyn-prompt-buttons button:disabled{opacity:.5}
  `}</style>
 </section>;
}
