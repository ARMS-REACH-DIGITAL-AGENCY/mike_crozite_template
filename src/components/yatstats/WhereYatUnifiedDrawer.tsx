'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {auth} from '@/lib/firebase';
import {copyStoryPhoto,prepareStoryPhoto,createStoryUploadBody,type StoryPhotoData} from '@/lib/storyPhotoUpload';
import {shrinkPhoto} from '@/lib/shrinkPhoto';
import type {Crop} from '@/lib/contribute';
import {WHERE_YAT_PROMPTS,type WhereYatPromptKey} from '@/lib/whereYatPrompts';
import PhotoCropper from './PhotoCropper';
import WhereYatProofCard,{type WhereYatProof} from './WhereYatProofCard';
import type {FlipCardSaved} from './WhereYatFlipCardEditor';

type Picture={src:string;full?:string;prepared?:StoryPhotoData;crop?:Crop|null};
const fields:Record<WhereYatPromptKey,keyof FlipCardSaved>={
 favoriteHs:'favorite_hs_memory',favoriteAfter:'favorite_post_hs_memory',family:'family_life',story:'story'
};
const blank:Record<string,string>={
 displayName:'',email:'',contactPhone:'',city:'',state:'',retirementYear:'',occupation:'',company:'',
 website:'',linkedin:'',facebook:'',instagram:'',x:'',businessEmail:'',businessPhone:'',
 businessMessage:'',businessOffer:'',teammateTips:'',favoriteHs:'',favoriteAfter:'',family:'',story:''
};
const businessFields:[string,string][]=[
 ['occupation','NOW / PROFESSION'],['company','COMPANY / ORGANIZATION'],
 ['website','BUSINESS WEBSITE (LINKED FROM LOGO)'],['businessEmail','PUBLIC BUSINESS EMAIL'],
 ['businessPhone','PUBLIC BUSINESS PHONE OR TEXT'],['linkedin','LINKEDIN'],
 ['facebook','FACEBOOK'],['x','X'],['instagram','INSTAGRAM'],
 ['businessMessage','BUSINESS MESSAGE'],['businessOffer','SPECIAL OFFER']
];

