'use client';
import {useEffect,useRef,useState} from 'react';
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

/* Every question is visible in the index, initially closed. Keeping all
   controls mounted (and only hiding their panels) preserves FormData,
   typed answers and selected uploads when moving from question to question. */
const questionGroups = [
 { title:'ABOUT YOU', questions:[
  {id:'displayName',title:'YOUR NAME',required:true},
  {id:'email',title:'CONTACT EMAIL (PRIVATE)',required:true},
  {id:'location',title:'CITY AND STATE'},
  {id:'retirementYear',title:'YEAR YOU RETIRED FROM BASEBALL'}
 ]},
 { title:'YOUR BASEBALL AND LIFE STORY', questions:[
  {id:'favoriteHs',title:'MOST MEMORABLE MOMENT PLAYING AT YOUR HIGH SCHOOL'},
  {id:'favoriteAfter',title:'MOST MEMORABLE BASEBALL MOMENT AFTER GRADUATION'},
  {id:'family',title:'DO YOU HAVE A FAMILY? ANY BALLPLAYERS? TELL US MORE.'},
  {id:'story',title:'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?'},
  {id:'lifePhotos',title:'PHOTOS FROM LIFE AFTER BASEBALL (UP TO 4)',optional:true}
 ]},
 { title:'OPTIONAL BUSINESS SPOTLIGHT', optional:true, questions:[
  {id:'occupation',title:'YOUR PROFESSION',optional:true},
  {id:'company',title:'COMPANY / ORGANIZATION',optional:true},
  {id:'businessMessage',title:'WHAT WOULD YOU LIKE PEOPLE TO KNOW ABOUT YOUR BUSINESS?',optional:true},
  {id:'businessOffer',title:'SPECIAL OFFER',optional:true},
  {id:'companyLogo',title:'COMPANY LOGO',optional:true},
  {id:'website',title:'BUSINESS WEBSITE',optional:true},
  {id:'businessEmail',title:'PUBLIC BUSINESS EMAIL',optional:true},
  {id:'businessPhone',title:'PUBLIC BUSINESS PHONE',optional:true},
  {id:'linkedin',title:'LINKEDIN',optional:true},
  {id:'instagram',title:'INSTAGRAM',optional:true},
  {id:'facebook',title:'FACEBOOK',optional:true},
  {id:'x',title:'X / TWITTER',optional:true},
  {id:'businessPublic',title:'PERMISSION TO PUBLISH BUSINESS DETAILS',optional:true}
 ]},
 { title:'RECONNECT WITH TEAMMATES', questions:[
  {id:'teammateTips',title:'TEAMMATE INFORMATION (PRIVATE)',optional:true}
 ]},
 { title:'VERIFY YOUR SUBMISSION', questions:[
  {id:'claimAttestation',title:'CONFIRM YOU ARE THIS ALUMNUS OR HAVE PERMISSION',required:true}
 ]}
] as const;
const questionOrder = questionGroups.flatMap(group => group.questions.map(question => question.id));

