'use client';
import { useEffect, useState } from 'react';
import { authHeaders, openSignIn } from '@/components/yatstats/StoryViewer';
import ContributeSearch from '@/components/yatstats/ContributeSearch';
type Comment={id:string;text:string;createdAt:string;author:string};
type Tag={playerid:string;name:string};
type Data={likeCount:number;commentCount:number;likedByMe:boolean;comments:Comment[];tags:Tag[]};
export default function NewsEngagement({uuid,hsid}:{uuid:string;hsid:string}){
 const [data,setData]=useState<Data|null>(null);
 const [message,setMessage]=useState('');
 const [draft,setDraft]=useState('');
 const [tagging,setTagging]=useState(false);
 const [busy,setBusy]=useState(false);
 const url='/api/news/interact/'+encodeURIComponent(uuid);
 const refresh=async()=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});if(!r.ok)throw Error('Interactions unavailable');setData(await r.json());};
 useEffect(()=>{let alive=true;fetch(url,{credentials:'include',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(d=>{if(alive)setData(d);}).catch(()=>{if(alive)setMessage('News comments and likes are not available on this deployment.');});return()=>{alive=false;};},[url]);
 const send=async(body:Record<string,string>)=>{if(busy)return;setBusy(true);setMessage('');try{const res=await fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify(body)});const d=await res.json().catch(()=>({}));if(res.status===401){setMessage('Sign in to comment or tag players.');openSignIn();return;}if(!res.ok)throw Error(d.error||'Could not save');await refresh();if(body.action==='comment')setDraft('');if(body.action==='tag')setTagging(false);}catch(e){setMessage(e instanceof Error?e.message:'Could not save');}finally{setBusy(false);}};
 return <div className='yp-news-engagement'>
  <div className='yp-news-engagement-actions'>
   <button type='button' disabled={busy||!data} onClick={()=>send({action:'like'})}><i className={data?.likedByMe?'ri-thumb-up-fill':'ri-thumb-up-line'} aria-hidden='true'/> Like{data?.likeCount?` · ${data.likeCount}`:''}</button>
   <span><i className='ri-chat-3-line' aria-hidden='true'/> Comments{data?.commentCount?` · ${data.commentCount}`:''}</span>
   <button type='button' onClick={()=>setTagging(x=>!x)}><i className='ri-price-tag-3-line' aria-hidden='true'/> Tag player</button>
  </div>
  {data?.tags?.length?<div className='yp-news-tags'>Tagged: {data.tags.map(t=><span key={t.playerid}>{t.name}</span>)}</div>:null}
  {tagging?<div className='yp-news-tag-picker'><strong>Search for a player to tag</strong><ContributeSearch mode='player' onPlayer={p=>{if(hsid&&p.schoolId&&p.schoolId!==hsid){setMessage('Choose an alumnus from this school.');return;}void send({action:'tag',playerId:p.playerId});}}/></div>:null}
  <div className='yp-news-comment-list'>{data?.comments?.map(c=><div key={c.id} className='yp-news-comment'><strong>{c.author}</strong><p>{c.text}</p></div>)}</div>
  <form onSubmit={e=>{e.preventDefault();if(draft.trim())void send({action:'comment',text:draft.trim()});}}><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} rows={2} placeholder='Add a comment (sign in required)' aria-label='Write a news comment'/><button type='submit' disabled={!draft.trim()||busy}>Post comment</button></form>
  {message?<p role='status' className='yp-news-interaction-message'>{message}</p>:null}
  <style>{`.yp-news-engagement{border-top:1px solid var(--yat-content-drawer-border,#555);margin-top:18px;padding-top:14px;font:400 13px/1.5 var(--yat-font-ui,Arial,sans-serif)}.yp-news-engagement-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.yp-news-engagement-actions button{border:0;background:none;color:inherit;cursor:pointer;padding:7px 2px;font:700 12px inherit}.yp-news-engagement-actions span{font-weight:700}.yp-news-comment-list{display:grid;gap:10px;margin:12px 0}.yp-news-comment{border-bottom:1px solid #8884;padding-bottom:8px}.yp-news-comment p{margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere}.yp-news-engagement form{display:grid;gap:7px;margin-top:10px}.yp-news-engagement textarea{box-sizing:border-box;resize:vertical;width:100%;padding:10px;border:1px solid #999;border-radius:5px;background:var(--yat-content-drawer-bg,#111);color:var(--yat-content-drawer-fg,#fff);font:inherit}.yp-news-engagement form button{justify-self:end;border-radius:4px;padding:8px 12px;background:#ffb21c;color:#111;border:0;font-weight:800;cursor:pointer}.yp-news-engagement form button:disabled{opacity:.4}.yp-news-tags span{display:inline-block;margin:4px;padding:3px 8px;border:1px solid #888;border-radius:18px}.yp-news-tag-picker{padding:10px 0;max-width:100%;overflow:hidden}.yp-news-interaction-message{color:#b18c3c}`}</style>
 </div>;
}