export default function WhereYatUnifiedDrawer({saved,playerId,hsid,name,school,onSaved}:{
 saved:FlipCardSaved|null;playerId:string;hsid:string;name:string;school:string;
 onSaved:(record:FlipCardSaved)=>void
}){
 const [values,setValues]=useState<Record<string,string>>(()=>{
  const s=saved as unknown as Record<string,unknown>|null;
  return {...blank,
   displayName:String(s?.display_name||name),email:String(s?.contact_email||auth.currentUser?.email||''),
   contactPhone:String(s?.contact_phone||''),city:String(s?.location_city||''),
   state:String(s?.location_state||''),retirementYear:String(s?.retirement_year||''),
   occupation:String(s?.occupation||''),company:String(s?.company_name||''),
   website:String(s?.business_website||''),linkedin:String(s?.linkedin_url||''),
   facebook:String(s?.facebook_url||''),instagram:String(s?.instagram_url||''),
   x:String(s?.x_url||''),businessEmail:String(s?.business_contact_email||''),
   businessPhone:String(s?.business_contact_phone||''),
   businessMessage:String(s?.business_message||''),businessOffer:String(s?.business_offer||''),
   teammateTips:String(s?.private_teammate_tips||''),
   ...Object.fromEntries(WHERE_YAT_PROMPTS.map(p=>[p.key,String(s?.[fields[p.key]]||'')]))
  };
 });
 const [consent,setConsent]=useState(!!saved?.business_public_opt_in);
 const [attested,setAttested]=useState(false);
 const [sponsorInterest,setSponsorInterest]=useState(!!(saved as Record<string,unknown>|null)?.sponsorship_interest);
 const [featured,setFeatured]=useState<WhereYatPromptKey>(()=>
  (saved?.featured_memory_key as WhereYatPromptKey)||'family');
 const [hero,setHero]=useState<File|null>(null);
 const [heroCrop,setHeroCrop]=useState<Crop|null>(null);
 const [headshot,setHeadshot]=useState<File|null>(null);
 const [headshotCrop,setHeadshotCrop]=useState<Crop|null>(null);
 const [logo,setLogo]=useState<File|null>(null);
 const [photos,setPhotos]=useState<Record<string,Picture[]>>(()=>{
  const s=saved;
  return Object.fromEntries(WHERE_YAT_PROMPTS.map(({key})=>{
   const existing=s?.memory_photos_json?.[key];
   const legacy=key==='family'?s?.life_photos_json:key==='story'&&s?.photo_url?
    [{web:s.photo_url,full:s.photo_url,thumb:s.photo_url}]:[];
   return [key,(Array.isArray(existing)?existing:(legacy||[])).map(p=>({
    src:p.web||p.thumb||p.full,full:p.full||p.web
   }))];
  }));
 });
 const [selectedCrop,setSelectedCrop]=useState<{key:WhereYatPromptKey;index:number}|null>(null);
 const [showProof,setShowProof]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [preparing,setPreparing]=useState(false);
 const [submissionId,setSubmissionId]=useState<number|null>(null);
 const [receipt,setReceipt]=useState(false);
 const photoURLs=useRef<string[]>([]);
 const heroUrl=useMemo(()=>hero?URL.createObjectURL(hero):null,[hero]);
 const headshotUrl=useMemo(()=>headshot?URL.createObjectURL(headshot):null,[headshot]);
 const logoUrl=useMemo(()=>logo?URL.createObjectURL(logo):null,[logo]);
 useEffect(()=>()=>{if(heroUrl)URL.revokeObjectURL(heroUrl)},[heroUrl]);
 useEffect(()=>()=>{if(headshotUrl)URL.revokeObjectURL(headshotUrl)},[headshotUrl]);
 useEffect(()=>()=>{if(logoUrl)URL.revokeObjectURL(logoUrl)},[logoUrl]);
 useEffect(()=>()=>{photoURLs.current.forEach(u=>URL.revokeObjectURL(u));photoURLs.current=[]},[]);
 useEffect(()=>{if(!values.email&&auth.currentUser?.email)setValues(v=>({...v,email:auth.currentUser!.email||''}))},[values.email]);

 const set=(key:string,value:string)=>{setValues(v=>({...v,[key]:value}));setError('')};
 const available=WHERE_YAT_PROMPTS.filter(p=>values[p.key].trim());
 const selected=available.some(p=>p.key===featured)?featured:(available[0]?.key||featured);
 const selectedPhoto=photos[selected]?.[0];
 const prompt=WHERE_YAT_PROMPTS.find(p=>p.key===selected);
 const proof:WhereYatProof={
  playerId,hsid,displayName:values.displayName||name,
  city:values.city,state:values.state,occupation:values.occupation,company:values.company,
  website:values.website,linkedin:values.linkedin,facebook:values.facebook,
  instagram:values.instagram,x:values.x,businessEmail:values.businessEmail,
  businessPhone:values.businessPhone,logoUrl:logoUrl||saved?.company_logo_url||null,
  businessHeadshotUrl:headshotUrl||saved?.business_headshot_url||null,
  businessHeadshotCrop:headshotUrl?headshotCrop:null,
  story:values[selected],storyPrompt:prompt?.label.replace('YOUR HIGH SCHOOL',school.toUpperCase()),
  photoUrl:selectedPhoto?.src||null,memoryPhotoCrop:selectedPhoto?.crop,
  heroPreviewUrl:heroUrl,heroCrop,businessPublic:consent
 };
 async function addPhotos(key:WhereYatPromptKey,picked:File[]){
  if(!picked.length)return;
  if((photos[key]?.length||0)+picked.length>4){setError('Each memory can contain up to four photos.');return}
  setPreparing(true);setError('');
  try{
   const prepared=await Promise.all(picked.map(async file=>{
    const photo=await prepareStoryPhoto(await copyStoryPhoto(file));
    const src=URL.createObjectURL(photo.blob);photoURLs.current.push(src);
    return {src,prepared:photo} as Picture;
   }));
   setPhotos(v=>({...v,[key]:[...(v[key]||[]),...prepared]}));
  }catch(e){setError(e instanceof Error?e.message:'Could not read photo.')}
  finally{setPreparing(false)}
 }
 function removePhoto(key:WhereYatPromptKey,index:number){
  setPhotos(v=>({...v,[key]:(v[key]||[]).filter((_,i)=>i!==index)}));
  if(selectedCrop?.key===key&&selectedCrop.index===index)setSelectedCrop(null);
 }
 const setPhotoCrop=(key:WhereYatPromptKey,index:number,crop:Crop)=>{
  setPhotos(v=>({...v,[key]:(v[key]||[]).map((p,i)=>i===index?{...p,crop}:p)}));
 };
 async function submit(){
  if(busy||preparing)return;
  if(!auth.currentUser){setError('Sign in before submitting your flip card.');return;}
  if(!values.displayName.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)){
   setError('Enter your name and private contact email.');return;
  }
  if(!available.length){setError('Answer at least one memory question.');return;}
  if(!attested){setError('Confirm you are the alumnus or have permission to submit.');return;}
  if(hero&&!heroCrop){setError('Position your top playing photo before submitting.');return;}
  if(headshot&&!headshotCrop){setError('Position your business headshot before submitting.');return;}
  if(!window.confirm('Approve the complete flip-card layout and submit it for final YAT?STATS corporate approval and publication?'))return;
  setBusy(true);setError('');
  try{
   await auth.authStateReady?.();
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Your sign-in expired. Sign in again to submit.');
   const form=new FormData();
   for(const [key,value] of Object.entries(values))form.set(key,value);
   form.set('playerId',playerId);form.set('hsid',hsid);form.set('idToken',token);
   form.set('featuredMemory',selected);form.set('claimAttestation','yes');
   form.set('proofConfirmed','yes');
   if(consent)form.set('businessPublic','yes');
   if(sponsorInterest)form.set('sponsorship','yes');
   if(saved?.id)form.set('replacesSubmissionId',String(saved.id));
   if(logo)form.set('companyLogo',logo);
   if(headshot){
    form.set('businessHeadshot',await shrinkPhoto(headshot),'business-headshot.jpg');
    form.set('businessHeadshotCrop',JSON.stringify(headshotCrop));
   }
   if(hero){
    form.set('photo',await shrinkPhoto(hero),'card-hero.jpg');
    form.set('backHeroCrop',JSON.stringify(heroCrop));
   }
   for(const p of WHERE_YAT_PROMPTS){
    for(const pic of photos[p.key]||[]){
     if(pic.prepared){
      form.append('memoryPhoto_'+p.key,pic.prepared.blob,pic.prepared.name);
      form.append('memoryCrop_'+p.key,JSON.stringify(pic.crop||null));
     } else if(pic.full)form.append('keepMemoryPhoto_'+p.key,pic.full);
    }
   }
   const prepared=await createStoryUploadBody(form);
   // Never strand the designer in SUBMITTING if a photo upload stalls.
   const controller=new AbortController();
   const timeout=window.setTimeout(()=>controller.abort(),35000);
   let res:Response;
   try{
    res=await fetch('/api/contribute/where-yat-now',{
     method:'POST',body:prepared.body,
     headers:{'content-type':prepared.contentType},credentials:'include',signal:controller.signal
    });
   }finally{window.clearTimeout(timeout);}
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(json.error||'Could not submit the completed card.');
   const id=Number(json.submissionId);
   if(!Number.isSafeInteger(id))throw Error('Submission receipt missing. Contact alumni@yatstats.com before resubmitting.');
   setSubmissionId(id);setReceipt(true);
   onSaved({...saved,id,status:'pending',featured_memory_key:selected} as FlipCardSaved);
   window.dispatchEvent(new CustomEvent('yat:where-yat-submitted',{detail:{playerId,hsid,submissionId:id}}));
  }catch(e){setError(e instanceof Error&&e.name==='AbortError'?'The submission timed out. Check your saved submission before trying again to avoid duplicates. Your entries are still in this editor.':e instanceof Error?e.message:'Submission failed. Your edits remain here.');}
  finally{setBusy(false);}
 }
 const disabled=busy||preparing;
 const input=(key:string,label:string,kind='text')=><label className="wyu-field" key={key}>
  <span>{label}</span>
  {kind==='textarea'?<textarea rows={3} maxLength={key==='story'?2400:5000} value={values[key]||''} disabled={disabled} onChange={e=>set(key,e.target.value)}/>:
   <input type={kind} value={values[key]||''} disabled={disabled} onChange={e=>set(key,e.target.value)}/>}
 </label>;
 if(receipt)return <section className="wyu-receipt" role="status">
  <h3>YOUR FLIP CARD IS SUBMITTED FOR PUBLICATION</h3>
  <p>Submission #{submissionId} has been recorded. YAT?STATS will verify the identity claim and provide final corporate approval before publishing. No separate alumnus proof is required.</p>
  <p>YAT?STATS will contact you about your submission and email you when it is approved and published.</p>
 </section>;
 return <section className="wyu" aria-label="Live retired alumni flip card builder">
  <h3 className="wyu-title">YOUR COMPLETE FLIP-CARD BACK</h3>
  <p className="wyu-intro">As you type and position your photos, the exact card below updates. Make changes until you approve the layout. There is only one proof.</p>
  <div className="wyu-live" id="where-yat-live-proof">
   <button type="button" className="wyu-proof-toggle" onClick={()=>setShowProof(v=>!v)}
    aria-expanded={showProof}>{showProof?'HIDE LIVE CARD':'SHOW LIVE CARD'} <i className={showProof?'ri-arrow-up-s-line':'ri-arrow-down-s-line'}/></button>
   {showProof&&<div className="wyu-proof"><WhereYatProofCard variant="full" proof={proof}/></div>}
  </div>
  <div className="wyu-part"><h4>1. TOP PLAYING PHOTO</h4>
   <label className="wyu-field"><span>UPLOAD OR REPLACE</span><input type="file" accept="image/*" disabled={disabled} onChange={e=>{setHero(e.target.files?.[0]||null);setHeroCrop(null);}}/></label>
   {heroUrl&&<div className="wyu-crop"><span>DRAG AND ZOOM THE TOP PHOTO</span>
    <PhotoCropper key={heroUrl} src={heroUrl} aspect={20/7} guide="name-left" onChange={setHeroCrop}/></div>}
  </div>
  <div className="wyu-part"><h4>2. ABOUT YOU & BUSINESS</h4>
   {input('displayName','YOUR NAME')}
   {input('email','PRIVATE CONTACT EMAIL','email')}
   {input('contactPhone','PRIVATE CALLBACK PHONE','tel')}
   {input('city','CITY')}{input('state','STATE')}
   {input('retirementYear','YEAR YOU RETIRED','number')}
   {businessFields.map(([key,label])=>input(key,label,key==='businessMessage'||key==='businessOffer'?'textarea':key==='businessEmail'?'email':'text'))}
   <label className="wyu-field"><span>COMPANY LOGO (FULL LOGO, NO CROP)</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={e=>setLogo(e.target.files?.[0]||null)}/></label>
   <label className="wyu-field"><span>BUSINESS HEADSHOT</span>
    <input type="file" accept="image/*" disabled={disabled} onChange={e=>{setHeadshot(e.target.files?.[0]||null);setHeadshotCrop(null)}}/></label>
   {headshotUrl&&<div className="wyu-crop"><span>DRAG AND ZOOM YOUR BUSINESS HEADSHOT</span>
    <PhotoCropper key={headshotUrl} src={headshotUrl} aspect={2/3} onChange={setHeadshotCrop}/></div>}
   <label className="wyu-check"><input type="checkbox" checked={consent} disabled={disabled} onChange={e=>setConsent(e.target.checked)}/>
    Display my business links and public contact details</label>
  </div>
  <div className="wyu-part"><h4>3. MEMORIES & IMAGES</h4>
   {WHERE_YAT_PROMPTS.map(p=><div className="wyu-memory" key={p.key}>
    {input(p.key,p.label.replace('YOUR HIGH SCHOOL',school.toUpperCase()),'textarea')}
    <label className="wyu-field"><span>ADD MEMORY PHOTOS ({photos[p.key]?.length||0}/4)</span>
     <input type="file" accept="image/*" multiple disabled={disabled||(photos[p.key]?.length||0)>=4}
      onChange={e=>{void addPhotos(p.key,Array.from(e.target.files||[]));e.currentTarget.value=''}}/></label>
    {(photos[p.key]||[]).length>0&&<div className="wyu-thumbs">
     {(photos[p.key]||[]).map((image,index)=><div className="wyu-thumb" key={image.src}>
      <img src={image.src} alt={p.label+' image '+(index+1)}/>
      <div><button type="button" disabled={disabled} onClick={()=>setSelectedCrop({key:p.key,index})}>POSITION</button>
       <button type="button" disabled={disabled} onClick={()=>removePhoto(p.key,index)}>REMOVE</button></div>
     </div>)}
    </div>}
    {selectedCrop?.key===p.key&&photos[p.key]?.[selectedCrop.index]&&<div className="wyu-crop">
     <span>POSITION MEMORY PHOTO {selectedCrop.index+1}</span>
     <PhotoCropper key={photos[p.key][selectedCrop.index].src} src={photos[p.key][selectedCrop.index].src} aspect={1}
      onChange={crop=>setPhotoCrop(p.key,selectedCrop.index,crop)}/>
     <button type="button" onClick={()=>setSelectedCrop(null)}>DONE POSITIONING</button>
    </div>}
   </div>)}
   <label className="wyu-field"><span>MEMORY FEATURED ON FLIP CARD</span><select value={selected}
     disabled={disabled} onChange={e=>setFeatured(e.target.value as WhereYatPromptKey)}>
     {WHERE_YAT_PROMPTS.map(p=><option key={p.key} value={p.key}>{p.label.replace('YOUR HIGH SCHOOL',school.toUpperCase())}</option>)}
   </select></label>
  </div>
  <div className="wyu-part"><h4>4. PRIVATE STAFF FOLLOW-UP</h4>
   {input('teammateTips','FORMER TEAMMATES TO RECONNECT WITH (PRIVATE)','textarea')}
   <label className="wyu-check"><input type="checkbox" checked={sponsorInterest} disabled={disabled}
    onChange={e=>setSponsorInterest(e.target.checked)}/> I would like information about YAT?STATS partnership opportunities</label>
   <label className="wyu-check"><input type="checkbox" checked={attested} disabled={disabled}
    onChange={e=>setAttested(e.target.checked)}/> I am this alumnus or have permission to submit this profile</label>
  </div>
  <div className="wyu-part wyu-final">
   <h4>5. APPROVE THE LIVE PROOF</h4>
   <p>Review your card above. By submitting, you approve this design for publication, subject to final YAT?STATS corporate approval. Staff will review your contact details privately.</p>
   <button type="button" className="wyu-review" onClick={()=>{setShowProof(true);document.getElementById('where-yat-live-proof')?.scrollIntoView({behavior:'smooth',block:'start'})}}>REVIEW MY LIVE CARD</button>
   {error&&<p role="alert" className="wyu-error">{error}</p>}
   <button className="wyu-submit" type="button" disabled={disabled} onClick={()=>void submit()}>
    {busy?'SUBMITTING…':preparing?'PREPARING PHOTOS…':'APPROVE THIS PROOF & SUBMIT FOR PUBLICATION'}
   </button>
  </div>
  <style>{'.wyu{display:grid;gap:13px;min-width:0}.wyu-title{font:800 22px Oswald,Arial,sans-serif;margin:4px 0 0}.wyu-intro,.wyu-final p{font:400 13px/1.5 Archivo,Arial,sans-serif;margin:0}.wyu-live{border:2px solid #ac8a42;padding:8px;border-radius:8px;background:var(--wyn-card-bg,rgba(128,128,128,.1));min-width:0}.wyu-proof-toggle{display:block;width:100%;padding:10px;border:0;background:#e9bf56;color:#111;font:800 14px Oswald,Arial,sans-serif}.wyu-proof{max-width:500px;margin:9px auto 0;width:100%;min-width:0}.wyu-proof a{pointer-events:none}.wyu-part{min-width:0;display:grid;gap:10px;padding:12px;border:1px solid var(--wyn-border,rgba(128,128,128,.35));border-radius:8px}.wyu-part h4{font:800 17px Oswald,Arial,sans-serif;margin:0}.wyu-field{display:grid;min-width:0;gap:5px;font:700 12px/1.3 Archivo,Arial,sans-serif}body.light-theme .wyu .wyu-field input:not([type=file]),body.light-theme .wyu .wyu-field textarea,body.light-theme .wyu .wyu-field select{background:#fff!important;color:#171717!important;caret-color:#171717!important;border-color:#999!important}body.light-theme .wyu .wyu-field :is(input,textarea)::placeholder{color:#666!important}.wyu-field input,.wyu-field textarea,.wyu-field select{box-sizing:border-box;max-width:100%;width:100%;padding:10px;min-height:42px;background:var(--wyn-card-bg,#252525);color:inherit;border:1px solid #888;border-radius:5px;font:400 14px Archivo,Arial,sans-serif}.wyu-field input[type=file]{font-size:12px}.wyu-check{display:flex;align-items:flex-start;gap:9px;font:500 13px/1.5 Archivo,Arial,sans-serif}.wyu-check input{margin:3px 0 0;flex-shrink:0}.wyu-memory{display:grid;gap:10px;padding:10px;border:1px solid var(--wyn-border,rgba(128,128,128,.35));border-radius:5px}.wyu-crop{display:grid;gap:9px;min-width:0}.wyu-crop>span{font:700 12px Oswald,Arial,sans-serif}.wyu-crop .ypc{max-width:100%}.wyu-thumbs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wyu-thumb{min-width:0}.wyu-thumb img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#111}.wyu-thumb>div{display:flex;gap:5px;margin-top:5px}.wyu-thumb button,.wyu-crop button,.wyu-review{flex:1;border:1px solid #888;padding:7px;background:transparent;color:inherit;font:700 12px Oswald,Arial,sans-serif}.wyu-submit{width:100%;min-height:55px;border:1px solid #79520a;border-radius:5px;background:#e9bf56;color:#111;font:900 16px Oswald,Arial,sans-serif}.wyu-submit:disabled{opacity:.55}.wyu-error{padding:8px;border:1px solid #be4848;color:#e06b6b}.wyu-receipt{padding:16px;border:1px solid #dcb348;border-radius:8px}.wyu-receipt h3{font:800 21px Oswald,Arial,sans-serif}'}</style>
 </section>;
}
