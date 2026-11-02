'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {auth} from '@/lib/firebase';
import {jpegName,shrinkPhoto} from '@/lib/shrinkPhoto';
import {copyStoryPhoto,prepareStoryPhoto,type StoryPhotoData} from '@/lib/storyPhotoUpload';
import type {Crop} from '@/lib/contribute';
import PhotoCropper from './PhotoCropper';
import WhereYatProofCard,{type WhereYatProof} from './WhereYatProofCard';
import {WHERE_YAT_PROMPTS,type WhereYatPromptKey} from '@/lib/whereYatPrompts';

type Photo={web:string;full:string;thumb:string};
type MemoryPhoto={src:string;original?:Photo;upload?:StoryPhotoData};
export type FlipCardSaved={
 id:number;status:string;display_name?:string;location_city?:string;location_state?:string;
 occupation?:string;company_name?:string;business_website?:string;company_logo_url?:string;
 business_headshot_url?:string;business_contact_email?:string;business_contact_phone?:string;
 business_public_opt_in?:boolean;linkedin_url?:string;facebook_url?:string;instagram_url?:string;x_url?:string;
 favorite_hs_memory?:string;favorite_post_hs_memory?:string;family_life?:string;story?:string;
 featured_memory_key?:string;memory_photos_json?:Record<string,Photo[]>;life_photos_json?:Photo[];photo_url?:string|null;
};
const answers:Record<WhereYatPromptKey,keyof FlipCardSaved>={
 favoriteHs:'favorite_hs_memory',favoriteAfter:'favorite_post_hs_memory',family:'family_life',story:'story'
};
function initialMemoryPhotos(saved:FlipCardSaved):Record<string,MemoryPhoto[]>{
 const result:Record<string,MemoryPhoto[]>={};
 for(const prompt of WHERE_YAT_PROMPTS){
  const key=prompt.key;
  const savedPhotos=saved.memory_photos_json?.[key];
  const legacy:Photo[]=key==='family'?(saved.life_photos_json||[]):
   key==='story'&&saved.photo_url?[{web:saved.photo_url,full:saved.photo_url,thumb:saved.photo_url}]:[];
  const list=Array.isArray(savedPhotos)?savedPhotos:legacy;
  result[key]=list.map(photo=>({src:photo.web||photo.thumb||photo.full,original:photo}));
 }
 return result;
}
export default function WhereYatFlipCardEditor({
 saved,playerId,hsid,name,school,onSaved,drawerMode=false
}:{
 saved:FlipCardSaved;playerId:string;hsid:string;name:string;school:string;
 onSaved:(updated:FlipCardSaved)=>void;drawerMode?:boolean
}){
 const router=useRouter();
 const [open,setOpen]=useState(drawerMode);
 const [busy,setBusy]=useState(false);
 const [preparing,setPreparing]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [values,setValues]=useState<Record<string,string>>({
  city:saved.location_city||'',state:saved.location_state||'',occupation:saved.occupation||'',
  company:saved.company_name||'',website:saved.business_website||'',
  linkedin:saved.linkedin_url||'',facebook:saved.facebook_url||'',
  instagram:saved.instagram_url||'',x:saved.x_url||'',
  businessEmail:saved.business_contact_email||'',businessPhone:saved.business_contact_phone||'',
  featuredMemory:saved.featured_memory_key||'story'
 });
 const [consent,setConsent]=useState(!!saved.business_public_opt_in);
 const draftKey='yat:retired-card-draft:'+hsid+':'+playerId+':'+saved.id;
 const [draftRestored,setDraftRestored]=useState(false);
 useEffect(()=>{
  try{
   const draft=window.localStorage.getItem(draftKey);
   if(draft){
    const data=JSON.parse(draft) as {values?:Record<string,string>;consent?:boolean};
    if(data.values&&typeof data.values==='object')setValues(current=>({...current,...data.values}));
    if(typeof data.consent==='boolean')setConsent(data.consent);
   }
  }catch{/* Storage may be unavailable in private browsing. */}
  setDraftRestored(true);
 },[draftKey]);
 useEffect(()=>{
  if(!draftRestored)return;
  try{window.localStorage.setItem(draftKey,JSON.stringify({values,consent}));}catch{/* Manual save remains available. */}
 },[draftKey,draftRestored,values,consent]);

 const [logo,setLogo]=useState<File|null>(null);
 const [headshot,setHeadshot]=useState<File|null>(null);
 const [hero,setHero]=useState<File|null>(null);
 const [heroCrop,setHeroCrop]=useState<Crop|null>(null);
 const [heroUploaded,setHeroUploaded]=useState(false);
 const [memoryPhotos,setMemoryPhotos]=useState<Record<string,MemoryPhoto[]>>(()=>initialMemoryPhotos(saved));
 const [memoryTouched,setMemoryTouched]=useState<Record<string,boolean>>({});
 const memoryObjectUrls=useRef<string[]>([]);
 const logoPreview=useMemo(()=>logo?URL.createObjectURL(logo):null,[logo]);
 const headshotPreview=useMemo(()=>headshot?URL.createObjectURL(headshot):null,[headshot]);
 const heroPreview=useMemo(()=>hero?URL.createObjectURL(hero):null,[hero]);
 useEffect(()=>()=>{if(logoPreview)URL.revokeObjectURL(logoPreview)},[logoPreview]);
 useEffect(()=>()=>{if(headshotPreview)URL.revokeObjectURL(headshotPreview)},[headshotPreview]);
 useEffect(()=>()=>{if(heroPreview)URL.revokeObjectURL(heroPreview)},[heroPreview]);
 useEffect(()=>()=>{memoryObjectUrls.current.forEach(url=>URL.revokeObjectURL(url))},[]);

 function value(key:string,next:string){
  setValues(previous=>({...previous,[key]:next}));
  setNotice('');
 }
 const keys=WHERE_YAT_PROMPTS.filter(prompt=>String(saved[answers[prompt.key]]||'').trim());
 const featured=(keys.some(prompt=>prompt.key===values.featuredMemory)?values.featuredMemory:keys[0]?.key||'story') as WhereYatPromptKey;
 const selected=WHERE_YAT_PROMPTS.find(prompt=>prompt.key===featured);
 const proof:WhereYatProof={
  playerId,hsid,displayName:name,city:values.city,state:values.state,
  occupation:values.occupation,company:values.company,website:values.website,
  linkedin:values.linkedin,facebook:values.facebook,instagram:values.instagram,x:values.x,
  businessEmail:values.businessEmail,businessPhone:values.businessPhone,
  logoUrl:logoPreview||saved.company_logo_url||null,
  businessHeadshotUrl:headshotPreview||saved.business_headshot_url||null,
  story:String(saved[answers[featured]]||''),
  storyPrompt:selected?.label.replace('YOUR HIGH SCHOOL',school.toUpperCase()),
  photoUrl:memoryPhotos[featured]?.[0]?.src||null,
  heroPreviewUrl:heroPreview,heroCrop,businessPublic:consent
 };

 async function addMemoryPhotos(key:WhereYatPromptKey,files:File[]){
  if(!files.length)return;
  if((memoryPhotos[key]?.length||0)+files.length>4){
   setError('Each memory can have up to four photos. Remove one before adding more.');return;
  }
  setPreparing(true);setError('');
  try{
   const incoming:MemoryPhoto[]=await Promise.all(files.map(async file=>{
    const prepared=await prepareStoryPhoto(await copyStoryPhoto(file));
    const src=URL.createObjectURL(prepared.blob);
    memoryObjectUrls.current.push(src);
    return {src,upload:prepared};
   }));
   setMemoryPhotos(previous=>({...previous,[key]:[...(previous[key]||[]),...incoming]}));
   setMemoryTouched(previous=>({...previous,[key]:true}));
   setNotice('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to prepare memory photos.');}
  finally{setPreparing(false);}
 }
 function removeMemoryPhoto(key:WhereYatPromptKey,index:number){
  setMemoryPhotos(previous=>({...previous,[key]:(previous[key]||[]).filter((_,i)=>i!==index)}));
  setMemoryTouched(previous=>({...previous,[key]:true}));
  setNotice('');
 }
 async function save(){
  if(busy||preparing)return;
  if(!keys.length){setError('Save at least one memory before designing your flip card.');return;}
  if(hero&&!heroUploaded&&!heroCrop){setError('Position your playing photo before saving.');return;}
  setBusy(true);setError('');setNotice('');
  let currentStep='card details';
  try{
   await auth.authStateReady?.();
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Sign in to save your flip card.');
   const cardData=new FormData();
   cardData.set('submissionId',String(saved.id));
   for(const [key,v] of Object.entries(values))cardData.set(key,v);
   cardData.set('featuredMemory',featured);
   if(consent)cardData.set('businessPublic','yes');
   if(logo)cardData.set('companyLogo',logo);
   if(headshot)cardData.set('businessHeadshot',headshot);
   const cardResponse=await fetch('/api/contribute/where-yat-now/card',{
    method:'PATCH',headers:{'x-firebase-token':token},body:cardData
   });
   const cardBody=await cardResponse.json().catch(()=>({}));
   if(!cardResponse.ok)throw Error(cardBody.error||'Unable to save card details.');
   let updated:FlipCardSaved={
    ...saved,location_city:values.city,location_state:values.state,occupation:values.occupation,
    company_name:values.company,business_website:values.website,
    linkedin_url:values.linkedin,facebook_url:values.facebook,instagram_url:values.instagram,x_url:values.x,
    business_contact_email:values.businessEmail,business_contact_phone:values.businessPhone,
    business_public_opt_in:consent,featured_memory_key:featured,
    company_logo_url:cardBody.card?.company_logo_url||saved.company_logo_url,
    business_headshot_url:cardBody.card?.business_headshot_url||saved.business_headshot_url
   };
   onSaved(updated);
   setLogo(null);setHeadshot(null);
   for(const prompt of WHERE_YAT_PROMPTS){
    if(!memoryTouched[prompt.key])continue;
    currentStep='photos for '+prompt.label;
    const memory=new FormData();
    memory.set('submissionId',String(saved.id));
    memory.set('storyKey',prompt.key);
    memory.set('story',String(saved[answers[prompt.key]]||''));
    for(const image of memoryPhotos[prompt.key]||[]){
     if(image.original)memory.append('keepPhotos',image.original.full);
     else if(image.upload)memory.append('photos',image.upload.blob,image.upload.name);
    }
    const response=await fetch('/api/contribute/where-yat-now/memory',{
     method:'PATCH',headers:{'x-firebase-token':token},body:memory
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Unable to save memory photos.');
    const newPhotos=Array.isArray(result.photos)?result.photos as Photo[]:[];
    updated={...updated,memory_photos_json:{...updated.memory_photos_json,[prompt.key]:newPhotos}};
    onSaved(updated);
    setMemoryPhotos(previous=>({
     ...previous,[prompt.key]:newPhotos.map(photo=>({src:photo.web||photo.full,original:photo}))
    }));
    setMemoryTouched(previous=>({...previous,[prompt.key]:false}));
   }
   let photoNotice='';
   if(hero&&!heroUploaded){
    currentStep='upper playing photo';
    const resized=await shrinkPhoto(hero);
    const photoData=new FormData();
    photoData.set('idToken',token);
    photoData.set('photo',resized,resized.type==='image/jpeg'?jpegName(hero):hero.name);
    photoData.set('purpose','back_hero');
    photoData.set('playerId',playerId);
    photoData.set('playerName',name);
    photoData.set('hsid',hsid);
    photoData.set('year',String(new Date().getFullYear()));
    photoData.set('tagged','[]');
    photoData.set('crop',JSON.stringify(heroCrop));
    photoData.set('pageUrl',window.location.href);
    const response=await fetch('/api/contribute/photo',{method:'POST',credentials:'include',body:photoData});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Unable to save playing photo.');
    if(result.status==='rejected')throw Error(result.message||'The photo was rejected.');
    setHeroUploaded(true);
    if(result.status==='approved'){
     window.dispatchEvent(new CustomEvent('yat:contribute-photo-published',{
      detail:{playerId,purpose:'back_hero',uploadId:result.id||''}
     }));
     router.refresh();
     photoNotice=' Your playing photo was approved and published.';
    }else{
     photoNotice=' Your playing photo was received and is awaiting its photo safety check.';
    }
   }
   try{window.localStorage.removeItem(draftKey);}catch{}
   setNotice('Card details and selected memory photos saved.'+photoNotice);
  }catch(e){
   setError('Could not finish saving '+currentStep+': '+(e instanceof Error?e.message:'Please try again.')+
    ' Other completed changes may already be saved; your remaining selections are retained for retry.');
  }finally{setBusy(false);}
 }
 const defs:[string,string][]=[
  ['city','CITY'],['state','STATE'],['occupation','NOW / PROFESSION'],['company','BUSINESS NAME'],
  ['website','BUSINESS WEBSITE (LINKED FROM LOGO)'],['linkedin','LINKEDIN'],['facebook','FACEBOOK'],
  ['x','X'],['instagram','INSTAGRAM'],['businessEmail','PUBLIC BUSINESS EMAIL'],
  ['businessPhone','PUBLIC BUSINESS PHONE / TEXT']
 ];
 const inputDisabled=busy||preparing;
 return <div className="wyn-card-editor">
  {!drawerMode&&<button type="button" className="wyn-card-open" onClick={()=>setOpen(v=>!v)}>
   <i className="ri-edit-line"/> {open?'CLOSE EDITOR':'DESIGN THE BACK OF YOUR FLIP CARD'}
  </button>}
  {open&&<section className="wyn-card-fields" aria-label="One complete retired alumni flip-card designer">
   <div className="wyn-card-actions wyn-save-top">
    <button type="button" disabled={inputDisabled||!keys.length} onClick={()=>void save()}>{busy?'SAVING…':'SAVE MY FLIP CARD'}</button>
    <small>Text changes are kept on this device until saved. New photo files must be saved before leaving.</small>
   </div>
   <div className="wyn-card-part">
    <h3>1. TOP PLAYING PHOTO</h3>
    <p className="wyn-card-hint">This is the wide image above your Where YAT Now information. Upload, position, and review it together with the entire card below.</p>
    <label><span>UPLOAD / REPLACE YOUR BACK-OF-CARD PHOTO</span>
     <input type="file" accept="image/*" disabled={inputDisabled} onChange={e=>{
      const file=e.currentTarget.files?.[0]||null;
      setHero(file);setHeroCrop(null);setHeroUploaded(false);setNotice('');setError('');
     }}/>
    </label>
    {heroPreview&&(!heroUploaded?<div className="wyn-crop-control">
     <h4>POSITION YOUR PHOTO</h4>
     <PhotoCropper src={heroPreview} aspect={20/7} guide="name-left" onChange={setHeroCrop}/>
     <p className="wyn-card-hint">Adjust the crop here; the complete card proof below updates automatically.</p>
    </div>:<p className="wyn-card-hint" role="status">Playing photo submitted. This is the image you selected.</p>)}
   </div>
   <div className="wyn-card-part">
    <h3>2. BUSINESS IMAGES</h3>
    <label><span>BUSINESS LOGO — CLICKABLE WEBSITE LINK</span>
     <input type="file" accept="image/png,image/jpeg,image/webp" disabled={inputDisabled} onChange={e=>{
      setLogo(e.currentTarget.files?.[0]||null);setNotice('');
     }}/>
    </label>
    <label><span>BUSINESS HEADSHOT — UPPER RIGHT</span>
     <input type="file" accept="image/png,image/jpeg,image/webp" disabled={inputDisabled} onChange={e=>{
      setHeadshot(e.currentTarget.files?.[0]||null);setNotice('');
     }}/>
    </label>
   </div>
   <div className="wyn-card-part">
    <h3>3. YOUR CARD INFORMATION</h3>
    {defs.map(([key,label])=><label key={key}><span>{label}</span>
     <input value={values[key]||''} disabled={inputDisabled} onChange={e=>value(key,e.target.value)}/>
    </label>)}
    <label className="wyn-card-consent"><input type="checkbox" disabled={inputDisabled} checked={consent} onChange={e=>{
     setConsent(e.target.checked);setNotice('');
    }}/> Allow my business links and contact information to be public</label>
    <label><span>MEMORY FEATURED IN THE LOWER HALF</span>
     <select value={featured} disabled={inputDisabled} onChange={e=>value('featuredMemory',e.target.value)}>
      {keys.map(prompt=><option key={prompt.key} value={prompt.key}>
       {prompt.label.replace('YOUR HIGH SCHOOL',school.toUpperCase())}
      </option>)}
     </select>
    </label>
   </div>
   <div className="wyn-card-part">
    <h3>4. MEMORY PHOTOS</h3>
    <p className="wyn-card-hint">All four memories can be managed here. Photos stay attached to the correct memory, up to four per memory.</p>
    {keys.map(prompt=><div className="wyn-memory-upload" key={prompt.key}>
     <strong>{prompt.label.replace('YOUR HIGH SCHOOL',school.toUpperCase())}</strong>
     {(memoryPhotos[prompt.key]||[]).length>0&&<div className="wyn-photo-thumbs">
      {(memoryPhotos[prompt.key]||[]).map((photo,index)=><div className="wyn-photo-thumb" key={photo.src}>
       <img src={photo.src} alt={'Memory photo '+(index+1)}/>
       <button type="button" disabled={inputDisabled} aria-label={'Remove memory photo '+(index+1)}
        onClick={()=>removeMemoryPhoto(prompt.key,index)}>REMOVE</button>
      </div>)}
     </div>}
     <label><span>ADD PHOTOS ({(memoryPhotos[prompt.key]||[]).length}/4)</span>
      <input type="file" multiple accept="image/*" disabled={inputDisabled||(memoryPhotos[prompt.key]||[]).length>=4}
       onChange={e=>{
        const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';
        void addMemoryPhotos(prompt.key,files);
       }}/>
     </label>
    </div>)}
   </div>
   <div className="wyn-card-part wyn-proof-part">
    <h3>5. ONE COMPLETE FLIP-CARD PROOF</h3>
    <p className="wyn-card-hint">The upper playing photo, business information, featured memory and real six-tab footer are shown together at the final 5×7 proportions. No career stats placeholder.</p>
    <div className="wyn-card-proof"><WhereYatProofCard variant="full" proof={proof}/></div>
   </div>
   {notice&&<p className="wyn-card-notice" role="status">{notice}</p>}
   {error&&<p role="alert" className="wyn-card-error">{error}</p>}
   <div className="wyn-card-actions"><button type="button" disabled={inputDisabled||!keys.length} onClick={()=>void save()}>
    {busy?'SAVING…':preparing?'PREPARING IMAGES…':'SAVE MY COMPLETE FLIP CARD'}
   </button></div>
  </section>}
  <style>{'.wyn-card-editor{display:grid;gap:10px;min-width:0}.wyn-card-open{border:1px solid var(--wyn-border,rgba(128,128,128,.3));background:var(--wyn-card-bg,rgba(128,128,128,.1));color:inherit;border-radius:7px;padding:13px;font:700 13px Oswald,Arial,sans-serif;cursor:pointer}.wyn-card-fields{display:grid;gap:15px;padding:12px;min-width:0;border:1px solid var(--wyn-border,rgba(128,128,128,.3));border-radius:8px;background:var(--wyn-card-bg,rgba(128,128,128,.08));color:inherit}.wyn-card-part{display:grid;gap:10px;min-width:0;border-bottom:1px solid var(--wyn-border,rgba(128,128,128,.2));padding-bottom:14px}.wyn-card-part h3{font:700 19px/1.15 Oswald,Arial,sans-serif;margin:0}.wyn-card-part h4{font:700 14px Oswald,Arial,sans-serif;margin:0}.wyn-card-hint{font:400 12px/1.45 Archivo,Arial,sans-serif;opacity:.8;margin:0}.wyn-card-part>label,.wyn-memory-upload>label{display:grid;gap:5px;min-width:0;font:700 12px/1.3 Archivo,Arial,sans-serif}.wyn-card-part input:not([type=checkbox]),.wyn-card-part select{box-sizing:border-box;width:100%;min-height:40px;padding:8px;border:1px solid #888;border-radius:5px;color:inherit;background:var(--wyn-card-bg,#222)}.wyn-card-part input[type=file]{font:400 12px/1.4 Archivo,Arial,sans-serif}.wyn-card-consent{display:flex!important;align-items:flex-start;gap:9px}.wyn-card-consent input{margin:1px 0 0}.wyn-card-proof{width:100%;max-width:500px;margin:0 auto;min-width:0;aspect-ratio:5/7}.wyn-card-proof a{pointer-events:none}.wyn-card-proof .wyn-card{width:100%;height:100%}.wyn-save-top{position:sticky;top:0;z-index:12;background:var(--wyn-card-bg,#fff);padding:8px;display:grid;gap:4px}.wyn-save-top small{font:400 11px/1.4 Archivo,Arial,sans-serif;color:inherit}.wyn-card-part input:not([type=checkbox]),.wyn-card-part select{color:var(--wyn-card-text,#222)!important;background:var(--wyn-card-bg,#fff)!important;caret-color:currentColor}.wyn-card-actions{display:flex;gap:8px}.wyn-card-actions button{width:100%;min-height:46px;padding:10px 12px;border:1px solid #8a6916;border-radius:6px;background:#e9bc44;color:#111;font:700 14px Oswald,Arial,sans-serif;cursor:pointer}.wyn-card-actions button:disabled{opacity:.6;cursor:wait}.wyn-memory-upload{display:grid;gap:7px;padding:9px;border:1px solid var(--wyn-border,rgba(128,128,128,.3));border-radius:6px;min-width:0}.wyn-memory-upload strong{font:700 12px/1.3 Oswald,Arial,sans-serif}.wyn-photo-thumbs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.wyn-photo-thumb{min-width:0;display:grid;gap:3px}.wyn-photo-thumb img{display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#111}.wyn-photo-thumb button{min-height:30px;border:1px solid #888;background:transparent;color:inherit;font:700 11px Archivo,Arial,sans-serif}.wyn-crop-control{display:grid;gap:7px;max-width:100%;min-width:0}.wyn-crop-control .ypc{max-width:100%}.wyn-card-notice{padding:10px;background:rgba(60,130,70,.12);border:1px solid #59935c;border-radius:5px;font:600 12px/1.5 Archivo,Arial,sans-serif}.wyn-card-error{padding:10px;border:1px solid #c76565;border-radius:5px;color:#da6868;font:600 12px/1.5 Archivo,Arial,sans-serif;white-space:pre-wrap}'}</style>
 </div>;
}
