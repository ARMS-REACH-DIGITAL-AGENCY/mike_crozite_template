'use client';
import { useEffect, useState } from 'react';
import { authHeaders, openSignIn, useFanMe } from '@/components/yatstats/StoryViewer';
import { useRef } from 'react';
type Comment={id:string;text:string;createdAt:string;author:string};
type Tag={playerid:string;name:string};
type Data={likeCount:number;commentCount:number;likedByMe:boolean;comments:Comment[];tags:Tag[]};
export default function NewsEngagement({uuid,hsid}:{uuid:string;hsid:string}){
 const me=useFanMe();
 const [data,setData]=useState<Data|null>(null);
 const [message,setMessage]=useState('');
 const [draft,setDraft]=useState('');
 const [mention,setMention]=useState('');
 const [matches,setMatches]=useState<Array<{playerId:string;displayName:string;currentTeamName:string;schoolName:string;headshotUrl:string;crestUrl:string}>>([]);
 const [mentionOpen,setMentionOpen]=useState(false);
 const [picked,setPicked]=useState<Array<{playerId:string;displayName:string}>>([]);
 const requestRef=useRef(0);
 useEffect(()=>{
   const q=mention.trim();
   if(!mentionOpen||q.length<2){setMatches([]);return;}
   const controller=new AbortController();const id=++requestRef.current;
   const timer=window.setTimeout(()=>{
     fetch('/api/players/search?q='+encodeURIComponent(q)+'&limit=12',{signal:controller.signal})
       .then(r=>r.ok?r.json():{players:[]})
       .then(d=>{if(id===requestRef.current)setMatches(Array.isArray(d.players)?d.players:[]);})
       .catch(()=>{if(!controller.signal.aborted)setMatches([]);});
   },200);
   return()=>{controller.abort();clearTimeout(timer);};
 },[mention,mentionOpen]);
 const [shareMessage,setShareMessage]=useState('');
 const shareNews=async()=>{
   if(!me){openSignIn();return;}
   const url=new URL(window.location.href);
   url.searchParams.set('story',uuid);
   try{
     if(navigator.share)await navigator.share({title:document.title,url:url.toString()});
     else{await navigator.clipboard.writeText(url.toString());setShareMessage('Link copied');}
     void fetch('/api/news/interact/'+encodeURIComponent(uuid),{
       method:'POST',credentials:'include',
       headers:{'Content-Type':'application/json',...(await authHeaders())},
       body:JSON.stringify({action:'share',method:typeof navigator.share === 'function'?'native':'copy'})
     }).catch(()=>{});
   }catch{ /* Share was cancelled. */ }
 };
 const [busy,setBusy]=useState(false);
 const url='/api/news/interact/'+encodeURIComponent(uuid);
 const refresh=async()=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});if(!r.ok)throw Error('Interactions unavailable');setData(await r.json());};
 useEffect(()=>{let alive=true;fetch(url,{credentials:'include',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(d=>{if(alive)setData(d);}).catch(()=>{if(alive)setMessage('News comments and likes are not available on this deployment.');});return()=>{alive=false;};},[url]);
 const send=async(body:Record<string,string>):Promise<boolean>=>{if(!me){openSignIn();return false;}if(busy)return false;setBusy(true);setMessage('');try{const res=await fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify(body)});const d=await res.json().catch(()=>({}));if(res.status===401){setMessage('Sign in to comment or tag players.');openSignIn();return false;}if(!res.ok)throw Error(d.error||'Could not save');await refresh();if(body.action==='comment')setDraft('');if(body.action==='tag'){setMentionOpen(false);setMention('');}return true;}catch(e){setMessage(e instanceof Error?e.message:'Could not save');return false;}finally{setBusy(false);}};
 return <div className='yp-news-engagement'>
  <div className='yp-news-engagement-actions'>
   <button type='button' disabled={busy||!data} onClick={()=>me?void send({action:'like'}):openSignIn()}><i className={data?.likedByMe?'ri-thumb-up-fill':'ri-thumb-up-line'} aria-hidden='true'/> Like{data?.likeCount?` · ${data.likeCount}`:''}</button>
   <button type='button' onClick={()=>void shareNews()}><i className='ri-share-forward-line' aria-hidden='true'/> Share</button>
   <button type='button' onClick={()=>{if(!me){openSignIn();return;}setMentionOpen(true);}}><i className='ri-at-line' aria-hidden='true'/> Tag</button>
   <span><i className='ri-chat-3-line' aria-hidden='true'/> Comments{data?.commentCount?` · ${data.commentCount}`:''}</span>
   <span className='yp-news-tag-hint'>Type @ in a comment to tag a player</span>
  </div>
  {data?.tags?.length?<div className='yp-news-tags'>Tagged: {data.tags.map(t=><span key={t.playerid}>{t.name}</span>)}</div>:null}
  {mentionOpen?<div className='yp-news-mentions'><strong>Tag a YAT?STATS player</strong><input autoFocus type='search' placeholder='Search players globally' value={mention} onChange={e=>setMention(e.target.value)} aria-label='Find player to mention'/><div className='yp-news-mention-list'>{matches.map(p=><button type='button' key={p.playerId} onClick={()=>{setPicked(list=>list.some(x=>x.playerId===p.playerId)?list:[...list,{playerId:p.playerId,displayName:p.displayName}]);setDraft(t=>t.replace(/@[A-Za-z0-9 .'-]*$/, '@'+p.displayName+' '));setMentionOpen(false);setMention('');}}><img src={p.headshotUrl||'/img/player-silhouette.png'} alt='' /><span><b>{p.displayName}</b><small>{p.currentTeamName||'Team unavailable'} · {p.schoolName}</small></span><img src={p.crestUrl||'/img/yatstats-logo-circle.png'} alt='' /></button>)}</div></div>:null}
  <div className='yp-news-comment-list'>{data?.comments?.map(c=><div key={c.id} className='yp-news-comment'><strong>{c.author}</strong><p>{c.text}</p></div>)}</div>
  {picked.length?<div className='yp-news-tags'>Mentioning: {picked.map(p=><span key={p.playerId}>@{p.displayName}</span>)}</div>:null}
  <form onSubmit={e=>{e.preventDefault();if(draft.trim())void (async()=>{const saved=await send({action:'comment',text:draft.trim()});if(saved){for(const p of picked)await send({action:'tag',playerId:p.playerId});setPicked([]);}})();}}><textarea value={draft} onChange={e=>{if(!me){openSignIn();return;}const value=e.target.value;setDraft(value);const m=value.match(/@([^@\n]{0,45})$/);setMentionOpen(Boolean(m));setMention(m?.[1]||'');}} maxLength={2000} rows={2} placeholder='Add a comment (sign in required)' aria-label='Write a news comment'/><button type='submit' disabled={!draft.trim()||busy}>Post comment</button></form>
  {shareMessage?<p role='status'>{shareMessage}</p>:null}
  {message?<p role='status' className='yp-news-interaction-message'>{message}</p>:null}
  <style>{`.yp-news-engagement{border-top:1px solid var(--yat-content-drawer-border,#555);margin-top:18px;padding-top:14px;font:400 13px/1.5 var(--yat-font-ui,Arial,sans-serif)}.yp-news-engagement-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.yp-news-engagement-actions button{border:0;background:none;color:inherit;cursor:pointer;padding:7px 2px;font:700 12px inherit}.yp-news-engagement-actions span{font-weight:700}.yp-news-comment-list{display:grid;gap:10px;margin:12px 0}.yp-news-comment{border-bottom:1px solid #8884;padding-bottom:8px}.yp-news-comment p{margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere}.yp-news-engagement form{display:grid;gap:7px;margin-top:10px}.yp-news-engagement textarea{box-sizing:border-box;resize:vertical;width:100%;padding:10px;border:1px solid #999;border-radius:5px;background:var(--yat-content-drawer-bg,#111);color:var(--yat-content-drawer-fg,#fff);font:inherit}.yp-news-engagement form button{justify-self:end;border-radius:4px;padding:8px 12px;background:#ffb21c;color:#111;border:0;font-weight:800;cursor:pointer}.yp-news-engagement form button:disabled{opacity:.4}.yp-news-mentions{margin:9px 0;font-family:var(--yat-font-ui,Archivo,Arial,sans-serif)}.yp-news-mentions input{width:100%;padding:9px;background:#252525;color:#fff;border:1px solid #777;border-radius:5px}.yp-news-mention-list{display:grid;gap:2px;max-height:270px;overflow-y:auto}.yp-news-mention-list button{display:flex;align-items:center;gap:8px;text-align:left;background:transparent;border:1px solid #444;padding:5px;color:inherit;min-height:52px;cursor:pointer;font:500 12px/1.25 var(--yat-font-ui,Archivo,Arial,sans-serif)}.yp-news-mention-list button img{width:39px;height:39px;object-fit:contain;flex:none}.yp-news-mention-list button span{flex:1;min-width:0}.yp-news-mention-list button b,.yp-news-mention-list button small{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.yp-news-mention-list button small{color:#aaa}.yp-news-tag-hint{font:500 11px var(--yat-font-ui,Archivo,Arial,sans-serif)}.yp-news-tags span{display:inline-block;margin:4px;padding:3px 8px;border:1px solid #888;border-radius:18px}.yp-news-tag-picker{padding:10px 0;max-width:100%;overflow:hidden}.yp-news-interaction-message{color:#b18c3c}`}</style>
 </div>;
}
