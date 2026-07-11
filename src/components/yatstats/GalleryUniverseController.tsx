'use client';

import { useEffect } from 'react';

type Key = 'active' | 'alltime' | 'current' | 'news';
const galleries = new Set<Key>(['active', 'alltime', 'current']);
const groups = ['filterStatus','filterLevels','filterOrgs','filterGradClass','filterRosterYears'];
const rank: Record<string,number> = {'MLB':1,'TRIPLE-A':2,'DOUBLE-A':3,'HIGH-A':4,'LOW-A':5,'ROOKIE':6,'INDY':7,"INT'L":8,'NCAA-D1':9,'NCAA-D2':10,'NCAA-D3':11,'NAIA':12,'JUCO':13,'HIGH SCHOOL':14};
const NOW_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now';

function currentKey(): Key {
  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  return (visible?.id.replace('sec-','') || location.hash.replace('#sec-','') || 'active') as Key;
}
function grid(k: Key){ return document.getElementById(`${k}-grid`); }
function cards(k: Key){ return Array.from(grid(k)?.querySelectorAll<HTMLElement>('.yat-card[data-playerid]') || []); }
function wrapper(card: HTMLElement){ return card.closest<HTMLElement>('[data-player-card-wrap="true"]') || card; }
function level(card: HTMLElement){ return (card.dataset.level || '').toUpperCase(); }
function status(card: HTMLElement){ return (card.dataset.status || '').toUpperCase(); }
function rosterCount(card: HTMLElement){ return (card.dataset.rosteryears || '').split(',').filter(Boolean).length; }
function grad(card: HTMLElement){ const n=Number(card.dataset.gradclass); return Number.isFinite(n)&&n>0?n:9999; }
function last(card: HTMLElement){ return (card.dataset.name || '').trim().split(/\s+/).pop() || ''; }
function compare(k: Key,a: HTMLElement,b: HTMLElement){
  if(k==='alltime') return grad(a)-grad(b)||(rank[level(a)]||99)-(rank[level(b)]||99)||rosterCount(b)-rosterCount(a)||last(a).localeCompare(last(b));
  return (rank[level(a)]||99)-(rank[level(b)]||99)||grad(a)-grad(b)||rosterCount(b)-rosterCount(a)||last(a).localeCompare(last(b));
}
function cloneUniverse(){
  const source=new Map<string,HTMLElement>();
  [...cards('active'),...cards('alltime'),...cards('current')].forEach(card=>{const id=card.dataset.playerid||'';if(id&&!source.has(id))source.set(id,card);});
  (['active','alltime','current'] as Key[]).forEach(k=>{
    const g=grid(k); if(!g)return;
    const have=new Set(cards(k).map(c=>c.dataset.playerid));
    source.forEach((card,id)=>{
      if(have.has(id))return;
      const node=card.parentElement?.matches('[data-player-card-wrap="true"]')?card.parentElement.cloneNode(true):card.cloneNode(true);
      (node as HTMLElement).setAttribute('data-universe-clone','true');
      g.appendChild(node);
    });
  });
}
function checked(id:string){
  return Array.from(document.querySelectorAll<HTMLInputElement>(`#${id} input:checked:not([data-select-all])`)).map(x=>x.value.toUpperCase());
}
function syncSelectAll(){
  groups.forEach(id=>{
    const boxes=Array.from(document.querySelectorAll<HTMLInputElement>(`#${id} input[type="checkbox"]:not([data-select-all])`));
    const all=document.querySelector<HTMLInputElement>(`#${id} input[data-select-all]`);
    if(all)all.checked=boxes.length>0&&boxes.every(x=>x.checked);
  });
}
function setVisible(card:HTMLElement,yes:boolean){wrapper(card).style.display=yes?'':'none';}
function filterUniverse(){
  const k=currentKey(); if(!galleries.has(k))return;
  const name=(document.querySelector<HTMLInputElement>('#filterName')?.value||'').toLowerCase().trim();
  const selected={status:checked('filterStatus'),level:checked('filterLevels'),org:checked('filterOrgs'),grad:checked('filterGradClass'),years:checked('filterRosterYears')};
  cards(k).forEach(card=>{
    const roster=(card.dataset.rosteryears||'').split(',').map(x=>x.toUpperCase());
    const yes=(!name||(card.dataset.name||'').toLowerCase().includes(name))&&(!selected.status.length||selected.status.includes(status(card)))&&(!selected.level.length||selected.level.includes(level(card)))&&(!selected.org.length||selected.org.includes((card.dataset.org||'').toUpperCase()))&&(!selected.grad.length||selected.grad.includes((card.dataset.gradclass||'').toUpperCase()))&&(!selected.years.length||roster.some(y=>selected.years.includes(y)));
    setVisible(card,yes);
  });
  sortVisible(k); mirrorRow3(k);
}
function clearFilters(){
  document.querySelectorAll<HTMLInputElement>('#filters input').forEach(input=>{if(input.type==='checkbox')input.checked=false;else input.value='';});
}
function preset(k:Key){
  if(!galleries.has(k))return;
  clearFilters();
  if(k==='active'){
    document.querySelectorAll<HTMLInputElement>('#filterStatus input[type="checkbox"]:not([data-select-all])').forEach(x=>x.checked=x.value.toUpperCase()!=='RETIRED');
    document.querySelectorAll<HTMLInputElement>('#filterLevels input[type="checkbox"]:not([data-select-all])').forEach(x=>x.checked=x.value.toUpperCase()!=='HIGH SCHOOL');
  }
  if(k==='alltime'){
    document.querySelectorAll<HTMLInputElement>('#filterStatus input[type="checkbox"]:not([data-select-all])').forEach(x=>x.checked=true);
    document.querySelectorAll<HTMLInputElement>('#filterLevels input[type="checkbox"]:not([data-select-all])').forEach(x=>x.checked=true);
  }
  if(k==='current') document.querySelectorAll<HTMLInputElement>('#filterLevels input[type="checkbox"]:not([data-select-all])').forEach(x=>x.checked=x.value.toUpperCase()==='HIGH SCHOOL');
  syncSelectAll(); filterUniverse();
}
function sortVisible(k:Key){const g=grid(k);if(!g)return;cards(k).sort((a,b)=>compare(k,a,b)).forEach(card=>g.appendChild(wrapper(card)));}
function mirrorRow3(k:Key){
  if(!galleries.has(k))return;
  const inner=document.querySelector<HTMLElement>('.gallery-strip-inner');if(!inner)return;
  inner.innerHTML='';
  cards(k).filter(card=>wrapper(card).style.display!=='none').forEach(card=>{
    const id=card.dataset.playerid||'';
    const a=document.createElement('a');
    a.href='#'; a.className='gallery-slot gallery-slot-link'; a.dataset.playerid=id; a.title=card.dataset.name||'';
    const safeId=encodeURIComponent(id);
    a.innerHTML=`<div class="gallery-slot-media"><img class="gallery-slot-img" src="${NOW_BASE}/${safeId}.jpg" onerror="this.onerror=null;this.src='/img/headshot-silhouette.png'" alt=""><div class="gallery-slot-gradient"></div><div class="gallery-slot-name-overlay">${last(card).toUpperCase()}</div></div>`;
    inner.appendChild(a);
  });
}
function showSection(k:Key,hash=true){
  document.querySelectorAll<HTMLElement>('.yat-section').forEach(s=>s.classList.remove('visible'));
  document.getElementById(`sec-${k}`)?.classList.add('visible');
  if(hash)history.replaceState(null,'',`#sec-${k}`);
  if(galleries.has(k))preset(k);
  window.dispatchEvent(new Event('hashchange'));
}

