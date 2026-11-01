'use client';
import {useEffect,useMemo,useState} from 'react';
import {auth} from '@/lib/firebase';
import WhereYatProofCard,{type WhereYatProof} from './WhereYatProofCard';
import {WHERE_YAT_PROMPTS,type WhereYatPromptKey} from '@/lib/whereYatPrompts';
type Photo={web:string;full:string;thumb:string};
export type FlipCardSaved={id:number;status:string;display_name?:string;location_city?:string;location_state?:string;occupation?:string;company_name?:string;business_website?:string;company_logo_url?:string;business_headshot_url?:string;business_contact_email?:string;business_contact_phone?:string;business_public_opt_in?:boolean;linkedin_url?:string;facebook_url?:string;instagram_url?:string;x_url?:string;favorite_hs_memory?:string;favorite_post_hs_memory?:string;family_life?:string;story?:string;featured_memory_key?:string;memory_photos_json?:Record<string,Photo[]>};
const answers:Record<WhereYatPromptKey,keyof FlipCardSaved>={favoriteHs:'favorite_hs_memory',favoriteAfter:'favorite_post_hs_memory',family:'family_life',story:'story'};
export default function WhereYatFlipCardEditor({saved,playerId,hsid,name,school,onSaved,drawerMode=false}:{saved:FlipCardSaved;playerId:string;hsid:string;name:string;school:string;onSaved:(updated:FlipCardSaved)=>void;drawerMode?:boolean}){
 const [open,setOpen]=useState(drawerMode),[busy,setBusy]=useState(false),[error,setError]=useState(''),[view,setView]=useState(false);
 const [values,setValues]=useState<Record<string,string>>({
 city:saved.location_city||'',state:saved.location_state||'',occupation:saved.occupation||'',company:saved.company_name||'',
 website:saved.business_website||'',linkedin:saved.linkedin_url||'',facebook:saved.facebook_url||'',instagram:saved.instagram_url||'',x:saved.x_url||'',
 businessEmail:saved.business_contact_email||'',businessPhone:saved.business_contact_phone||'',featuredMemory:saved.featured_memory_key||'story'
 });
 const [consent,setConsent]=useState(!!saved.business_public_opt_in),[logo,setLogo]=useState<File|null>(null),[headshot,setHeadshot]=useState<File|null>(null);
 const logoPreview=useMemo(()=>logo?URL.createObjectURL(logo):null,[logo]);
 const headshotPreview=useMemo(()=>headshot?URL.createObjectURL(headshot):null,[headshot]);
 useEffect(()=>()=>{if(logoPreview)URL.revokeObjectURL(logoPreview)},[logoPreview]);
 useEffect(()=>()=>{if(headshotPreview)URL.revokeObjectURL(headshotPreview)},[headshotPreview]);
 function value(k:string,v:string){setValues(old=>({...old,[k]:v}));setView(false)}
 const keys=WHERE_YAT_PROMPTS.filter(x=>String(saved[answers[x.key]]||'').trim());
 const featured=(keys.some(x=>x.key===values.featuredMemory)?values.featuredMemory:keys[0]?.key||'story') as WhereYatPromptKey;
 const photo=saved.memory_photos_json?.[featured]?.[0]?.web||'';
 const selected=WHERE_YAT_PROMPTS.find(x=>x.key===featured);
 const proof:WhereYatProof={playerId,hsid,displayName:name,city:values.city,state:values.state,occupation:values.occupation,company:values.company,
 website:values.website,linkedin:values.linkedin,facebook:values.facebook,instagram:values.instagram,x:values.x,businessEmail:values.businessEmail,businessPhone:values.businessPhone,
 logoUrl:logoPreview||saved.company_logo_url||null,businessHeadshotUrl:headshotPreview||saved.business_headshot_url||null,
 story:String(saved[answers[featured]]||''),storyPrompt:selected?.label.replace('YOUR HIGH SCHOOL',school.toUpperCase()),photoUrl:photo,businessPublic:consent};
 async function save(){if(busy)return;setBusy(true);setError('');try{
  const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sign in to save your flip card.');
  const data=new FormData();data.set('submissionId',String(saved.id));
  for(const [k,v] of Object.entries(values))data.set(k,v);data.set('featuredMemory',featured);if(consent)data.set('businessPublic','yes');
  if(logo)data.set('companyLogo',logo);if(headshot)data.set('businessHeadshot',headshot);
  const r=await fetch('/api/contribute/where-yat-now/card',{method:'PATCH',headers:{'x-firebase-token':token},body:data});
  const out=await r.json().catch(()=>({}));if(!r.ok)throw Error(out.error||'Could not save card.');
  onSaved({...saved,...{
   location_city:values.city,location_state:values.state,occupation:values.occupation,company_name:values.company,business_website:values.website,
   linkedin_url:values.linkedin,facebook_url:values.facebook,instagram_url:values.instagram,x_url:values.x,
   business_contact_email:values.businessEmail,business_contact_phone:values.businessPhone,business_public_opt_in:consent,featured_memory_key:featured,
   company_logo_url:out.card.company_logo_url,business_headshot_url:out.card.business_headshot_url
  }});
  setOpen(false);setView(false);
 }catch(e){setError(e instanceof Error?e.message:'Could not save.')}finally{setBusy(false)}}
 const defs:[string,string][]=[['city','CITY'],['state','STATE'],['occupation','NOW / PROFESSION'],['company','BUSINESS NAME'],['website','BUSINESS WEBSITE (LINKED FROM LOGO)'],
 ['linkedin','LINKEDIN'],['facebook','FACEBOOK'],['x','X'],['instagram','INSTAGRAM'],['businessEmail','PUBLIC BUSINESS EMAIL'],['businessPhone','PUBLIC BUSINESS PHONE / TEXT']];
 return <div className="wyn-card-editor">{!drawerMode&&<button type="button" className="wyn-card-open" onClick={()=>setOpen(v=>!v)}><i className="ri-edit-line"/> {open?'CLOSE EDITOR':'DESIGN THE BACK OF YOUR FLIP CARD'}</button>}
 {open&&<section className="wyn-card-fields" aria-label="Flip-card back editor">
  
  {defs.map(([k,label])=><label key={k}><span>{label}</span><input value={values[k]||''} onChange={e=>value(k,e.target.value)}/></label>)}
  <label><span>BUSINESS LOGO — CLICKABLE WEBSITE LINK</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setLogo(e.target.files?.[0]||null);setView(false)}}/></label>
  <label><span>BUSINESS HEADSHOT — UPPER RIGHT</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setHeadshot(e.target.files?.[0]||null);setView(false)}}/></label>
  <label className="wyn-card-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Allow my business links and contact information to be public</label>
  <label><span>MEMORY FOR LOWER HALF</span><select value={featured} onChange={e=>value('featuredMemory',e.target.value)}>{keys.map(k=><option key={k.key} value={k.key}>{k.label.replace('YOUR HIGH SCHOOL',school.toUpperCase())}</option>)}</select></label>
  <div className="wyn-card-actions"><button type="button" onClick={()=>setView(v=>!v)}>{view?'HIDE PROOF':'PREVIEW FLIP CARD'}</button><button type="button" disabled={busy||!keys.length} onClick={()=>void save()}>{busy?'SAVING…':'SAVE FLIP CARD'}</button></div>
  {error&&<p role="alert">{error}</p>}
  {view&&<div className="wyn-card-proof"><WhereYatProofCard variant="content" proof={proof}/></div>}
 </section>}
 <style>{`.wyn-card-editor{display:grid;gap:8px}.wyn-card-open{border:1px solid var(--wyn-border,rgba(128,128,128,.3));background:var(--wyn-card-bg,rgba(128,128,128,.1));color:inherit;border-radius:7px;padding:13px;font:700 13px var(--yat-font-condensed,Oswald,sans-serif);cursor:pointer}.wyn-card-fields{display:grid;gap:9px;padding:14px;border:1px solid var(--wyn-border,rgba(128,128,128,.3));border-radius:8px;background:var(--wyn-card-bg,rgba(128,128,128,.08))}.wyn-card-fields>label{display:grid;gap:4px;font-size:12px;font-weight:700}.wyn-card-fields input:not([type=checkbox]),.wyn-card-fields select{box-sizing:border-box;width:100%;min-height:38px;padding:8px;border:1px solid #888;border-radius:5px;color:inherit;background:var(--wyn-card-bg,#222)}.wyn-card-fields .wyn-card-consent{display:flex;align-items:center;gap:8px}.wyn-card-actions{display:flex;gap:8px;flex-wrap:wrap}.wyn-card-actions button{padding:10px 12px;border:1px solid #888;border-radius:6px;background:#242424;color:#fff;font-weight:700}.wyn-card-actions button:last-child{background:#e9bc44;color:#111}.wyn-card-proof{max-width:500px;margin:0 auto;width:100%;aspect-ratio:1;overflow:hidden;border:2px solid #a58d64}.wyn-card-proof .wyn-embedded{height:100%}`}</style>
 </div>;
}
