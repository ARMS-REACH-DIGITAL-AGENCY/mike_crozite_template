'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {authHeaders,openSignIn,useFanMe} from './StoryViewer';
import ContributeSearch from './ContributeSearch';

export type TaggedPerson={playerId:string;name:string;hsid?:string|null;isPrimary?:boolean;taggedByMe?:boolean;canRemove?:boolean};
type Props={endpoint:string;initial?:TaggedPerson[];onUpdated?:(players:TaggedPerson[])=>void;buttonClass?:string;compact?:boolean;label?:string;payload?:Record<string,string|number>};

export default function PlayerTagging({endpoint,initial=[],onUpdated,buttonClass='',compact=false,label='Tag',payload={}}:Props){
  const me=useFanMe();
  const [open,setOpen]=useState(false);
  const [tags,setTags]=useState<TaggedPerson[]>(initial);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');
  const [loaded,setLoaded]=useState(false);
  const panelRef=useRef<HTMLDivElement>(null);
  const savingRef=useRef(false);
  // Android often leaves the layout viewport at its original height while
  // the keyboard covers the visual viewport. Size the active tag workspace
  // to the visible area, not the hidden area behind the keyboard.
  useEffect(()=>{
    if(!open)return;
    const panel=panelRef.current;
    if(!panel)return;
    const root=panel.closest<HTMLElement>('.ysv');
    const scroll=panel.closest<HTMLElement>('.ysv-scroll');
    const vp=window.visualViewport;
    const previous=scroll?.scrollTop||0;
    const media=window.matchMedia('(max-width:760px)');
    let frame=0;
    const resize=()=>{
      if(!media.matches||!root)return;
      root.classList.add('ypt-active');
      root.style.setProperty('--ypt-vh', Math.round(vp?.height||window.innerHeight)+'px');
      root.style.setProperty('--ypt-vtop', Math.round(vp?.offsetTop||0)+'px');
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{if(scroll)scroll.scrollTop=0});
    };
    resize();
    if(!root&&media.matches)panel.scrollIntoView({block:'nearest'});
    vp?.addEventListener('resize',resize);
    vp?.addEventListener('scroll',resize);
    window.addEventListener('resize',resize);
    return ()=>{
      cancelAnimationFrame(frame);
      vp?.removeEventListener('resize',resize);
      vp?.removeEventListener('scroll',resize);
      window.removeEventListener('resize',resize);
      root?.classList.remove('ypt-active');
      root?.style.removeProperty('--ypt-vh');
      root?.style.removeProperty('--ypt-vtop');
      if(scroll)scroll.scrollTop=previous;
    };
  },[open]);
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
    if(savingRef.current)return;
    savingRef.current=true;
    setBusy(true);setNote('');
    try{
      const r=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify({...payload,action,playerId})});
      const j=await r.json().catch(()=>({}));
      if(r.status===401){setNote('Please sign in, then select the player again.');openSignIn();return;}
      if(!r.ok)throw Error(j.error||'Could not update tags.');
      if(!Array.isArray(j.players))throw Error('The server did not confirm the tag. Please try again.');
      setTags(j.players);setLoaded(true);onUpdated?.(j.players);
      window.dispatchEvent(new CustomEvent('yat:player-tags-changed',{detail:{endpoint,playerId,action}}));
      if(endpoint.startsWith('/api/stories/'))window.dispatchEvent(new CustomEvent('yat:story-posted'));
      setNote(action==='tag'?'Player tagged.':'Tag removed.');
    }catch(e){setNote(e instanceof Error?e.message:'Could not save tags.');}
    finally{savingRef.current=false;setBusy(false);}
  };
  const secondary=tags.filter(p=>!p.isPrimary);
  return <div className="ypt-wrap">
    <button type="button" className={buttonClass} aria-expanded={open} onClick={()=>{if(!me){openSignIn();return;}setOpen(v=>!v);setNote('');}}>
      <i className="ri-at-line" aria-hidden="true"/> {label}
    </button>
    {open&&<div className="ypt-panel" ref={panelRef}>
      <div className="ypt-heading"><strong>Tag players{loaded?' · '+secondary.length+'/20':''}</strong><button type="button" onClick={()=>{setOpen(false);setNote('')}} aria-label="Finish tagging">Done</button></div>
      {(busy||note)&&<div className="ypt-note" role="status">{busy?'Saving tags…':note}</div>}
      {secondary.length<20?<ContributeSearch tagPicker onPlayer={p=>{if(!p.playerId){setNote('Choose a player from search.');return;}if(tags.some(t=>t.playerId===p.playerId)){setNote(p.displayName+' is already in this memory.');return;}void mutate('tag',p.playerId)}}/>:<small>20 tags maximum.</small>}
      {secondary.length>0&&<div className="ypt-tags" aria-label="Tagged players">{secondary.map(p=><span className="ypt-person" key={p.playerId}>{p.name}{(p.taggedByMe||p.canRemove)&&<button type="button" disabled={busy} aria-label={'Remove '+p.name} onClick={()=>void mutate('untag',p.playerId)}>×</button>}</span>)}</div>}
    </div>}
    <style jsx global>{`
      /* Four equal toolbar buttons; the tag picker itself still spans all four. */
      .ypt-wrap{display:contents}
      .ypt-wrap>button{min-width:0;display:flex;align-items:center;justify-content:center;gap:4px;min-height:34px;padding:0 4px;white-space:nowrap;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}
      .ypt-wrap>button[aria-expanded=true]{color:var(--ysv-gold-text,var(--ysf-when,#a86d00))}
      .ypt-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .ypt-heading strong{font:700 13px/1.3 Arial,sans-serif}
      .ypt-heading button{padding:4px 10px;border:1px solid var(--ypt-border);border-radius:5px;background:transparent;color:var(--ypt-fg);cursor:pointer;font:700 13px/1.2 Arial,sans-serif}
      .ypt-panel .ycs{display:flex;flex-direction:column}
      .ypt-panel .ycs .yat-gs-input-wrap{order:0}
      .ypt-panel .ycs .ycs-back{order:1}
      .ypt-panel .ycs .ycs-results{order:2}
      .ypt-panel .ycs .yat-search-mode-buttons{order:3;margin:6px 0}
      .ypt-panel .ycs-results .yat-search-section-label:not(.yat-search-state-label){display:none}
      .ypt-panel .ycs .ypt-result{grid-template-columns:32px minmax(0,1fr) 28px auto;min-height:50px;gap:6px;padding:5px;text-align:left}
      .ypt-panel .ycs .ypt-result .yat-search-player-headshot{width:32px!important;height:32px!important}
      .ypt-panel .ycs .ypt-result .yat-search-player-hs-logo{width:28px!important;height:28px!important}
      .ypt-panel .ypt-add{display:inline-flex;align-items:center;gap:3px;padding:5px 6px;border:1px solid var(--ypt-border);border-radius:5px;color:var(--ypt-accent);font:700 11px/1.15 Arial,sans-serif;white-space:nowrap}
      @media(max-width:760px){
        .ysv.ypt-active{top:var(--ypt-vtop,0px);bottom:auto;height:var(--ypt-vh,100dvh)}
        .ysv.ypt-active .ysv-card{height:100%;grid-template-rows:minmax(0,18%) minmax(0,1fr)}
        .ysv.ypt-active .ysv-scroll{padding:4px 8px 8px}
        .ysv.ypt-active .ysv-scroll:has(> .ysv-actions .ypt-panel)>:not(.ysv-actions){display:none}
        .ysv.ypt-active .ysv-side .ysv-composer{display:none}
        .ysv.ypt-active .ysv-actions{border-top:0;border-bottom:0}
        .ysv.ypt-active .ypt-panel{padding:8px;margin-bottom:4px;box-shadow:none}
        .ypt-panel .ycs .yat-gs-input-wrap input.yat-gs-input{min-height:40px}
        .ypt-panel .ycs .yat-search-mode-btn{min-height:28px}
      }
      .ypt-panel{position:relative;grid-column:1/-1;z-index:5;box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:12px;margin:0 0 12px;--ypt-bg:#191919;--ypt-fg:#fff;--ypt-input:#292929;--ypt-border:#666;--ypt-muted:#bdbdbd;--ypt-accent:#d9bd80;border:1px solid var(--ypt-border);border-radius:8px;background:var(--ypt-bg);color:var(--ypt-fg);box-shadow:0 8px 16px #0004;overflow:visible}
      .ypt-panel .ycs{min-width:0;max-width:100%;color:var(--ypt-fg);--fg:var(--ypt-fg);--line:var(--ypt-border);--accent:var(--ypt-accent)}
      body.light-theme .ypt-panel{--ypt-bg:#fffdf8;--ypt-fg:#1f1912;--ypt-input:#fff;--ypt-border:#a69f95;--ypt-muted:#555;--ypt-accent:#795500}
      .ypt-panel .ycs .yat-gs-input-wrap input.yat-gs-input{color:var(--ypt-fg)!important;background:var(--ypt-input)!important;border-color:var(--ypt-border)!important}
      .ypt-panel .ycs .yat-gs-input-wrap input.yat-gs-input::placeholder{color:var(--ypt-muted);opacity:1}
      .ypt-panel .ycs .yat-gs-input-icon,.ypt-panel .ycs .yat-search-mode-btn,.ypt-panel .ycs .yat-search-player-result,.ypt-panel .ycs .yat-search-school-card,.ypt-panel .ycs .yat-search-player-text-link,.ypt-panel .ycs .yat-search-player-text-link strong,.ypt-panel .ycs .yat-search-fav-btn,.ypt-panel .ycs .yat-search-section-label,.ypt-panel .ycs .yat-search-empty,.ypt-panel .ycs .ycs-back{color:var(--ypt-fg)!important}
      .ypt-panel .ycs .yat-search-mode-btn,.ypt-panel .ycs .yat-search-player-result,.ypt-panel .ycs .yat-search-school-card{background:var(--ypt-input)!important;border-color:var(--ypt-border)!important}
      .ypt-panel .ycs .yat-search-mode-btn.active{border-color:var(--ypt-fg)!important;box-shadow:inset 0 0 0 1px var(--ypt-fg)}
      .ypt-panel .ycs .yat-search-player-text-link .yat-search-hs-line{color:var(--ypt-accent)!important}
      .ypt-panel .ycs .yat-search-mode-btn:focus-visible,.ypt-panel .ycs .yat-search-player-result:focus-within{outline:2px solid var(--ypt-accent);outline-offset:2px}
      .ypt-panel .ycs .yat-gs-input-wrap input.yat-gs-input{box-sizing:border-box;width:100%;min-width:0;padding:10px 34px 10px 43px}
      .ypt-panel .ycs .yat-gs-input-wrap .yat-gs-input-icon{position:absolute;left:13px;right:auto;top:50%;transform:translateY(-50%);pointer-events:none}
      .ypt-panel .ycs .yat-search-mode-buttons{min-width:0;width:100%}
      .ypt-panel .ycs .yat-search-mode-btn{white-space:normal;overflow-wrap:normal}
      
      .ypt-tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 0}
      .ypt-person{display:inline-flex;gap:5px;align-items:center;border:1px solid var(--ypt-border);border-radius:5px;padding:4px 7px;font:500 12px/1.2 Arial,sans-serif}
      .ypt-person button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:19px;padding:0 3px}
      .ypt-note{font:600 12px/1.3 Arial,sans-serif;margin:2px 0 4px;overflow-wrap:anywhere}
      .ypt-panel .ycs-results{max-height:180px!important;overflow:auto!important;min-height:0;margin:4px 0}
    `}</style>
  </div>;
}
