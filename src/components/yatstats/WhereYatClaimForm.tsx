'use client';
import {Fragment,useEffect,useRef,useState} from 'react';
import {auth} from '@/lib/firebase';
import {copyStoryPhoto,prepareStoryPhoto,createStoryUploadBody,type StoryPhotoData} from '@/lib/storyPhotoUpload';
import WhereYatProofCard from './WhereYatProofCard';
type Picked=StoryPhotoData&{url:string};
const fields=[
 ['favoriteHs','MOST MEMORABLE MOMENT PLAYING AT YOUR HIGH SCHOOL'],
 ['favoriteAfter','MOST MEMORABLE BASEBALL MOMENT AFTER GRADUATION'],
 ['family','DO YOU HAVE A FAMILY? ANY BALLPLAYERS? TELL US MORE.'],
 ['story','WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?'],
] as const;

/* The form follows the published profile: the flip-card back is one
   grouped accordion, followed by four separate memory/story prompts.
   The fields keep their existing names so saved records and moderation
   continue using the same submission API. */
const flipCardFields=[
 {id:'displayName',title:'YOUR NAME',required:true},
 {id:'email',title:'CONTACT EMAIL (PRIVATE)',required:true},
 {id:'contactPhone',title:'CALLBACK PHONE (PRIVATE)',optional:true},
 {id:'location',title:'CITY AND STATE'},
 {id:'retirementYear',title:'YEAR YOU RETIRED FROM BASEBALL'},
 {id:'occupation',title:'YOUR PROFESSION',optional:true},
 {id:'company',title:'COMPANY / ORGANIZATION',optional:true},
 {id:'businessMessage',title:'WHAT WOULD YOU LIKE PEOPLE TO KNOW ABOUT YOUR BUSINESS?',optional:true},
 {id:'businessOffer',title:'SPECIAL OFFER',optional:true},
 {id:'companyLogo',title:'COMPANY LOGO',optional:true},
 {id:'website',title:'BUSINESS WEBSITE',optional:true},
 {id:'businessEmail',title:'PUBLIC BUSINESS EMAIL',optional:true},
 {id:'businessPhone',title:'PUBLIC BUSINESS PHONE / TEXT',optional:true},
 {id:'linkedin',title:'LINKEDIN',optional:true},
 {id:'facebook',title:'FACEBOOK',optional:true},
 {id:'instagram',title:'INSTAGRAM',optional:true},
 {id:'x',title:'X / TWITTER',optional:true},
 {id:'businessPublic',title:'PERMISSION TO PUBLISH BUSINESS DETAILS',optional:true},
] as const;
const questionOrder=[...flipCardFields.map(field=>field.id),...fields.map(field=>field[0]),'teammateTips','claimAttestation'] as const;

