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
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  const data=new FormData(e.currentTarget);data.set('playerId',playerId);data.set('hsid',hsid);
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

 // Presentation reuses the exact Connect & Contribute drawer design classes.
 // Keep the dedicated questionnaire data, validation, photo upload, proof,
 // permissions and API unchanged.
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
  <form ref={form} onSubmit={submit} className="where-yat-claim" aria-label="Where YAT Now alumni questionnaire">
   {alreadyPending && <div role="status" className="wyn-claim-status ycd-muted ycd-small">A previous update is awaiting review. You can submit a new questionnaire below; your previous submission will be preserved.</div>}
   <p className="ycd-muted ycd-small">Claim your alumni profile and tell the {school} baseball community what happened after baseball. Only verified alumni profiles are published.</p>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step">1</span> ABOUT YOU</h3>
    <div className="wyn-form-fields">
     <label className="ycd-field"><span className="ycd-label">YOUR NAME</span><input required name="displayName" defaultValue={fan.name || name} /></label>
     <label className="ycd-field"><span className="ycd-label">CONTACT EMAIL (PRIVATE)</span><input required type="email" name="email" defaultValue={fan.email} /></label>
     <div className="ycd-pair">
      <label className="ycd-field"><span className="ycd-label">CITY</span><input name="city" /></label>
      <label className="ycd-field"><span className="ycd-label">STATE</span><input name="state" /></label>
     </div>
     <label className="ycd-field"><span className="ycd-label">YEAR YOU RETIRED FROM BASEBALL</span><input type="number" name="retirementYear" min="1900" max="2026" /></label>
    </div>
   </section>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step">2</span> YOUR STORY</h3>
    <p className="ycd-muted ycd-small">Share the memories and moments that make up your life after baseball.</p>
    <div className="wyn-form-fields">
     {fields.map(([key,title]) => (
      <label key={key} className="ycd-field">
       <span className="ycd-label">{title.replace('YOUR HIGH SCHOOL', school.toUpperCase())}</span>
       <textarea name={key} rows={4} maxLength={key === 'story' ? 2400 : 5000} />
      </label>
     ))}
    </div>
   </section>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step">3</span> PHOTOS FROM LIFE AFTER BASEBALL</h3>
    <p className="ycd-muted ycd-small">Choose up to four photos to accompany your alumni story.</p>
    <div className="ycd-field">
     <label className="wyn-photo-select">
      <span className="wyn-photo-select-heading"><i className="ri-image-add-line" aria-hidden="true" /> ADD PHOTOS</span>
      <input type="file" multiple accept="image/*" onChange={e => void addFiles(e.target.files)} aria-label="Add up to four life after baseball photos" />
     </label>
     {photos.length > 0 && (
      <div className="wyn-photos">
       {photos.map((p,i) => (
        <div className="wyn-photo-thumb" key={p.url}>
         <img src={p.url} alt={'Photo ' + (i+1)} />
         <button type="button" className="ycd-btn" onClick={() => { URL.revokeObjectURL(p.url); setPhotos(v => v.filter((_,j) => j!==i)); setProof(null); }}>Remove</button>
        </div>
       ))}
      </div>
     )}
    </div>
   </section>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step">4</span> OPTIONAL BUSINESS SPOTLIGHT</h3>
    <p className="ycd-muted ycd-small">Separate from your alumni story. Choose whether to publish your business contact information.</p>
    <div className="wyn-form-fields">
     <label className="ycd-field"><span className="ycd-label">YOUR PROFESSION</span><input name="occupation" /></label>
     <label className="ycd-field"><span className="ycd-label">COMPANY / ORGANIZATION</span><input name="company" /></label>
     <label className="ycd-field"><span className="ycd-label">WHAT WOULD YOU LIKE PEOPLE TO KNOW ABOUT YOUR BUSINESS?</span><textarea name="businessMessage" rows={3} /></label>
     <label className="ycd-field"><span className="ycd-label">SPECIAL OFFER (OPTIONAL)</span><textarea name="businessOffer" rows={2} /></label>
     <label className="ycd-field"><span className="ycd-label">COMPANY LOGO (OPTIONAL)</span><input type="file" name="companyLogo" accept="image/png,image/jpeg,image/webp" /></label>
     {([['website','BUSINESS WEBSITE'],['businessEmail','PUBLIC BUSINESS EMAIL'],['businessPhone','PUBLIC BUSINESS PHONE'],['linkedin','LINKEDIN'],['instagram','INSTAGRAM'],['facebook','FACEBOOK'],['x','X / TWITTER']] as const).map(([key,title]) => (
      <label className="ycd-field" key={key}><span className="ycd-label">{title}</span><input name={key} /></label>
     ))}
     <label className="wyn-checkbox"><input type="checkbox" name="businessPublic" value="yes" /><span>I authorize YAT?STATS to display my optional business promotion and contact details.</span></label>
    </div>
   </section>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step">5</span> TEAMMATES — WHERE THEY YAT?</h3>
    <p className="ycd-muted ycd-small">Private leads for the {school} baseball program. These details are never published.</p>
    <label className="ycd-field">
     <span className="ycd-label">TEAMMATE INFORMATION (PRIVATE)</span>
     <textarea name="teammateTips" rows={4} maxLength={5000} placeholder="Names, graduation years, and information that can help reconnect fellow alumni" />
    </label>
   </section>

   <section className="wyn-form-section">
    <h3 className="ycd-label"><span className="ycd-step"><i className="ri-shield-check-line" aria-hidden="true" /></span> VERIFY YOUR SUBMISSION</h3>
    <label className="wyn-checkbox">
     <input type="checkbox" name="claimAttestation" required value="yes" />
     <span>I am this alumnus or have their permission to submit this profile. This claim will be independently verified.</span>
    </label>
   </section>

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