export default function GalleryUniverseController(){
  useEffect(()=>{
    cloneUniverse();
    const initial=currentKey(); if(galleries.has(initial))preset(initial);
    const click=(e:MouseEvent)=>{
      const target=e.target instanceof Element?e.target:null;if(!target)return;
      const nav=target.closest<HTMLElement>('[data-tab]');
      if(nav){const k=(nav.dataset.tab==='team'?'current':nav.dataset.tab) as Key;if(k){e.preventDefault();e.stopImmediatePropagation();showSection(k);}return;}
      const reset=target.closest('#filtersReset,#filtersReset2');
      if(reset&&galleries.has(currentKey())){e.preventDefault();e.stopImmediatePropagation();preset(currentKey());return;}
      const thumb=target.closest<HTMLElement>('.gallery-slot-link[data-playerid],.gallery-current-slot-link[data-playerid]');
      if(thumb&&galleries.has(currentKey())){e.preventDefault();e.stopImmediatePropagation();cards(currentKey()).find(c=>c.dataset.playerid===thumb.dataset.playerid)?.scrollIntoView({behavior:'smooth',block:'start'});}
    };
    const change=(e:Event)=>{
      const target=e.target instanceof HTMLInputElement?e.target:null;if(!target||!target.closest('#filters')||!galleries.has(currentKey()))return;
      e.stopImmediatePropagation();
      if(target.dataset.selectAll)document.querySelectorAll<HTMLInputElement>(`#${target.dataset.selectAll} input[type="checkbox"]:not([data-select-all])`).forEach(x=>x.checked=target.checked);
      syncSelectAll();filterUniverse();
    };
    const input=(e:Event)=>{const t=e.target as HTMLElement;if(t?.id==='filterName'&&galleries.has(currentKey())){e.stopImmediatePropagation();filterUniverse();}};
    window.addEventListener('click',click,true);window.addEventListener('change',change,true);window.addEventListener('input',input,true);
    return()=>{window.removeEventListener('click',click,true);window.removeEventListener('change',change,true);window.removeEventListener('input',input,true);};
  },[]);
  return null;
}