export default function WhereYatClaimForm({playerId,hsid,name,school}: {playerId:string;hsid:string;name:string;school:string}){
 const form=useRef<HTMLFormElement>(null);
 const [photos,setPhotos]=useState<Picked[]>([]);
 const [memoryPhotos,setMemoryPhotos]=useState<Record<string,Picked[]>>({});
 const [proof,setProof]=useState<Record<string,string>|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [receipt,setReceipt]=useState<number|null>(null);
 const [published,setPublished]=useState(false);
 const [alreadyPending,setAlreadyPending]=useState(false);
 const [fan,setFan]=useState({name:'',email:''});
 const [saved,setSaved]=useState<Record<string,any>|null>(null);
 const [signedIn,setSignedIn]=useState<boolean|null>(null);
 const [editEnabled,setEditEnabled]=useState(false);
 const [savedLoaded,setSavedLoaded]=useState(false);
 function openJoin(){
  document.body.classList.add('drawer-account-open','drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:'register'}));
 }
 function loadSaved(){
  void (async()=>{
   await auth.authStateReady?.();
   const user=auth.currentUser;
   setSignedIn(Boolean(user));
   if(!user){setSavedLoaded(true);return;}
   const token=await user.getIdToken().catch(()=>'');
   if(!token){setSavedLoaded(true);return;}
   const response=await fetch('/api/contribute/where-yat-now/mine?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid),{headers:{'x-firebase-token':token},cache:'no-store',credentials:'include'}).catch(()=>null);
   const result=response?.ok?await response.json().catch(()=>null):null;
   setSaved(result?.submission||null);
   setSavedLoaded(true);
  })();
 }
 const [openQuestion,setOpenQuestion]=useState<string|null>('flipCard');
 const [allOpen,setAllOpen]=useState(false);
 const [closedWhenAll,setClosedWhenAll]=useState<string[]>([]);
 const [featuredMemory,setFeaturedMemory]=useState('story');
 const [answered,setAnswered]=useState<Record<string,boolean>>({});
 useEffect(()=>{
  loadSaved();
  window.addEventListener('yat-auth-success',loadSaved);
  window.addEventListener('yat-sign-out',loadSaved);
  return()=>{window.removeEventListener('yat-auth-success',loadSaved);window.removeEventListener('yat-sign-out',loadSaved)};
 },[playerId,hsid]);
 useEffect(()=>{
  if(!saved || !editEnabled || !form.current)return;
  const mapping:Record<string,string>={
   displayName:'display_name',email:'contact_email',contactPhone:'contact_phone',city:'location_city',state:'location_state',
   occupation:'occupation',company:'company_name',website:'business_website',linkedin:'linkedin_url',
   instagram:'instagram_url',facebook:'facebook_url',x:'x_url',story:'story',favoriteHs:'favorite_hs_memory',
   favoriteAfter:'favorite_post_hs_memory',family:'family_life',retirementYear:'retirement_year',
   businessMessage:'business_message',businessOffer:'business_offer',businessEmail:'business_contact_email',
   businessPhone:'business_contact_phone',teammateTips:'private_teammate_tips'};
  for(const [key,column] of Object.entries(mapping)){
   const input=form.current.elements.namedItem(key) as HTMLInputElement|HTMLTextAreaElement|null;
   if(input)input.value=String(saved[column]??'');
  }
  setFeaturedMemory(String(saved.featured_memory_key||'story'));
  // Old questionnaire photos remain attached to their original saved memory.
  // Do not silently reassign them when editing a questionnaire.
  const opt=form.current.elements.namedItem('businessPublic') as HTMLInputElement|null;
  if(opt)opt.checked=!!saved.business_public_opt_in;
  setAnswered(Object.fromEntries(Object.entries(mapping).map(([key,column])=>[key,!!String(saved[column]??'').trim()])));
 },[saved,editEnabled]);
 useEffect(()=>{
  let active=true;
  (async()=>{
   await auth.authStateReady?.();
   const u=auth.currentUser;
   if(active){setFan({name:u?.displayName||'',email:u?.email||''});
     const nameInput=form.current?.elements.namedItem('displayName') as HTMLInputElement|null;
     const emailInput=form.current?.elements.namedItem('email') as HTMLInputElement|null;
     if(nameInput && u?.displayName && (!nameInput.value || nameInput.value===name)) nameInput.value=u.displayName;
     if(emailInput && u?.email && !emailInput.value)emailInput.value=u.email;
     setAnswered(previous => ({...previous,displayName:!!nameInput?.value.trim(),email:!!emailInput?.value.trim()}));
   }
   const token=await u?.getIdToken().catch(()=>'');
   if(!token)return;
   const result=await fetch('/api/contribute/where-yat-now/status?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid),
     {headers:{'x-firebase-token':token},credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
   if(active)setAlreadyPending(result?.update?.status==='pending');
  })();
  return()=>{active=false}
 },[playerId,hsid]);
 async function addMemoryFiles(key:string,files:FileList|null){
  if(!files)return;
  const existing=memoryPhotos[key]||[];
  if(existing.length+files.length>4){setError('Up to four photos per memory.');return;}
  setBusy(true);
  try{const next=await Promise.all(Array.from(files).map(async file=>{const a=await prepareStoryPhoto(await copyStoryPhoto(file));return {...a,url:URL.createObjectURL(a.blob)}}));setMemoryPhotos(prev=>({...prev,[key]:[...(prev[key]||[]),...next]}));setProof(null);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Unable to prepare memory photos.');}finally{setBusy(false)}
 }
 async function addFiles(files:FileList|null){
  if(!files)return;
  const picked=Array.from(files).slice(0,Math.max(0,4-photos.length));setBusy(true);
  try{
   const prepared=await Promise.all(picked.map(async file=>{const a=await prepareStoryPhoto(await copyStoryPhoto(file));return {...a,url:URL.createObjectURL(a.blob)}}));
   setPhotos(prev=>[...prev,...prepared]);setProof(null);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not read photo')}finally{setBusy(false)}
 }

 // The top block is a single accordion, not eighteen separate questions.
 // Keep collapsed inputs mounted so the API receives every field on submit.
 function sectionForField(id:string):string {
  return flipCardFields.some(field=>field.id===id)?'flipCard':id;
 }
 function showQuestion(id:string|null){
  if(!id)return;
  const section=sectionForField(id);
  if(section==='claimAttestation'||section==='teammateTips'){
   requestAnimationFrame(()=>document.getElementById('wyn-q-'+id)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
   return;
  }
  if(allOpen)setClosedWhenAll(previous=>previous.filter(value=>value!==section));
  else setOpenQuestion(section);
  requestAnimationFrame(()=>document.getElementById('wyn-q-'+id)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
 }
 function toggleSection(id:string){
  if(allOpen)setClosedWhenAll(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id]);
  else setOpenQuestion(previous=>previous===id?null:id);
 }
 function sectionIsOpen(id:string):boolean{
  return allOpen?!closedWhenAll.includes(id):openQuestion===id;
 }
 function toggleAllQuestions(){
  setAllOpen(previous=>!previous);
  setClosedWhenAll([]);
  setOpenQuestion(null);
 }
 function questionAnswered(id:string):boolean {
  if(id==='lifePhotos')return photos.length>0;
  const el=form.current?.elements.namedItem(id==='location'?'city':id) as HTMLInputElement|HTMLTextAreaElement|null;
  if(id==='location')return Boolean(el?.value.trim() || (form.current?.elements.namedItem('state') as HTMLInputElement|null)?.value.trim());
  if(!el)return false;
  if(el instanceof HTMLInputElement && el.type==='checkbox')return el.checked;
  if(el instanceof HTMLInputElement && el.type==='file')return Boolean(el.files?.length);
  return Boolean(el.value.trim());
 }
 function answerChanged(event:React.FormEvent<HTMLFormElement>){
  const target=event.target as HTMLElement;
  const id=target.closest<HTMLElement>('[data-wyn-question]')?.dataset.wynQuestion;
  if(!id)return;
  setAnswered(previous=>({...previous,[id]:questionAnswered(id)}));
  if(proof)setProof(null); // Always regenerate the proof after an answer changes.
  if(error)setError('');
 }

 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  // Hidden required controls are intentionally kept in the DOM. Use
  // noValidate plus explicit checks so a collapsed input can be opened
  // instead of producing "invalid form control is not focusable".
  const nameInput=e.currentTarget.elements.namedItem('displayName') as HTMLInputElement|null;
  const emailInput=e.currentTarget.elements.namedItem('email') as HTMLInputElement|null;
  const attestation=e.currentTarget.elements.namedItem('claimAttestation') as HTMLInputElement|null;
  if(!nameInput?.value.trim()){
   setError('Enter your name before previewing your profile.');
   showQuestion('displayName');return;
  }
  if(!emailInput?.value.trim() || !emailInput.checkValidity()){
   setError('Enter a valid private contact email before previewing your profile.');
   showQuestion('email');return;
  }
  if(!attestation?.checked){
   setError('Confirm that you are this alumnus or have permission to submit the profile.');
   showQuestion('claimAttestation');return;
  }
  setError('');
  if(!auth.currentUser){openJoin();setError('JOIN or sign in to save your questionnaire. Your answers remain here.');return;}
  const data=new FormData(e.currentTarget);data.set('playerId',playerId);data.set('hsid',hsid);
  if(saved?.id && editEnabled)data.set('replacesSubmissionId',String(saved.id));
  const answers=Object.fromEntries([...data.entries()].filter(([,v])=>typeof v==='string')) as Record<string,string>;
  const available=fields.filter(([key])=>String(answers[key]||'').trim());
  const effectiveFeatured=available.some(([key])=>key===featuredMemory)?featuredMemory:(available[0]?.[0]||'story');
  data.set('featuredMemory',effectiveFeatured);
  if(!proof){
   setFeaturedMemory(effectiveFeatured);
   setProof(answers);
   requestAnimationFrame(()=>document.getElementById('claim-proof')?.scrollIntoView({behavior:'smooth',block:'start'}));
   return;
  }
  setBusy(true);setError('');
  try{
   await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();
   if(!token){window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:'signin'}));throw Error('Sign in to claim this profile. Your answers are still here.')}
   data.set('idToken',token);data.set('proofConfirmed','yes');
   for(const [key,images] of Object.entries(memoryPhotos)){for(const photo of images)data.append('memoryPhoto_'+key,photo.blob,photo.name);}
  data.delete('lifePhotos');
   photos.forEach(p=>data.append('lifePhotos',p.blob,p.name));
   const {body,contentType}=await createStoryUploadBody(data);
   const response=await fetch('/api/contribute/where-yat-now',{method:'POST',body,headers:{'content-type':contentType},credentials:'include'});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Submission failed');
   setReceipt(Number(result.submissionId));
   setPublished(result.published===true);
   window.dispatchEvent(new CustomEvent('yat:where-yat-submitted',{detail:{playerId,hsid}}));
  }catch(e){setError(e instanceof Error?e.message:'Submission failed')}finally{setBusy(false)}
 }


 // A single rendering point for each question's existing data field.
 function renderQuestion(id:string){
  if(id==='displayName')return <label className="ycd-field"><span className="ycd-label">YOUR NAME</span><input required name="displayName" defaultValue={fan.name||name} autoComplete="name"/></label>;
  if(id==='email')return <label className="ycd-field"><span className="ycd-label">CONTACT EMAIL (PRIVATE)</span><input required type="email" name="email" defaultValue={fan.email} autoComplete="email" /></label>;
  if(id==='contactPhone')return <label className="ycd-field"><span className="ycd-label">CALLBACK PHONE (PRIVATE)</span><span className="ycd-muted ycd-small">Only the YAT?STATS review team will use this to verify your identity or thank you. This does not authorize marketing texts or calls.</span><input type="tel" name="contactPhone" autoComplete="tel" /></label>;
  if(id==='location')return <div className="ycd-pair">
   <label className="ycd-field"><span className="ycd-label">CITY</span><input name="city" autoComplete="address-level2" /></label>
   <label className="ycd-field"><span className="ycd-label">STATE</span><input name="state" autoComplete="address-level1" /></label>
  </div>;
  if(id==='retirementYear')return <label className="ycd-field"><span className="ycd-label">YEAR YOU RETIRED FROM BASEBALL</span><input type="number" name="retirementYear" min="1900" max={new Date().getFullYear()} /></label>;
  const storyField=fields.find(([key])=>key===id);
  if(storyField)return <div className="ycd-field">
   <label className="ycd-field"><textarea aria-label={storyField[1].replace('YOUR HIGH SCHOOL',school.toUpperCase())} name={storyField[0]} rows={4} maxLength={storyField[0]==='story'?2400:5000}/></label>
   <label className="wyn-photo-select"><span className="wyn-photo-select-heading"><i className="ri-image-add-line"/> ADD PHOTOS TO THIS MEMORY</span><span className="ycd-muted ycd-small">Up to 4 photos, attached only to this answer.</span><input type="file" multiple accept="image/*" onChange={e=>{void addMemoryFiles(storyField[0],e.target.files);e.target.value='';}}/></label>
   {(memoryPhotos[storyField[0]]||[]).length>0&&<div className="wyn-photos">{memoryPhotos[storyField[0]].map((photo,index)=><div className="wyn-photo-thumb" key={photo.url}><img src={photo.url} alt={'Memory photo '+(index+1)}/><button type="button" className="ycd-btn" onClick={()=>{URL.revokeObjectURL(photo.url);setMemoryPhotos(prev=>({...prev,[storyField[0]]:(prev[storyField[0]]||[]).filter((_,j)=>j!==index)}));setProof(null)}}>REMOVE</button></div>)}</div>}
  </div>;
  if(id==='lifePhotos')return <div className="ycd-field">
   <label className="wyn-photo-select">
    <span className="wyn-photo-select-heading"><i className="ri-image-add-line" aria-hidden="true" /> ADD PHOTOS</span>
    <span className="ycd-muted ycd-small">Up to 4 photos from life after baseball.</span>
    <input type="file" multiple accept="image/*" onChange={e=>void addFiles(e.target.files)} aria-label="Add up to four life after baseball photos" />
   </label>
   {photos.length>0 && <div className="wyn-photos">{photos.map((photo,index)=>
    <div className="wyn-photo-thumb" key={photo.url}>
     <img src={photo.url} alt={'Photo '+(index+1)} />
     <button type="button" className="ycd-btn" onClick={()=>{URL.revokeObjectURL(photo.url);setPhotos(previous=>previous.filter((_,j)=>j!==index));setProof(null);setAnswered(previous=>({...previous,lifePhotos:photos.length>1}));}}>REMOVE</button>
    </div>)}</div>}
  </div>;
  if(id==='occupation')return <label className="ycd-field"><span className="ycd-label">YOUR PROFESSION</span><input name="occupation" /></label>;
  if(id==='company')return <label className="ycd-field"><span className="ycd-label">COMPANY / ORGANIZATION</span><input name="company" /></label>;
  if(id==='businessMessage')return <label className="ycd-field"><span className="ycd-label">WHAT WOULD YOU LIKE PEOPLE TO KNOW ABOUT YOUR BUSINESS?</span><textarea name="businessMessage" rows={3}/></label>;
  if(id==='businessOffer')return <label className="ycd-field"><span className="ycd-label">SPECIAL OFFER (OPTIONAL)</span><textarea name="businessOffer" rows={2}/></label>;
  if(id==='companyLogo')return <label className="ycd-field"><span className="ycd-label">COMPANY LOGO (OPTIONAL)</span><input type="file" name="companyLogo" accept="image/png,image/jpeg,image/webp" /></label>;
  if(id==='website')return <label className="ycd-field"><span className="ycd-label">BUSINESS WEBSITE</span><input name="website" /></label>;
  if(id==='businessEmail')return <label className="ycd-field"><span className="ycd-label">PUBLIC BUSINESS EMAIL</span><input name="businessEmail" type="email" /></label>;
  if(id==='businessPhone')return <label className="ycd-field"><span className="ycd-label">PUBLIC BUSINESS PHONE</span><input name="businessPhone" type="tel" /></label>;
  if(id==='linkedin')return <label className="ycd-field"><span className="ycd-label">LINKEDIN</span><input name="linkedin" /></label>;
  if(id==='instagram')return <label className="ycd-field"><span className="ycd-label">INSTAGRAM</span><input name="instagram" /></label>;
  if(id==='facebook')return <label className="ycd-field"><span className="ycd-label">FACEBOOK</span><input name="facebook" /></label>;
  if(id==='x')return <label className="ycd-field"><span className="ycd-label">X / TWITTER</span><input name="x" /></label>;
  if(id==='businessPublic')return <label className="wyn-checkbox">
   <input type="checkbox" name="businessPublic" value="yes" />
   <span>I authorize YAT?STATS to display my optional business promotion and contact details.</span>
  </label>;
  if(id==='teammateTips')return <label className="ycd-field">
   <span className="ycd-label">TEAMMATE INFORMATION (PRIVATE)</span>
   <span className="ycd-muted ycd-small">Private leads for the {school} baseball program. These details are never published.</span>
   <textarea name="teammateTips" rows={4} maxLength={5000} placeholder="Names, graduation years, and information that can help reconnect fellow alumni" />
  </label>;
  if(id==='claimAttestation')return <label className="wyn-checkbox">
   <input type="checkbox" name="claimAttestation" required value="yes"/>
   <span>I am this alumnus or have their permission to submit this profile. This claim will be independently verified.</span>
  </label>;
  return null;
 }
 const answeredCount=questionOrder.filter(id=>Boolean(answered[id])).length;

 // Presentation reuses the exact Connect & Contribute drawer design classes.
 // Keep the dedicated questionnaire data, validation, photo upload, proof,
 // permissions and API unchanged.

 const receiptStatus=receipt ? (published?'approved':'pending') : saved?.status;
 const confirmedId=receipt||Number(saved?.id||0);
 if(receiptStatus==='pending' && confirmedId>0 && signedIn) return (
  <div className="where-yat-claim wyn-pending-receipt" role="status" aria-live="polite">
   <section className="wyn-form-section">
    <h3 className="ycd-label"><i className="ri-time-line" aria-hidden="true"/> SUBMISSION RECEIVED — PENDING APPROVAL</h3>
    <p>Your Where YAT? questionnaire is saved as <strong>submission #{confirmedId}</strong>. Thank you for telling us how life has been since baseball.</p>
    <p>We are verifying your alumni identity. <strong>Your completed flip card and memories are not public yet.</strong> There is no need to submit again.</p>
    <div className="wyn-pending-card" aria-label="Flip-card back waiting for approval">
     <img src="/img/where-yat-now/waiting-approval.png" alt="Update received. Waiting for identity approval before the flip card is published."/>
    </div>
    <div className="ycd-actions wyn-pending-actions">
     <a className="ycd-btn ycd-btn-primary" href={'/'+hsid+'/where-yat-proof?submission='+confirmedId}>VIEW MY PRIVATE SAVED PROOF</a>
     {saved?.id && <button type="button" className="ycd-btn" onClick={()=>{setReceipt(null);setEditEnabled(true)}}>EDIT MY ANSWERS</button>}
    </div>
    <p className="ycd-muted ycd-small">After approval, your completed card replaces this pending artwork. Your submitted proof is private until then.</p>
   </section>
  </div>
 );
 if(!editEnabled && saved && signedIn)return (
  <div className="where-yat-claim"><section className="wyn-form-section">
   <h3 className="ycd-label">YOUR PUBLISHED WHERE YAT? QUESTIONNAIRE</h3>
   <p>Your published answers are saved. You can edit them and submit a revision for review.</p>
   <button type="button" className="ycd-btn ycd-btn-primary" onClick={()=>setEditEnabled(true)}>EDIT MY ANSWERS</button>
  </section></div>
 );
 if(!signedIn && savedLoaded)return (
  <div className="where-yat-claim"><section className="wyn-form-section">
   <h3 className="ycd-label">JOIN TO SHARE YOUR STORY</h3>
   <p className="ycd-muted ycd-small">Sign in or JOIN YAT?STATS to complete the questionnaire and return to edit your answers.</p>
   <button type="button" className="ycd-btn ycd-btn-primary" onClick={openJoin}>JOIN OR SIGN IN</button>
  </section></div>
 );
 if(receipt && published)return (
  <div className="where-yat-claim" role="status"><section className="wyn-form-section">
   <h3 className="ycd-label"><i className="ri-checkbox-circle-fill" aria-hidden="true"/> PROFILE PUBLISHED</h3>
   <p>Your approved flip-card back and life-after-baseball memories are now public.</p>
   <a className="ycd-btn ycd-btn-primary" href={'/'+hsid+'/where-yat-proof?submission='+receipt}>VIEW MY SAVED PROOF</a>
  </section></div>
 );


 return (
  <form ref={form} onSubmit={submit} onChange={answerChanged} noValidate
   className="where-yat-claim" aria-label="Where YAT Now alumni questionnaire">
   {alreadyPending && <div role="status" className="wyn-claim-status ycd-muted ycd-small">A previous update is awaiting review. You can submit a new questionnaire below; your previous submission will be preserved.</div>}
   <div className="wyn-question-intro">
    <p>We'd love to know how you're doing! Tell us where life has taken you since baseball, share a few memories and photos, and reconnect with teammates.</p>
    <strong>CONNECT. CONTRIBUTE. REMEMBER.</strong>
   </div>
   <div className="wyn-question-toolbar">
    <span className="wyn-question-progress" role="status" aria-live="polite">{answeredCount} OF {questionOrder.length} ANSWERED</span>
    <button type="button" className="wyn-question-all-toggle" onClick={toggleAllQuestions}
      aria-label={allOpen?'Close all questions':'Open all questions'}
      title={allOpen?'Close all questions':'Open all questions'} aria-expanded={allOpen}>
      <i className={allOpen?'ri-subtract-line':'ri-add-line'} aria-hidden="true"/>
    </button>
   </div>

   <section id="wyn-q-flipCard" className="wyn-form-section wyn-unified-section wyn-flip-card-section" aria-label="Your flip-card back">
    <button type="button" className="wyn-section-toggle" aria-expanded={sectionIsOpen('flipCard')}
     aria-controls="wyn-flip-card-fields" onClick={()=>toggleSection('flipCard')}>
     <span className="ycd-step">1</span>
     <span className="wyn-section-name">YOUR FLIP-CARD BACK</span>
     <i className={sectionIsOpen('flipCard')?'ri-arrow-up-s-line':'ri-arrow-down-s-line'} aria-hidden="true"/>
    </button>
    <div id="wyn-flip-card-fields" className="wyn-section-body wyn-flip-card-body" hidden={!sectionIsOpen('flipCard')}>
     <p className="ycd-muted ycd-small">These details build the back of your flip card. Private contact details are for verification only. You'll select the memory featured on the card when you review your proof.</p>
     {flipCardFields.map((field,index)=>(
      <Fragment key={field.id}>
       {index===0&&<h4 className="wyn-flip-subhead">ABOUT YOU</h4>}
       {index===5&&<h4 className="wyn-flip-subhead">BUSINESS DETAILS</h4>}
       {index===11&&<h4 className="wyn-flip-subhead">CONTACT & SOCIAL LINKS</h4>}
       <div className="wyn-field-item" data-wyn-question={field.id} id={'wyn-q-'+field.id}>
        {renderQuestion(field.id)}
       </div>
      </Fragment>
     ))}
    </div>
   </section>
   {fields.map(([key,title],index)=>(
    <Fragment key={key}>
     <section id={'wyn-q-'+key} data-wyn-question={key} className="wyn-form-section wyn-unified-section wyn-memory-section" aria-label={title.replace('YOUR HIGH SCHOOL',school.toUpperCase())}>
      <button type="button" className="wyn-section-toggle" aria-expanded={sectionIsOpen(key)}
       aria-controls={'wyn-memory-body-'+key} onClick={()=>toggleSection(key)}>
       <span className="ycd-step">{index+2}</span>
       <span className="wyn-section-name">{title.replace('YOUR HIGH SCHOOL',school.toUpperCase())}</span>
       {answered[key]&&<i className="ri-checkbox-circle-fill wyn-question-done" aria-label="Answered"/>}
       <i className={sectionIsOpen(key)?'ri-arrow-up-s-line':'ri-arrow-down-s-line'} aria-hidden="true"/>
      </button>
      <div id={'wyn-memory-body-'+key} className="wyn-section-body" hidden={!sectionIsOpen(key)}>
       {renderQuestion(key)}
      </div>
     </section>
     {index===1&&<aside className="wyn-question-inline-ad" aria-label="Player Profile Partner in-feed placement">
      <span>PLAYER PROFILE PARTNER</span><strong>ADVERTISER PLACEMENT</strong><small>IN-FEED PARTNER CARD</small>
     </aside>}
    </Fragment>
   ))}
   <div className="wyn-form-section wyn-final-details" aria-label="Final private details and verification">
    <h3 className="ycd-label">BEFORE YOU SUBMIT</h3>
    <div id="wyn-q-teammateTips" data-wyn-question="teammateTips">{renderQuestion('teammateTips')}</div>
    <div id="wyn-q-claimAttestation" data-wyn-question="claimAttestation">{renderQuestion('claimAttestation')}</div>
   </div>
   {proof && (
    <section id="claim-proof" className="wyn-form-section wyn-claim-proof">
     <h3 className="ycd-label"><span className="ycd-step">6</span> REVIEW YOUR PROFILE AND FLIP-CARD PROOFS</h3>
     {fields.some(([key])=>String(proof[key]||'').trim())&&<label className="ycd-field wyn-featured-memory-choice">
      <span className="ycd-label">WHICH MEMORY WOULD YOU LIKE ON YOUR FLIP CARD?</span>
      <select aria-label="Choose your featured memory" value={featuredMemory} onChange={event=>setFeaturedMemory(event.target.value)}>
       {fields.filter(([key])=>String(proof[key]||'').trim()).map(([key,title])=><option key={key} value={key}>{title.replace('YOUR HIGH SCHOOL',school.toUpperCase())}</option>)}
      </select>
      <span className="ycd-muted ycd-small">Your flip-card preview updates to show the selected answer and its photo.</span>
     </label>}
     <div className="wyn-proof-card">
      <WhereYatProofCard variant="full" proof={{
       playerId, hsid, displayName:proof.displayName||name, city:proof.city, state:proof.state,
       occupation:proof.occupation, company:proof.company,
       story:proof[featuredMemory]||proof.story||proof.favoriteAfter||proof.favoriteHs, storyPrompt:fields.find(([key])=>key===featuredMemory)?.[1].replace('YOUR HIGH SCHOOL',school.toUpperCase()), website:proof.website,
       linkedin:proof.linkedin, instagram:proof.instagram, facebook:proof.facebook,
       x:proof.x, businessEmail:proof.businessEmail,businessPhone:proof.businessPhone,
       photoUrl:memoryPhotos[featuredMemory]?.[0]?.url||photos[0]?.url,
       businessPublic:proof.businessPublic==='yes'
      }} />
     </div>
     <div className="wyn-proof-details">
      <h3 className="ycd-label">EXPANDED PROFILE PROOF</h3>
      {([
       ['Most memorable high school baseball moment', proof.favoriteHs],
       ['Most memorable baseball moment after graduation', proof.favoriteAfter],
       ['Retired from baseball', proof.retirementYear],
       ['Life and family', proof.family],
       ['Life after baseball', proof.story]
      ] as const).map(([title,answer]) => answer && (
       <div key={title} className="wyn-proof-entry"><strong>{title}</strong><p>{answer}</p></div>
      ))}
      {fields.map(([key,title])=>memoryPhotos[key]?.length>0&&<div key={key} className="wyn-proof-entry"><strong>{title.replace('YOUR HIGH SCHOOL',school.toUpperCase())} — PHOTOS</strong><div className="wyn-proof-photos">{memoryPhotos[key].map((p,i)=><img key={p.url} src={p.url} alt={'Memory photo '+(i+1)}/>)}</div></div>)}
      {photos.length > 0 && <div className="wyn-proof-photos">{photos.map((p,i) => <img key={p.url} src={p.url} alt={'Proof photo '+(i+1)} />)}</div>}
      {proof.businessPublic === 'yes' && (
       <div className="wyn-proof-entry">
        <h4 className="ycd-label">OPTIONAL BUSINESS SPOTLIGHT</h4>
        <p>{proof.company}</p><p>{proof.businessMessage}</p><p>{proof.businessOffer}</p>
       </div>
      )}
      {proof.teammateTips && (
       <div className="wyn-proof-entry">
        <h4 className="ycd-label">PRIVATE — TEAMMATE LEADS</h4>
        <p>{proof.teammateTips}</p>
        <small className="ycd-muted">Only authorized school/review staff will see this section.</small>
       </div>
      )}
     </div>
     <p className="ycd-muted ycd-small">Your public questionnaire will include approved answers and photos. Private teammate tips and your contributor contact email are excluded. Your abbreviated card is shown above.</p>
     <button type="button" className="ycd-btn" onClick={() => setProof(null)}>EDIT ANSWERS</button>
    </section>
   )}

   {error && <p role="alert" className="ycd-error">{error}</p>}
   <div className="wyn-submit-actions">
    <button disabled={busy} type="submit" className="ycd-btn ycd-btn-primary">
     {busy ? 'PROCESSING…' : proof ? 'CONFIRM PROOF & SUBMIT' : 'PREVIEW MY PROFILE & FLIP CARD'}
    </button>
   </div>
  </form>
 );
}