export default function WhereYatClaimForm({playerId,hsid,name,school}: {playerId:string;hsid:string;name:string;school:string}){
 const form=useRef<HTMLFormElement>(null);
 const [photos,setPhotos]=useState<Picked[]>([]);
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
 const [openQuestion,setOpenQuestion]=useState<string|null>(null);
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
   displayName:'display_name',email:'contact_email',city:'location_city',state:'location_state',
   occupation:'occupation',company:'company_name',website:'business_website',linkedin:'linkedin_url',
   instagram:'instagram_url',facebook:'facebook_url',x:'x_url',story:'story',favoriteHs:'favorite_hs_memory',
   favoriteAfter:'favorite_post_hs_memory',family:'family_life',retirementYear:'retirement_year',
   businessMessage:'business_message',businessOffer:'business_offer',businessEmail:'business_contact_email',
   businessPhone:'business_contact_phone',teammateTips:'private_teammate_tips'};
  for(const [key,column] of Object.entries(mapping)){
   const input=form.current.elements.namedItem(key) as HTMLInputElement|HTMLTextAreaElement|null;
   if(input)input.value=String(saved[column]??'');
  }
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
 async function addFiles(files:FileList|null){
  if(!files)return;
  const picked=Array.from(files).slice(0,Math.max(0,4-photos.length));setBusy(true);
  try{
   const prepared=await Promise.all(picked.map(async file=>{const a=await prepareStoryPhoto(await copyStoryPhoto(file));return {...a,url:URL.createObjectURL(a.blob)}}));
   setPhotos(prev=>[...prev,...prepared]);setProof(null);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not read photo')}finally{setBusy(false)}
 }

 // Only one question can be open. The next action opens the next one and
 // scrolls its heading into view; closing never unmounts the input element.
 function showQuestion(id:string|null){
  setOpenQuestion(id);
  if(id) requestAnimationFrame(() => document.getElementById('wyn-q-'+id)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
 }
 function nextQuestion(id:string){
  const index=questionOrder.indexOf(id as typeof questionOrder[number]);
  showQuestion(index>=0 && index<questionOrder.length-1 ? questionOrder[index+1] : null);
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
  if(!proof){setProof(Object.fromEntries([...data.entries()].filter(([,v])=>typeof v==='string')) as Record<string,string>);
    requestAnimationFrame(()=>document.getElementById('claim-proof')?.scrollIntoView({behavior:'smooth',block:'start'}));return}
  setBusy(true);setError('');
  try{
   await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();
   if(!token){window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:'signin'}));throw Error('Sign in to claim this profile. Your answers are still here.')}
   data.set('idToken',token);data.set('proofConfirmed','yes');
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
  if(id==='location')return <div className="ycd-pair">
   <label className="ycd-field"><span className="ycd-label">CITY</span><input name="city" autoComplete="address-level2" /></label>
   <label className="ycd-field"><span className="ycd-label">STATE</span><input name="state" autoComplete="address-level1" /></label>
  </div>;
  if(id==='retirementYear')return <label className="ycd-field"><span className="ycd-label">YEAR YOU RETIRED FROM BASEBALL</span><input type="number" name="retirementYear" min="1900" max={new Date().getFullYear()} /></label>;
  const storyField=fields.find(([key])=>key===id);
  if(storyField)return <label className="ycd-field">
   <span className="ycd-label">{storyField[1].replace('YOUR HIGH SCHOOL',school.toUpperCase())}</span>
   <textarea name={storyField[0]} rows={4} maxLength={storyField[0]==='story'?2400:5000} />
  </label>;
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
 const answeredCount=questionOrder.filter(id=>id==='lifePhotos'?photos.length>0:Boolean(answered[id])).length;

 // Presentation reuses the exact Connect & Contribute drawer design classes.
 // Keep the dedicated questionnaire data, validation, photo upload, proof,
 // permissions and API unchanged.
 if(!editEnabled && saved && signedIn)return (
  <div className="where-yat-claim">
   <section className="wyn-form-section">
    <h3 className="ycd-label">YOUR SAVED WHERE YAT? QUESTIONNAIRE</h3>
    <p className="ycd-muted ycd-small">Your previous answers are saved. You can edit them and review an updated proof before submitting a revision.</p>
    <button type="button" className="ycd-btn ycd-btn-primary" onClick={()=>setEditEnabled(true)}>EDIT MY ANSWERS</button>
   </section>
  </div>
 );
 if(!signedIn && savedLoaded)return (
  <div className="where-yat-claim"><section className="wyn-form-section">
   <h3 className="ycd-label">JOIN TO SHARE YOUR STORY</h3>
   <p className="ycd-muted ycd-small">Sign in or JOIN YAT?STATS to complete this questionnaire and return to edit your answers.</p>
   <button type="button" className="ycd-btn ycd-btn-primary" onClick={openJoin}>JOIN OR SIGN IN</button>
  </section></div>
 );
 if (receipt) return (
  <div className="where-yat-claim" role="status">
   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step"><i className="ri-checkbox-circle-line" aria-hidden="true" /></span>{published ? 'PROFILE PUBLISHED' : 'UPDATE RECEIVED — WAITING FOR APPROVAL'}</h3>
    <p className="ycd-muted ycd-small">{published ? 'Your approved flip-card back and expanded player profile are now published.' : 'Your proof has been received and is awaiting review. Neither public version has been published.'}</p>
    <div className="ycd-actions">
     <a className="ycd-btn ycd-btn-primary" href={'/' + hsid + '/where-yat-proof?submission=' + receipt}>VIEW YOUR SAVED PROOF</a>
    </div>
   </section>
  </div>
 );


 return (
  <form ref={form} onSubmit={submit} onChange={answerChanged} noValidate
   className="where-yat-claim" aria-label="Where YAT Now alumni questionnaire">
   {alreadyPending && <div role="status" className="wyn-claim-status ycd-muted ycd-small">A previous update is awaiting review. You can submit a new questionnaire below; your previous submission will be preserved.</div>}
   <p className="ycd-muted ycd-small">All questions are listed below. Tap one to answer it; opening another automatically closes the previous question. Optional questions can be skipped.</p>
   <div className="wyn-question-progress" role="status" aria-live="polite">
    <span>{answeredCount} OF {questionOrder.length} ANSWERED</span>
    <span>ONE QUESTION OPEN AT A TIME</span>
   </div>

   {questionGroups.map((group,groupIndex)=>(
    <section key={group.title} className="wyn-form-section wyn-question-group" aria-label={group.title}>
     <h3 className="ycd-label wyn-question-group-title">
      <span className="ycd-step">{groupIndex+1}</span>{group.title}
      {'optional' in group && group.optional && <small>OPTIONAL</small>}
     </h3>
     {group.questions.map((question)=>{
      const isOpen=openQuestion===question.id;
      const isAnswered=question.id==='lifePhotos'?photos.length>0:Boolean(answered[question.id]);
      const title=question.title.replace('YOUR HIGH SCHOOL',school.toUpperCase());
      const isOptional='optional' in question && question.optional;
      return (
       <div key={question.id} id={'wyn-q-'+question.id} className={'wyn-question'+(isOpen?' is-open':'')+(isAnswered?' is-answered':'')}
        data-wyn-question={question.id}>
        <button type="button" className="wyn-question-toggle" aria-expanded={isOpen}
         aria-controls={'wyn-question-body-'+question.id}
         onClick={()=>showQuestion(isOpen?null:question.id)}>
         <span className="wyn-question-title">{title}</span>
         {isOptional && <span className="wyn-question-optional">OPTIONAL</span>}
         {isAnswered && <i className="ri-checkbox-circle-fill wyn-question-done" aria-label="Answered" />}
         <i className={isOpen?'ri-arrow-up-s-line wyn-question-chevron':'ri-arrow-down-s-line wyn-question-chevron'} aria-hidden="true" />
        </button>
        {/* Hidden keeps field values, attached files, and FormData intact. */}
        <div id={'wyn-question-body-'+question.id} className="wyn-question-body" hidden={!isOpen}>
         {renderQuestion(question.id)}
         <div className="wyn-question-actions">
          <button type="button" className="ycd-btn" onClick={()=>nextQuestion(question.id)}>
           {question.id===questionOrder[questionOrder.length-1]?'DONE — REVIEW BELOW':'NEXT QUESTION'}
           <i className="ri-arrow-right-line" aria-hidden="true"/>
          </button>
         </div>
        </div>
       </div>
      );
     })}
    </section>
   ))}
   {proof && (
    <section id="claim-proof" className="wyn-form-section wyn-claim-proof">
     <h3 className="ycd-label"><span className="ycd-step">6</span> REVIEW YOUR PROFILE AND FLIP-CARD PROOFS</h3>
     <div className="wyn-proof-card">
      <WhereYatProofCard variant="full" proof={{
       playerId, hsid, displayName:proof.displayName||name, city:proof.city, state:proof.state,
       occupation:proof.occupation, company:proof.company,
       story:proof.story||proof.favoriteAfter||proof.favoriteHs, website:proof.website,
       linkedin:proof.linkedin, instagram:proof.instagram, facebook:proof.facebook,
       x:proof.x, photoUrl:photos[0]?.url
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
