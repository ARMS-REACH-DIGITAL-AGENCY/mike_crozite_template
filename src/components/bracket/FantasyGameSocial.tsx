'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { StoryStyles, authHeaders, openSignIn, useFanMe } from '@/components/yatstats/StoryViewer';
import { jpegName, shrinkPhoto } from '@/lib/shrinkPhoto';

type CommentPhoto={web:string|null;thumb:string|null;full:string|null;width:number|null;height:number|null};
type Comment={id:string;text:string;author:string;createdAt:string;isMine:boolean;photos:CommentPhoto[]};

type Props={
  gameKey:string;
  title:string;
  subtitle:string;
  shareUrl:string;
  shareText?:string;
  preview?:React.ReactNode;
};

const MAX_PHOTOS=4;

function initials(name:string){
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()).join('')||'?';
}

function ago(iso:string){
  const s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return 'Just now'; if(s<3600)return `${Math.floor(s/60)}m`; if(s<86400)return `${Math.floor(s/3600)}h`;
  if(s<604800)return `${Math.floor(s/86400)}d`; return `${Math.floor(s/604800)}w`;
}

export default function FantasyGameSocial({gameKey,title,subtitle,shareUrl,shareText,preview}:Props){
  const me=useFanMe();
  const myName=me?[me.firstName,me.lastName].filter(Boolean).join(' '):'';
  const [liked,setLiked]=useState(false);
  const [likeCount,setLikeCount]=useState(0);
  const [comments,setComments]=useState<Comment[]>([]);
  const [commentCount,setCommentCount]=useState(0);
  const [draft,setDraft]=useState('');
  const [modal,setModal]=useState(false);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');
  const [picked,setPicked]=useState<Array<{id:string;file:File;preview:string}>>([]);
  const inputRef=useRef<HTMLInputElement|null>(null);
  const textareaRef=useRef<HTMLTextAreaElement|null>(null);

  const load=async()=>{
    try{
      const res=await fetch(`/api/fantasy-games/${encodeURIComponent(gameKey)}`,{credentials:'include',cache:'no-store'});
      const data=await res.json();
      if(res.ok){
        setLiked(Boolean(data.liked)); setLikeCount(Number(data.likeCount)||0);
        setComments(Array.isArray(data.comments)?data.comments:[]); setCommentCount(Number(data.commentCount)||0);
      }
    }catch{}
  };

  useEffect(()=>{void load();},[gameKey]);
  useEffect(()=>()=>picked.forEach(p=>URL.revokeObjectURL(p.preview)),[picked]);

  const flash=(t:string)=>{setNote(t);window.setTimeout(()=>setNote(''),2200);};

  const toggleLike=async()=>{
    if(busy)return;
    setBusy(true);
    const prev=liked,prevCount=likeCount;
    setLiked(!prev); setLikeCount(Math.max(0,prevCount+(prev?-1:1)));
    try{
      const res=await fetch(`/api/fantasy-games/${encodeURIComponent(gameKey)}/like`,{method:'POST',headers:await authHeaders(),credentials:'include'});
      const data=await res.json();
      if(!res.ok)throw new Error(data?.error||'That like did not go through.');
      setLiked(Boolean(data.liked)); setLikeCount(Number(data.likeCount)||0);
    }catch(e){setLiked(prev);setLikeCount(prevCount);flash(e instanceof Error?e.message:'That like did not go through.');}
    finally{setBusy(false);}
  };

  const share=async()=>{
    let method='link';
    let shareLink=shareUrl;
    try{
      shareLink=shareUrl.includes('snapshot=1') ? await (async()=>{const r=await fetch('/api/fantasy-share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:shareUrl})});if(!r.ok)throw new Error('Short link unavailable');return (await r.json()).url as string;})() : shareUrl;
      if(navigator.share){await navigator.share({url:shareLink});method='native';}
      else{await navigator.clipboard.writeText(shareLink);flash('Link copied.');}
    }catch(e:any){
      if(e?.name==='AbortError')return;
      if(shareUrl.includes('snapshot=1') && shareLink===shareUrl){flash('Short link could not be created. Please try again.');return;}
      try{await navigator.clipboard.writeText(shareLink);flash('Link copied.');}catch{}
    }
    fetch(`/api/fantasy-games/${encodeURIComponent(gameKey)}/share`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({method})}).catch(()=>{});
  };

  const pick=(files:FileList|null)=>{
    const room=MAX_PHOTOS-picked.length;
    const chosen=Array.from(files||[]).filter(f=>f.type.startsWith('image/')).slice(0,Math.max(0,room));
    setPicked(list=>[...list,...chosen.map(file=>({id:Math.random().toString(36).slice(2),file,preview:URL.createObjectURL(file)}))]);
    if(inputRef.current)inputRef.current.value='';
  };

  const post=async()=>{
    if(!me)return openSignIn();
    if((!draft.trim()&&!picked.length)||busy)return;
    setBusy(true);
    try{
      let body:string|FormData=JSON.stringify({text:draft.trim()});
      const headers:any=await authHeaders();
      if(picked.length){
        const form=new FormData(); form.append('text',draft.trim());
        for(const p of picked)form.append('photos',await shrinkPhoto(p.file),jpegName(p.file));
        body=form;
      }else headers['Content-Type']='application/json';
      const res=await fetch(`/api/fantasy-games/${encodeURIComponent(gameKey)}/comments`,{method:'POST',headers,credentials:'include',body});
      const data=await res.json();
      if(res.status===401){openSignIn();return;}
      if(!res.ok)throw new Error(data?.error||'Your comment could not be posted.');
      picked.forEach(p=>URL.revokeObjectURL(p.preview));
      setPicked([]); setDraft('');
      setComments(list=>[...list,data.comment]); setCommentCount(v=>v+1);
    }catch(e){flash(e instanceof Error?e.message:'Your comment could not be posted.');}
    finally{setBusy(false);}
  };

  const remove=async(c:Comment)=>{
    if(!c.isMine)return;
    try{
      const res=await fetch(`/api/fantasy-games/${encodeURIComponent(gameKey)}/comments/${encodeURIComponent(c.id)}`,{method:'DELETE',headers:await authHeaders(),credentials:'include'});
      const data=await res.json();
      if(res.status===401){openSignIn();return;}
      if(!res.ok)throw new Error(data?.error||'The comment could not be deleted.');
      setComments(list=>list.filter(x=>x.id!==c.id)); setCommentCount(v=>Math.max(0,v-1));
    }catch(e){flash(e instanceof Error?e.message:'The comment could not be deleted.');}
  };

  const openComment=()=>{
    if(!me){ openSignIn(); return; }
    if(window.matchMedia('(max-width:899px)').matches){setModal(true);setTimeout(()=>textareaRef.current?.focus(),80);}
    else textareaRef.current?.focus();
  };

  const actions=(modalMode=false)=>(
    <>
      {/* One row: each count rides in its own button (no separate counts line). */}
      <div className="ysv-actions">
        <button type="button" className={liked?'ysv-liked':''} onClick={toggleLike} aria-label={`Like${likeCount?` (${likeCount})`:''}`}><i className={liked?'ri-thumb-up-fill':'ri-thumb-up-line'}/> Like{likeCount>0?<span className="fgs-n">{likeCount}</span>:null}</button>
        <button type="button" onClick={modalMode?()=>me?textareaRef.current?.focus():openSignIn():openComment} aria-label={`Comment${commentCount?` (${commentCount})`:''}`}><i className="ri-chat-3-line"/> Comment{commentCount>0?<span className="fgs-n">{commentCount}</span>:null}</button>
        <button type="button" onClick={share}><i className="ri-share-forward-line"/> Share</button>
      </div>
    </>
  );

  const commentList=(modalMode=false)=>(
    <div className="ysv-comments">
      {comments.length===0?(modalMode?<div className="ysv-muted">No comments yet. Be the first.</div>:null):comments.map(c=>(
        <div className="ysv-comment" key={c.id}>
          <span className="ysv-avatar ysv-avatar-sm">{initials(c.author)}</span>
          <div className="ysv-comment-main">
            <div className="ysv-bubble"><strong>{c.author}</strong>{c.text?<span>{c.text}</span>:null}</div>
            {c.photos?.length?<div className="ysv-comment-photos">{c.photos.map((p,i)=><button type="button" key={i} onClick={()=>window.open(p.full||p.web||p.thumb||'','_blank')}><img src={p.thumb||p.web||p.full||''} alt=""/></button>)}</div>:null}
            <div className="ysv-comment-meta"><span>{ago(c.createdAt)}</span>{c.isMine?<button type="button" onClick={()=>remove(c)}>Delete</button>:null}</div>
          </div>
        </div>
      ))}
    </div>
  );

  // Signed out: no composer at all - COMMENT opens the account drawer.
  const composer=me?(
    <div className="ysv-composer fgs-composer">
      <>
        <span className="ysv-avatar ysv-avatar-sm">{initials(myName)}</span>
        <div className="ysv-compose-box">
          {picked.length?<div className="ysv-picked">{picked.map(p=><span key={p.id}><img src={p.preview} alt=""/><button type="button" onClick={()=>setPicked(list=>list.filter(x=>x.id!==p.id))}><i className="ri-close-line"/></button></span>)}</div>:null}
          <textarea ref={textareaRef} rows={1} value={draft} placeholder={`Comment as ${myName||'you'}`} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void post();}}}/>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={e=>pick(e.target.files)}/>
        <button type="button" className="ysv-photo-btn" onClick={()=>inputRef.current?.click()} disabled={picked.length>=MAX_PHOTOS}><i className="ri-image-add-line"/></button>
        <button type="button" onClick={()=>void post()} disabled={busy||(!draft.trim()&&!picked.length)}><i className={busy?'ri-loader-4-line ysv-spin':'ri-send-plane-2-fill'}/></button>
      </>
    </div>
  ):null;

  return <>
    <div className="fgs-inline ysv-post">
      {actions(false)}
      <div className="fgs-desktop-only">{commentList(false)}{composer}</div>
    </div>

    {modal&&typeof document!=='undefined'?createPortal(
      <div className="ysv fgs-modal" role="dialog" aria-modal="true" aria-label={title} onClick={()=>setModal(false)}>
        <div className="fgs-modal-card ysv-card" onClick={e=>e.stopPropagation()}>
          <button type="button" className="ysv-close" onClick={()=>setModal(false)} aria-label="Close"><i className="ri-close-line"/></button>
          {preview ? <div className="fgs-modal-preview">{preview}</div> : null}
          <div className="fgs-modal-head">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
          <div className="fgs-modal-body">
            {actions(true)}
            {commentList(true)}
          </div>
          {composer}
        </div>
        <StoryStyles/>
      </div>,document.body):null}

    {note?<div className="fgs-toast">{note}</div>:null}
    <StoryStyles/>
    <style jsx global>{`
      .fgs-inline.ysv-post{border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}
      .ysv-actions .fgs-n{margin-left:5px;font-weight:400;opacity:.8}
      .fgs-inline .ysv-actions{border-top:0;border-bottom:0}
      .fgs-inline .ysv-actions button{min-height:36px;font-size:14px}
      .fgs-inline .ysv-actions button i{font-size:15px}
      .fgs-inline .ysv-comments{padding:6px 0 2px;gap:7px}
      .fgs-inline .ysv-bubble{font-size:11px;padding:6px 9px}
      .fgs-inline .ysv-comment-meta{font-size:9px}
      .fgs-inline .ysv-avatar-sm{width:26px;height:26px;font-size:11px}
      .fgs-inline .ysv-composer{padding:6px 0 0}
      .fgs-inline .ysv-composer textarea{padding:7px 10px;font-size:11px}
      .fgs-inline .ysv-composer>button:not(.ysv-signin){width:32px;height:32px;font-size:14px}
      .fgs-inline .ysv-signin{min-height:32px;font-size:13px}
      .fgs-toast{position:fixed;left:50%;bottom:calc(var(--footerH,66px) + 70px);transform:translateX(-50%);z-index:10080;padding:8px 14px;border-radius:999px;background:#111;color:#ffd700;border:1px solid rgba(255,215,0,.5);font:12px/1.2 system-ui,sans-serif}
      .fgs-modal .fgs-modal-card{display:flex;flex-direction:column;width:min(620px,100%);height:min(720px,calc(100dvh - 32px));background:#0d0d0d}
      .fgs-modal-preview{flex:none;padding:18px 20px 0;background:#0d0d0d}
      .fgs-modal-preview .yfp-score-head{font-size:7px!important;padding:4px 6px 3px!important}
      .fgs-modal-preview .yfp-green-board{padding:7px 7px 6px!important}
      .fgs-modal-preview .yfp-green-row{grid-template-columns:46px repeat(9,minmax(16px,1fr)) 32px!important;gap:2px!important;margin-top:2px!important}
      .fgs-modal-preview .yfp-green-row.head{font-size:8px!important}
      .fgs-modal-preview .yfp-green-abbr{display:block!important;font-size:13px!important}
      .fgs-modal-preview .yfp-green-full{display:none!important}
      .fgs-modal-preview .yfp-green-slot,.fgs-modal-preview .yfp-green-run{height:26px!important;font-size:13px!important}
      .fgs-modal-preview .yfp-green-status{font-size:7px!important;padding:2px 4px!important}
      .fgs-modal-head{padding:14px 52px 10px 20px;border-bottom:1px solid var(--ysv-line);display:flex;flex-direction:column;gap:4px}
      .fgs-modal-head strong{font:700 20px/1 Oswald,sans-serif;color:#fff}
      .fgs-modal-head span{font:700 10px/1.2 Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffd700}
      .fgs-modal-body{flex:1;min-height:0;overflow:auto;padding:0 20px}
      .fgs-modal-body .ysv-actions{margin-top:8px}
      .fgs-modal-card>.ysv-composer{flex:none}
      @media(max-width:899px){
        .fgs-desktop-only{display:none!important}
        .fgs-modal{padding:0;align-items:stretch}
        .fgs-modal .fgs-modal-card{width:100%;height:100dvh;max-height:none;border-radius:0;border:0}
        .fgs-modal-preview{padding:14px 12px 0}
        .fgs-modal-preview .yfp-score-head{font-size:6px!important;padding:3px 5px 2px!important}
        .fgs-modal-preview .yfp-green-board{padding:5px!important}
        .fgs-modal-preview .yfp-green-row{grid-template-columns:40px repeat(9,minmax(13px,1fr)) 28px!important;gap:1px!important}
        .fgs-modal-preview .yfp-green-row.head{font-size:6.5px!important}
        .fgs-modal-preview .yfp-green-abbr{font-size:11px!important}
        .fgs-modal-preview .yfp-green-slot,.fgs-modal-preview .yfp-green-run{height:22px!important;font-size:11px!important}
        .fgs-modal-head{padding-top:12px}
      }
      @media(min-width:900px){
        .fgs-modal{display:none}
      }
    `}</style>
  </>;
}
