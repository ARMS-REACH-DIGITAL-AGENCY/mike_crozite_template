'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import WhereYatProofCard from '@/components/yatstats/WhereYatProofCard';
type Proof={id:number;playerid:string;hsid:string;display_name:string;location_city:string|null;location_state:string|null;occupation:string|null;company_name:string|null;business_website:string|null;linkedin_url:string|null;instagram_url:string|null;facebook_url:string|null;x_url:string|null;story:string|null;photo_url:string|null;company_logo_url:string|null;status:string;created_at:string;proof_confirmed_at:string|null};
export default function ProofView(){
 const [proof,setProof]=useState<Proof|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;(async()=>{try{
 await auth.authStateReady?.();
 const token=await auth.currentUser?.getIdToken();
 const id=new URLSearchParams(location.search).get('submission');
 if(!token)throw Error('Sign in using the YAT?STATS account that submitted this update, then reopen the link.');
 const r=await fetch('/api/contribute/where-yat-now/proof?submission='+encodeURIComponent(id||''),{headers:{'x-firebase-token':token},credentials:'include',cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Proof unavailable');
 if(alive)setProof(data.proof);
 }catch(e){if(alive)setError(e instanceof Error?e.message:'Unable to load proof');}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[]);
 return <div style={{maxWidth:720,margin:'25px auto',padding:18,color:'#eee',fontFamily:'Archivo,Arial,sans-serif'}}>
 <h2 style={{font:'700 30px Oswald,sans-serif'}}>YOUR ALUMNI PROOF</h2>
 {loading?<p>Loading your saved proof…</p>:error?<p role="alert">{error}</p>:proof&&<>
 <p>Status: <strong>{proof.status==='approved'?'PUBLISHED':proof.status==='rejected'?'NOT APPROVED':'AWAITING IDENTITY REVIEW'}</strong></p>
 <WhereYatProofCard variant="full" proof={{playerId:proof.playerid,hsid:proof.hsid,displayName:proof.display_name,city:proof.location_city||'',state:proof.location_state||'',occupation:proof.occupation||'',company:proof.company_name||'',website:proof.business_website||'',linkedin:proof.linkedin_url||'',instagram:proof.instagram_url||'',facebook:proof.facebook_url||'',x:proof.x_url||'',story:proof.story||'',photoUrl:proof.photo_url,logoUrl:proof.company_logo_url}}/>
 <p style={{fontSize:13,color:'#aaa'}}>Your proof was confirmed when you submitted it. This preview is private to your signed-in account. The YAT?STATS team separately verifies identity and authorizes publication.</p>
 </>}
 </div>
}
