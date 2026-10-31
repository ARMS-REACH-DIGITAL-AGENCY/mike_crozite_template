'use client';
import {useEffect,useRef,useState} from 'react';
import {auth} from '@/lib/firebase';
import {copyStoryPhoto,prepareStoryPhoto} from '@/lib/storyPhotoUpload';
import WhereYatReactions from './WhereYatReactions';

type Photo={web:string;full:string;thumb:string};
type Picked={blob:Blob;name:string;preview:string};
export default function WhereYatMemory({id,storyKey,label,initialText,initialPhotos,playerId,hsid}:{id:number;storyKey:string;label:string;initialText:string;initialPhotos:Photo[];playerId:string;hsid:string}){
 const [text,setText]=useState(initialText);
 const [photos,setPhotos]=useState<Photo[]>(initialPhotos);
 const [owner,setOwner]=useState(false);
 const [menu,setMenu]=useState(false);
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState(initialText);
 const [keep,setKeep]=useState<Photo[]>(initialPhotos);
 const [picked,setPicked]=useState<Picked[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const fileInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  let active=true;
  async function check(){
   await auth.authStateReady?.();
   const token=await auth.currentUser?.getIdToken().catch(()=>'');
   if(!token){if(active)setOwner(false);return}
   const resp=await fetch('/api/contribute/where-yat-now/mine?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid),{headers:{'x-firebase-token':token},cache:'no-store'}).catch(()=>null);
   const result=resp?.ok?await resp.json().catch(()=>null):null;
   if(active)setOwner(Number(result?.submission?.id)===id);
  }
  void check();window.addEventListener('yat-auth-success',check);window.addEventListener('yat-sign-out',check);
  return()=>{active=false;window.removeEventListener('yat-auth-success',check);window.removeEventListener('yat-sign-out',check)};
 },[id,playerId,hsid]);
 useEffect(()=>()=>{picked.forEach(p=>URL.revokeObjectURL(p.preview))},[picked]);
 function startEdit(){setDraft(text);setKeep(photos);setPicked([]);setEditing(true);setMenu(false);setError('')}
 async function addPhotos(list:FileList|null){
  if(!list)return;
  if(keep.length+picked.length+list.length>4){setError('Up to four photos per memory.');return}
  setBusy(true);
  try{const next=await Promise.all(Array.from(list).map(async file=>{const x=await prepareStoryPhoto(await copyStoryPhoto(file));return {...x,preview:URL.createObjectURL(x.blob)}}));setPicked(v=>[...v,...next]);setError('')}
  catch(e){setError(e instanceof Error?e.message:'Photo could not be prepared.')}
  finally{setBusy(false);if(fileInput.current)fileInput.current.value=''}
 }
 async function save(){
  if(busy||!draft.trim())return;
  setBusy(true);setError('');
  try{
   await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Sign in to edit your memory.');
   const form=new FormData();form.set('submissionId',String(id));form.set('storyKey',storyKey);form.set('story',draft.trim());
   keep.forEach(p=>form.append('keepPhotos',p.full));
   picked.forEach(p=>form.append('photos',p.blob,p.name));
   const r=await fetch('/api/contribute/where-yat-now/memory',{method:'PATCH',headers:{'x-firebase-token':token},body:form});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error||'Could not save memory.');
   setText(data.story);setPhotos(data.photos);setEditing(false);setPicked([]);
  }catch(e){setError(e instanceof Error?e.message:'Could not save memory.')}finally{setBusy(false)}
 }
 return <article id={'where-yat-'+storyKey} className="wyn-story-card ysf">
  <div className="ysv-head wyn-memory-header">
   <div className="ysv-who"><strong>{label}</strong></div>
   {owner&&!editing&&<div className="ysv-menu-wrap">
    <button type="button" className="ysv-menu-btn" aria-label="Memory options" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><i className="ri-more-fill"/></button>
    {menu&&<div className="ysv-menu" role="menu"><button type="button" role="menuitem" onClick={startEdit}><i className="ri-pencil-line"/> Edit memory</button></div>}
   </div>}
  </div>
  {editing? <div className="ysv-edit wyn-memory-edit">
    <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={5} maxLength={5000} aria-label={'Edit '+label}/>
    <div className="wyn-memory-photos">
     {keep.map(p=><div key={p.full} className="wyn-memory-photo"><img src={p.thumb||p.web} alt="Saved memory"/><button type="button" onClick={()=>setKeep(list=>list.filter(x=>x.full!==p.full))} aria-label="Remove photo">×</button></div>)}
     {picked.map((p,i)=><div key={p.preview} className="wyn-memory-photo"><img src={p.preview} alt="New memory"/><button type="button" onClick={()=>setPicked(list=>list.filter((_,j)=>i!==j))} aria-label="Remove photo">×</button></div>)}
     {keep.length+picked.length<4&&<button type="button" className="wyn-memory-add" disabled={busy} onClick={()=>fileInput.current?.click()}><i className="ri-image-add-line"/> ADD PHOTOS</button>}
     <input hidden ref={fileInput} type="file" accept="image/*" multiple onChange={e=>void addPhotos(e.target.files)}/>
    </div>
    {error&&<p role="alert" className="ysv-note">{error}</p>}
    <div className="ysv-edit-actions"><button type="button" className="ysv-btn" onClick={()=>setEditing(false)}>Cancel</button><button type="button" className="ysv-btn ysv-btn-primary" disabled={busy||!draft.trim()} onClick={()=>void save()}>{busy?'Saving…':'Save memory'}</button></div>
   </div>:<>
    {photos.length>0&&<div className="wyn-story-photo-grid">{photos.map((p,i)=><a key={p.full||i} href={p.full||p.web} target="_blank" rel="noopener noreferrer"><img src={p.web||p.thumb} alt={label+' photo '+(i+1)} className="wyn-story-image"/></a>)}</div>}
    <div className="wyn-story-body"><p style={{whiteSpace:'pre-wrap',margin:0}}>{text}</p></div>
    <div className="wyn-story-actions"><WhereYatReactions id={id} storyKey={storyKey}/></div>
   </>}
   <style>{`
    .wyn-memory-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--wyn-border);gap:8px}
    .wyn-memory-header .ysv-who{font:700 13px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif)}
    .wyn-memory-edit{padding:12px;display:flex;flex-direction:column;gap:12px}
    .wyn-memory-edit textarea{box-sizing:border-box;width:100%;min-height:130px;padding:12px;border:1px solid var(--wyn-border);background:var(--wyn-card-bg);color:var(--wyn-card-text);border-radius:8px;font:400 15px/1.5 var(--yat-font-ui,Archivo,Arial,sans-serif)}
    .wyn-memory-photos{display:flex;flex-wrap:wrap;gap:8px}
    .wyn-memory-photo{position:relative;width:85px;height:85px}
    .wyn-memory-photo img{width:100%;height:100%;object-fit:contain;border-radius:6px}
    .wyn-memory-photo button{position:absolute;top:0;right:0;background:#222;color:white;border:0;border-radius:50%;width:24px;height:24px}
    .wyn-memory-add{min-height:85px;padding:10px;border:1px dashed var(--wyn-border);border-radius:6px;background:transparent;color:inherit;cursor:pointer}
    .wyn-memory-add i{font-size:20px;display:block}
   `}</style>
 </article>;
}
