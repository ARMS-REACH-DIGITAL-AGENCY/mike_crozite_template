'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import type {FlipCardSaved} from './WhereYatFlipCardEditor';
import WhereYatUnifiedDrawer from './WhereYatUnifiedDrawer';
export default function RetiredCardDrawerForm({playerId,hsid,name,school,onClose}:{playerId:string;hsid:string;name:string;school:string;onClose:()=>void}){
 const [saved,setSaved]=useState<FlipCardSaved|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  try{await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sign in to save your flip-card design.');
   const r=await fetch('/api/contribute/where-yat-now/mine?playerId='+encodeURIComponent(playerId)+'&hsid='+encodeURIComponent(hsid),{headers:{'x-firebase-token':token},cache:'no-store'});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Unable to find your saved memories.');
   if(active)setSaved(j.submission||null);
  }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load your flip card.');}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false}},[playerId,hsid]);
 return <div className="ycd-narrow" aria-label="Retired alumni flip card designer">
  {loading?<p className="ycd-muted">Loading your flip-card details…</p>:error?<div role="alert" className="ycd-error">{error}</div>:
   <WhereYatUnifiedDrawer key={saved?.id||playerId} saved={saved} playerId={playerId} hsid={hsid} name={name} school={school} onSaved={setSaved}/>
  }
 </div>;
}
