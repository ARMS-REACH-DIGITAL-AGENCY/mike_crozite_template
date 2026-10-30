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
 const [fan,setFan]=useState({name:'',email:''});
 useEffect(()=>{const u=auth.currentUser;setFan({name:u?.displayName||'',email:u?.email||''})},[]);
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
   window.dispatchEvent(new CustomEvent('yat:where-yat-submitted',{detail:{playerId,hsid}}));
  }catch(e){setError(e instanceof Error?e.message:'Submission failed')}finally{setBusy(false)}
 }
 const style={background:'#1c1c1c',color:'#eee',border:'1px solid #555',width:'100%',padding:11,fontSize:15,boxSizing:'border-box' as const};
 const labelStyle={display:'block',font:'700 15px Oswald,sans-serif',letterSpacing:'.03em',marginBottom:15};
 if(receipt)return <div role="status"><h3>WAITING FOR APPROVAL</h3><p>Your proof has been submitted for verification.</p><a href={`/${hsid}/where-yat-proof?submission=${receipt}`}>VIEW YOUR SAVED PROOF</a></div>;
 return <form ref={form} onSubmit={submit} style={{display:'grid',gap:15,maxWidth:780}}>
  <p style={{color:'#bbb'}}>Claim your alumni profile and tell the {school} baseball community what happened after baseball. Only verified alumni profiles are published.</p>
  <section><h3>ABOUT YOU</h3>
  <label style={labelStyle}>YOUR NAME<input required name="displayName" defaultValue={fan.name||name} style={style}/></label>
  <label style={labelStyle}>CONTACT EMAIL (PRIVATE)<input required type="email" name="email" defaultValue={fan.email} style={style}/></label>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label style={labelStyle}>CITY<input name="city" style={style}/></label><label style={labelStyle}>STATE<input name="state" style={style}/></label></div>
  <label style={labelStyle}>YEAR YOU RETIRED FROM BASEBALL<input type="number" name="retirementYear" min="1900" max="2026" style={style}/></label>
  {fields.map(([key,title])=><label key={key} style={labelStyle}>{title.replace('YOUR HIGH SCHOOL',school.toUpperCase())}<textarea name={key} rows={4} maxLength={key==='story'?2400:5000} style={{...style,display:'block',resize:'vertical'}} /></label>)}
  <label style={labelStyle}>PHOTOS FROM LIFE AFTER BASEBALL (UP TO 4)
   <div style={{padding:18,border:'2px dashed #e9bf56',marginTop:8,textAlign:'center'}}>+ ADD PHOTOS<input type="file" multiple accept="image/*" onChange={e=>void addFiles(e.target.files)} style={{display:'block',width:'100%',marginTop:12}}/>
   <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:10}}>{photos.map((p,i)=><div key={p.url}><img src={p.url} alt={'Photo '+(i+1)} style={{width:90,height:90,objectFit:'contain'}}/><button type="button" onClick={()=>{URL.revokeObjectURL(p.url);setPhotos(v=>v.filter((_,j)=>j!==i));setProof(null)}}>Remove</button></div>)}</div></div>
  </label></section>
  <section><h3>OPTIONAL BUSINESS SPOTLIGHT</h3><p>Separate from your alumni story. Choose whether to publish your business contact information.</p>
   <label style={labelStyle}>YOUR PROFESSION<input name="occupation" style={style}/></label>
   <label style={labelStyle}>COMPANY / ORGANIZATION<input name="company" style={style}/></label>
   <label style={labelStyle}>WHAT WOULD YOU LIKE PEOPLE TO KNOW ABOUT YOUR BUSINESS?<textarea name="businessMessage" rows={3} style={style}/></label>
   <label style={labelStyle}>SPECIAL OFFER (OPTIONAL)<textarea name="businessOffer" rows={2} style={style}/></label>
   <label style={labelStyle}>COMPANY LOGO (OPTIONAL)<input type="file" name="companyLogo" accept="image/png,image/jpeg,image/webp" style={style}/></label>
   {([['website','BUSINESS WEBSITE'],['businessEmail','PUBLIC BUSINESS EMAIL'],['businessPhone','PUBLIC BUSINESS PHONE'],['linkedin','LINKEDIN'],['instagram','INSTAGRAM'],['facebook','FACEBOOK'],['x','X / TWITTER']] as const).map(([key,title])=><label key={key} style={labelStyle}>{title}<input name={key} style={style}/></label>)}
   <label><input type="checkbox" name="businessPublic" value="yes"/> I authorize YAT?STATS to display my optional business promotion and contact details.</label>
  </section>
  <section><h3>TEAMMATES — WHERE THEY YAT?</h3><p style={{color:'#bbb'}}>Private leads for the {school} baseball program. These details are never published.</p>
   <textarea name="teammateTips" rows={4} maxLength={5000} placeholder="Names, graduation years, and information that can help reconnect fellow alumni" style={style}/>
  </section>
  <label><input type="checkbox" name="claimAttestation" required value="yes"/> I am this alumnus or have their permission to submit this profile. This claim will be independently verified.</label>
  {proof&&<section id="claim-proof"><h3>REVIEW YOUR PROFILE AND FLIP-CARD PROOFS</h3>
   <WhereYatProofCard variant="full" proof={{playerId,hsid,displayName:proof.displayName||name,city:proof.city,state:proof.state,occupation:proof.occupation,company:proof.company,story:proof.story||proof.favoriteAfter||proof.favoriteHs,website:proof.website,linkedin:proof.linkedin,instagram:proof.instagram,facebook:proof.facebook,x:proof.x,photoUrl:photos[0]?.url}}/>
   <p>Your public questionnaire will include all approved answers and photos. Private teammate tips and contact email are excluded.</p>
   <button type="button" onClick={()=>setProof(null)}>EDIT ANSWERS</button></section>}
  {error&&<p role="alert" style={{color:'#ffb5b5'}}>{error}</p>}
  <button disabled={busy} type="submit" style={{background:'#e9bf56',border:0,padding:15,font:'800 18px Oswald,sans-serif',color:'#111',cursor:'pointer'}}>{busy?'PROCESSING…':proof?'CONFIRM PROOF & SUBMIT':'PREVIEW MY PROFILE & FLIP CARD'}</button>
 </form>;
}
