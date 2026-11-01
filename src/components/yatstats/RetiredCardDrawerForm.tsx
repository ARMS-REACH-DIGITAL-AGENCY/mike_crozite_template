'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import {openContribute} from '@/lib/contribute';
import WhereYatFlipCardEditor,{type FlipCardSaved} from './WhereYatFlipCardEditor';
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
  {loading?<p className="ycd-muted">Loading your saved memories…</p>:error?<div className="ycd-error" role="alert">{error}</div>:!saved?
   <div className="ycd-placeholder">Save at least one memory on your Where YAT? page before designing your flip card.<button className="ycd-btn" type="button" onClick={onClose}>BACK TO MEMORIES</button></div>
  :<><p className="ycd-muted ycd-small">Your playing photo uses the standard photo contribution crop and approval process. Choose the memory for the back of your card here.</p>
   <button className="ycd-btn" type="button" onClick={()=>openContribute({tab:'photo',photoType:'flip_card',player:{playerId,displayName:name,schoolId:hsid,schoolName:school}})}>UPLOAD / ADJUST MY PLAYING PHOTO</button>
   <WhereYatFlipCardEditor key={saved.id} saved={saved} playerId={playerId} hsid={hsid} name={name} school={school} onSaved={setSaved} drawerMode/>
   <button className="ycd-btn" type="button" onClick={onClose}>BACK TO MEMORIES</button>
  </>}
 </div>;
}
