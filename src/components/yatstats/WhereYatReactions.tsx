'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { openSignIn, useFanMe } from './StoryViewer';

type Comment = { id: string; text: string; when: string; author: string };
type Reactions = { likes: number; liked: boolean; comments: Comment[] };
const EMPTY: Reactions = { likes: 0, liked: false, comments: [] };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'Y';
}
async function sessionHeaders(): Promise<Record<string,string>> {
  await auth.authStateReady?.();
  const token = await auth.currentUser?.getIdToken().catch(() => '');
  return token ? { 'x-firebase-token': token } : {};
}
export function whereYatMemoryUrl(storyKey: string): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('whereYatStory', storyKey);
  url.hash = 'ppTab-schedule';
  return url.toString();
}
export async function shareWhereYatMemory(storyKey: string): Promise<string | null> {
  const url = whereYatMemoryUrl(storyKey);
  try {
    if (navigator.share) { await navigator.share({url}); return null; }
    await navigator.clipboard.writeText(url);
    return 'Link copied. Paste it anywhere to share.';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null;
    try { await navigator.clipboard.writeText(url); return 'Link copied. Paste it anywhere to share.'; }
    catch { return 'Unable to copy link.'; }
  }
}

/** Stories action bar and full viewer comment thread, with retired memory storage. */
export default function WhereYatReactions({
  id,storyKey='legacy',mode='card',onOpenComment,content,focusComment=false,enabled=true,
}: {
  id:number;storyKey?:string;mode?:'card'|'viewer';
  onOpenComment?:()=>void;content?:ReactNode;focusComment?:boolean;enabled?:boolean;
}) {
  const me=useFanMe();
  const [data,setData]=useState<Reactions>(EMPTY);
  const [draft,setDraft]=useState('');
  const [composerOpen,setComposerOpen]=useState(mode==='viewer');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const name=[me?.firstName,me?.lastName].filter(Boolean).join(' ');

  const load=useCallback(async()=>{
    try{
      const headers=await sessionHeaders();
      const url='/api/contribute/where-yat-now/social?id='+encodeURIComponent(String(id))+'&storyKey='+encodeURIComponent(storyKey);
      const response=await fetch(url,{headers,credentials:'include',cache:'no-store'});
      if(!response.ok)throw Error('Reactions are unavailable.');
      const result=await response.json() as Reactions;
      setData({likes:Number(result.likes)||0,liked:!!result.liked,comments:Array.isArray(result.comments)?result.comments:[]});
    }catch{setError('Unable to load reactions.');}
  },[id,storyKey]);

  useEffect(()=>{
    if(!enabled)return;
    void load();
    const refresh=()=>void load();
    window.addEventListener('yat-auth-success',refresh);
    window.addEventListener('yat-sign-out',refresh);
    window.addEventListener('yat:where-yat-reaction',refresh);
    return()=>{
      window.removeEventListener('yat-auth-success',refresh);
      window.removeEventListener('yat-sign-out',refresh);
      window.removeEventListener('yat:where-yat-reaction',refresh);
    };
  },[load,enabled]);
  useEffect(()=>{if(mode==='viewer'&&focusComment&&composerOpen)composerRef.current?.focus()},[mode,focusComment,composerOpen]);

  const act=async(action:'like'|'comment')=>{
    if(busy)return;
    const headers=await sessionHeaders();
    if(!me&&!Object.keys(headers).length){openSignIn();return;}
    if(action==='comment'&&!draft.trim())return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/contribute/where-yat-now/social',{
        method:'POST',credentials:'include',
        headers:{...headers,'content-type':'application/json'},
        body:JSON.stringify({id,action,text:draft.trim(),storyKey})
      });
      const result=await response.json().catch(()=>({}));
      if(response.status===401){openSignIn();return;}
      if(!response.ok)throw Error(result.error||'Unable to save your reaction.');
      if(action==='comment')setDraft('');
      await load();
      window.dispatchEvent(new CustomEvent('yat:where-yat-reaction',{detail:{id,storyKey}}));
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save your reaction.')}
    finally{setBusy(false)}
  };
  const comment=()=>{
    if(mode==='card'&&onOpenComment){onOpenComment();return;}
    if(!me&&!auth.currentUser){openSignIn();return;}
    setComposerOpen(true);requestAnimationFrame(()=>composerRef.current?.focus());
  };
  const share=async()=>{const note=await shareWhereYatMemory(storyKey);if(note)setError(note)};
  const actions=<div className={mode==='viewer'?'ysv-actions':'ysf-card-actions'}>
    <button type="button" className={data.liked?(mode==='viewer'?'ysv-liked':'ysf-liked'):''}
      aria-pressed={data.liked} disabled={busy} onClick={()=>void act('like')}>
      <i className={data.liked?'ri-thumb-up-fill':'ri-thumb-up-line'} aria-hidden="true"/> Like{mode==='card'&&data.likes>0?' · '+data.likes:''}
    </button>
    <button type="button" onClick={comment}><i className="ri-chat-3-line" aria-hidden="true"/> Comment{mode==='card'&&data.comments.length>0?' · '+data.comments.length:''}</button>
    <button type="button" onClick={()=>void share()}><i className="ri-share-forward-line" aria-hidden="true"/> Share</button>
  </div>;
  const comments=<div className="ysv-comments">
    {data.comments.map(c=><div className="ysv-comment" key={c.id}>
      <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(c.author)}</span>
      <div className="ysv-comment-main">
        <div className="ysv-bubble"><strong>{c.author}</strong><span>{c.text}</span></div>
        <div className="ysv-comment-meta">{new Date(c.when).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div>
      </div>
    </div>)}
    {mode==='viewer'&&data.comments.length===0&&<div className="ysv-muted">No comments yet. Be the first.</div>}
  </div>;
  const composer=composerOpen&&<div className="ysv-composer">
    {me?<><span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(name)}</span>
      <div className="ysv-compose-box"><textarea ref={composerRef} rows={2} maxLength={2000}
        value={draft} aria-label="Write a comment" placeholder={`Add a comment as ${name||'you'}`}
        onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void act('comment')}}}/>
      </div>
      <button type="button" onClick={()=>void act('comment')} disabled={busy||!draft.trim()} aria-label="Post comment">
        <i className={busy?'ri-loader-4-line ysv-spin':'ri-send-plane-2-fill'} aria-hidden="true"/>
      </button></>:
      <button type="button" className="ysv-signin" onClick={openSignIn}>TO COMMENT ON THIS MEMORY YOU MUST BE SIGNED IN</button>}
  </div>;
  if(!enabled)return mode==='viewer'?<div className="ysv-side"><div className="ysv-scroll">{content}</div></div>:null;
  if(mode==='viewer')return <div className="ysv-side">
    <div className="ysv-scroll">{content}
      {(data.likes>0||data.comments.length>0)&&<div className="ysv-counts">
        <span>{data.likes>0&&<><i className="ri-thumb-up-fill ysv-like-dot"/> {data.likes}</>}</span>
        <span>{data.comments.length>0?`${data.comments.length} comment${data.comments.length===1?'':'s'}`:''}</span>
      </div>}
      {actions}{comments}
      {error&&<div className="ysv-note" role="status">{error}</div>}
    </div>
    {composer}
  </div>;
  return <section className="wyn-reactions" aria-label="Like, comment and share this alumni memory">
    {actions}
    {error&&<div className="ysv-note" role="status">{error}</div>}
  </section>;
}
