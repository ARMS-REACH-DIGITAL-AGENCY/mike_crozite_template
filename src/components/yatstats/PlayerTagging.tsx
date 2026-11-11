'use client';

import {useCallback,useEffect,useState} from 'react';
import {authHeaders,openSignIn,useFanMe} from './StoryViewer';
import ContributeSearch from './ContributeSearch';

export type TaggedPerson={playerId:string;name:string;hsid?:string|null;isPrimary?:boolean;taggedByMe?:boolean;canRemove?:boolean};
type Props={endpoint:string;initial?:TaggedPerson[];onUpdated?:(players:TaggedPerson[])=>void;buttonClass?:string;compact?:boolean;label?:string};

export default function PlayerTagging({endpoint,initial=[],onUpdated,buttonClass='',compact=false,label='Tag'}:Props){
  const me=useFanMe();
  const [open,setOpen]=useState(false);
  const [tags,setTags]=useState<TaggedPerson[]>(initial);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');
  const [loaded,setLoaded]=useState(false);
  const reload=useCallback(async()=>{
    try{
      const r=await fetch(endpoint,{credentials:'include',cache:'no-store',headers:await authHeaders()});
      if(!r.ok)return;
      const j=await r.json();
      if(Array.isArray(j.players)){setTags(j.players);setLoaded(true);}
    }catch{}
  },[endpoint]);
  useEffect(()=>{void reload()},[reload]);
  const mutate=async(action:'tag'|'untag',playerId:string)=>{
    if(busy)return;
    setBusy(true);setNote('');
    try{
      const r=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify({action,playerId})});
      const j=await r.json().catch(()=>({}));
      if(r.status===401){openSignIn();return;}
      if(!r.ok)throw Error(j.error||'Could not update tags.');
      if(Array.isArray(j.players)){setTags(j.players);setLoaded(true);onUpdated?.(j.players);}
      window.dispatchEvent(new CustomEvent('yat:player-tags-changed',{detail:{endpoint,playerId,action}}));
      if(endpoint.startsWith('/api/stories/'))window.dispatchEvent(new CustomEvent('yat:story-posted'));
      setNote(action==='tag'?'Player tagged.':'Tag removed.');
    }catch(e){setNote(e instanceof Error?e.message:'Could not save tags.');}
    finally{setBusy(false);}
  };
  const secondary=tags.filter(p=>!p.isPrimary);
  return <div className="ypt-wrap">
    <button type="button" className={buttonClass} aria-expanded={open} onClick={()=>{if(!me){openSignIn();return;}setOpen(v=>!v);setNote('');}}>
      <i className="ri-at-line" aria-hidden="true"/> {label}
    </button>
    {open&&<div className="ypt-panel">
      <strong>Tag players in this memory</strong>
      {secondary.length>0&&<div className="ypt-tags">{secondary.map(p=><span className="ypt-person" key={p.playerId}>{p.name}{(p.taggedByMe||p.canRemove)&&<button type="button" disabled={busy} aria-label={'Remove '+p.name} onClick={()=>void mutate('untag',p.playerId)}>×</button>}</span>)}</div>}
      {secondary.length<20?<ContributeSearch onPlayer={p=>{if(p.playerId&&!tags.some(t=>t.playerId===p.playerId))void mutate('tag',p.playerId)}}/>:<small>20 tags maximum.</small>}
      {loaded&&<small>{secondary.length} of 20 tagged</small>}
      {note&&<div className="ypt-note" role="status">{note}</div>}
    </div>}
    <style jsx global>{\`
      .ypt-wrap{position:relative;min-width:0;flex:1}
      .ypt-wrap>button{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}
      .ypt-panel{position:relative;z-index:5;box-sizing:border-box;width:100%;padding:12px;margin:6px 0 12px;border:1px solid var(--ysv-input-border,#777);border-radius:8px;background:var(--ysv-menu-bg,#191919);color:var(--ysv-fg,#fff);box-shadow:0 8px 16px #0004}
      .ypt-panel strong{display:block;font:700 13px/1.3 Arial,sans-serif;margin-bottom:8px}
      .ypt-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
      .ypt-person{display:inline-flex;gap:5px;align-items:center;border:1px solid #8887;border-radius:5px;padding:4px 7px;font:500 12px/1.2 Arial,sans-serif}
      .ypt-person button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:19px;padding:0 3px}
      .ypt-note{font:500 12px/1.4 Arial,sans-serif;margin-top:8px}
      .ypt-panel .ycs-results{max-height:180px;overflow:auto}
    \`}</style>
  </div>;
}
