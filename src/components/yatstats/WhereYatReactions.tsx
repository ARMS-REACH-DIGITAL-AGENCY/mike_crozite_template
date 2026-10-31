'use client';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
type Comment={id:string;text:string;when:string;author:string};
export default function WhereYatReactions({id,storyKey='legacy'}: {id:number;storyKey?:string}){
 const [data,setData]=useState<{likes:number;liked:boolean;comments:Comment[]}>({likes:0,liked:false,comments:[]});
 const [text,setText]=useState('');const [error,setError]=useState('');
 async function headers():Promise<Record<string,string>>{await auth.authStateReady?.();const token=await auth.currentUser?.getIdToken();return token?{'x-firebase-token':token}:{}}
 async function refresh(){const h=await headers();const r=await fetch('/api/contribute/where-yat-now/social?id='+id+'&storyKey='+encodeURIComponent(storyKey),{headers:h,cache:'no-store'});if(r.ok)setData(await r.json())}
 useEffect(()=>{void refresh()},[id,storyKey]);
 async function act(action:'like'|'comment'){
  const h=await headers();
  if(!Object.keys(h).length){setError('Sign in to participate.');window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:'signin'}));return;}
  const r=await fetch('/api/contribute/where-yat-now/social',{method:'POST',headers:{...h,'content-type':'application/json'},body:JSON.stringify({id,action,text,storyKey})});
  const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Unable to post.');return}
  setText('');setError('');await refresh();
 }
 async function share(){
  const url=window.location.href.split('#')[0]+'#where-yat-'+storyKey;
  if(navigator.share)try{await navigator.share({url});return}catch{}
  await navigator.clipboard.writeText(url).catch(()=>setError('Unable to copy link'));
 }
 return <section className="wyn-reactions">
   <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
    <button type="button" onClick={()=>void act('like')} aria-pressed={data.liked}>{data.liked?'♥ Liked':'♡ Like'} ({data.likes})</button>
    <button type="button" onClick={()=>document.getElementById('alumni-comment-'+storyKey)?.focus()}>Comment ({data.comments.length})</button>
    <button type="button" onClick={()=>void share()}>Share</button>
   </div>
   <h3 style={{fontFamily:'Oswald,sans-serif',marginTop:12}}>COMMUNITY COMMENTS</h3>
   {data.comments.map(c=><article key={c.id} style={{borderBottom:'1px solid currentColor',padding:'10px 0'}}><strong>{c.author}</strong><p>{c.text}</p></article>)}
   <textarea id={"alumni-comment-"+storyKey} value={text} maxLength={2000} rows={3} onChange={e=>setText(e.target.value)} placeholder="Join the conversation about life after baseball" className="wyn-comment-input"/>
   <button type="button" disabled={!text.trim()} onClick={()=>void act('comment')}>POST COMMENT</button>
   {error&&<p role="alert" style={{color:'#ffc0c0'}}>{error}</p>}
    <style>{` .wyn-reactions{border-top:1px solid #999;padding:12px 0;margin-top:12px;color:inherit} .wyn-reactions button{color:inherit;background:transparent;border:0;cursor:pointer;font:inherit} .wyn-comment-input{width:100%;box-sizing:border-box;background:transparent;color:inherit;border:1px solid #999;padding:10px} .wyn-comment-input::placeholder{color:#888} `}</style>
  </section>
}
