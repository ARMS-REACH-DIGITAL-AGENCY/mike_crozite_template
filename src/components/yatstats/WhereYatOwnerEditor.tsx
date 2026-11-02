'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import WhereYatClaimForm from './WhereYatClaimForm';

/** Only the original signed-in contributor can open a saved questionnaire. */
export default function WhereYatOwnerEditor({playerId,hsid,name,school}:{playerId:string;hsid:string;name:string;school:string}) {
 const [isOwner,setIsOwner]=useState(false);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  let active=true;
  const check=async()=>{
   await auth.authStateReady?.();
   const token=await auth.currentUser?.getIdToken().catch(()=>'');
   if(!token){if(active){setIsOwner(false);setOpen(false);}return;}
   const url='/api/contribute/where-yat-now/mine?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid);
   const result=await fetch(url,{headers:{'x-firebase-token':token},cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
   if(active)setIsOwner(Boolean(result?.submission));
  };
  void check();
  window.addEventListener('yat-auth-success',check);
  window.addEventListener('yat-sign-out',check);
  return()=>{active=false;window.removeEventListener('yat-auth-success',check);window.removeEventListener('yat-sign-out',check)};
 },[playerId,hsid]);
 if(!isOwner)return null;
 return <section className="wyn-owner-editor" style={{marginBottom:12}}>
  <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
   style={{padding:'9px 14px',border:'1px solid currentColor',borderRadius:5,background:'transparent',color:'inherit',font:'700 13px Archivo,Arial,sans-serif'}}>
   <i className="ri-edit-line" aria-hidden="true"/> {open?'CLOSE EDITOR':'EDIT MY STORIES / ANSWERS'}
  </button>
  {open&&<div style={{marginTop:12}}><WhereYatClaimForm playerId={playerId} hsid={hsid} name={name} school={school}/></div>}
 </section>;
}
