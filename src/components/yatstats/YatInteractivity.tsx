// src/components/yatstats/YatInteractivity.tsx
// Inline client-side script: theme toggle, card flip, section navigation,
// drawer open/close, hero inline search, player drawer search, filter logic

import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import { GLOBAL_SEARCH_DEBOUNCE_MS, GLOBAL_SEARCH_LIMIT } from '@/lib/searchConfig';

interface YatInteractivityProps {
  resolvedHsid: string;
  firebaseConfigJSON: string;
}

export default function YatInteractivity({ resolvedHsid, firebaseConfigJSON }: YatInteractivityProps) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
window.__firebase_config = ${firebaseConfigJSON};
(function(){
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  window.__YAT_HSID='${resolvedHsid}';
  /* Favicon fallback: try school crest, fall back to YAT?STATS circle logo */
  var favLink=document.querySelector('link[rel="icon"][type="image/png"]');
  if(favLink){
    var favImg=new Image();
    favImg.onerror=function(){
      var placeholder = '/img/yatstats-logo-circle.png';
      favLink.href=placeholder;
      var appleLink=document.querySelector('link[rel="apple-touch-icon"]');
      if(appleLink)appleLink.href=placeholder;
    };
    favImg.src=favLink.href;
  }
  /* Background image fallback for player cards — silhouette is the only allowed fallback */
  document.querySelectorAll('.yat-bg[data-src]').forEach(function(el){
    var src=el.getAttribute('data-src');
    var placeholder=el.getAttribute('data-placeholder');
    var img=new Image();
    img.onload=function(){el.style.backgroundImage="url('"+src+"')";};
    img.onerror=function(){
      /* Extension-flip: legacy THEN objects may be .jpg or .png depending on upload era.
         Try the alternate extension before falling back to the silhouette placeholder. */
      var altsrc=null;
      if(src&&src.endsWith('.jpg'))altsrc=src.slice(0,-4)+'.png';
      else if(src&&src.endsWith('.png'))altsrc=src.slice(0,-4)+'.jpg';
      if(altsrc){
        var altimg=new Image();
        altimg.onload=function(){el.style.backgroundImage="url('"+altsrc+"')";};
        altimg.onerror=function(){
          if(placeholder){el.style.backgroundImage="url('"+placeholder+"')";el.style.backgroundSize='contain';el.style.backgroundPosition='center bottom';el.style.backgroundColor='#1a1a1a';}
        };
        altimg.src=altsrc;
      } else if(placeholder){
        el.style.backgroundImage="url('"+placeholder+"')";
        el.style.backgroundSize='contain';el.style.backgroundPosition='center bottom';el.style.backgroundColor='#1a1a1a';
      }
    };
    img.src=src;
  });

  var saved=localStorage.getItem('yat-theme');
  if(saved==='light')document.body.classList.add('light-theme');
  var btn=document.getElementById('theme-toggle');
  if(btn){
    btn.addEventListener('click',function(){
      var isLight=document.body.classList.toggle('light-theme');
      localStorage.setItem('yat-theme',isLight?'light':'dark');
      var ic=btn.querySelector('i');
      if(ic)ic.className=isLight?'ri-moon-line':'ri-sun-line';
    });
    if(saved==='light'){var ic=btn.querySelector('i');if(ic)ic.className='ri-moon-line';}
  }
  document.addEventListener('click',function(e){
    var card=e.target.closest('.yat-card');
    if(!card)return;
    if(e.target.closest('a')||e.target.closest('button'))return;
    card.classList.toggle('is-flipped');
  });

 function normalizeTab(tabId){
  if(tabId === 'team') return 'current';
  return tabId;
}

function showSection(tabId, updateHash){
  var key = normalizeTab(tabId);

  document.querySelectorAll('.yat-section').forEach(function(s){
    s.classList.remove('visible');
  });

  var sec = document.getElementById('sec-' + key);
  if(sec) sec.classList.add('visible');

  resetFiltersForCurrentSection();

  var sectionLabel = document.getElementById('yatSectionLabel');
  if(sectionLabel){
    var labels = {
      active:'ACTIVE BASEBALL ALUMNI',
      news:'ACTIVE ALUMNI NEWS',
      alltime:'NEXT-LEVEL ALL-TIME LIST',
      current:'2026 HIGH SCHOOL TEAM',
      fantasy:'FANTASY BRACKET TOURNEY',
      mentor:'MENTORSHIP MARKETPLACE',
      partner:'PARTNERSHIP PROGRAM',
      about:'ABOUT US',
      faq:"FAQ'S"
    };
    var label = labels[key] || key.toUpperCase();
    sectionLabel.textContent = label;
  }

  if(updateHash){
  history.replaceState(null, '', '#sec-' + key);
  window.scrollTo({ top: 0, behavior: 'auto' });
}
}

document.addEventListener('click', function(e){
  var pair = e.target.closest('[data-tab]');
  if(!pair) return;

  var tab = pair.dataset.tab;
  if(!tab) return;

  e.preventDefault();
  showSection(tab, true);
  document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
});

(function initSectionFromHash(){
  var hash = window.location.hash || '';
  var tab = '';

  if(hash.indexOf('#sec-') === 0){
    tab = hash.replace('#sec-', '');
  }

  if(!tab) tab = 'active';
  showSection(tab, false);
})();

window.addEventListener('hashchange', function(){
  var hash = window.location.hash || '';
  var tab = hash.indexOf('#sec-') === 0 ? hash.replace('#sec-', '') : 'active';
  showSection(tab, false);
});

  
  var btnMenu=document.getElementById('btnMenu') || document.getElementById('openMenu');
var closeLeft=document.getElementById('closeLeft');
var mask=document.getElementById('drawerMask');

if(btnMenu){
  btnMenu.addEventListener('click',function(){
    document.body.classList.add('drawer-left-open');
    document.body.classList.add('drawer-open');
    document.body.classList.remove('drawer-right-open','drawer-account-open');
  });
}

if(closeLeft){
  closeLeft.addEventListener('click',function(){
    document.body.classList.remove('drawer-left-open','drawer-open');
  });
}

if(mask){
  mask.addEventListener('click',function(){
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });
}
if(mask){
  mask.addEventListener('click',function(){
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });

  
}var openFilters=document.getElementById('openFilters');
  var closeFilters=document.getElementById('closeFilters');
  var filtersReset=document.getElementById('filtersReset');
  var filtersReset2=document.getElementById('filtersReset2');
  if(openFilters)openFilters.addEventListener('click',function(){document.body.classList.toggle('drawer-right-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open','drawer-account-open');});
  if(closeFilters)closeFilters.addEventListener('click',function(){document.body.classList.remove('drawer-right-open','drawer-open');});
  
  
  var btnAccount=document.getElementById('btnAccount');
  var closeAccount=document.getElementById('closeAccount');
  if(btnAccount)btnAccount.addEventListener('click',function(){document.body.classList.toggle('drawer-account-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open','drawer-right-open');});
  if(closeAccount)closeAccount.addEventListener('click',function(){document.body.classList.remove('drawer-account-open','drawer-open');});
  var mask=document.getElementById('drawerMask');
  if(mask)mask.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');});

  /* ====================================================================
     GLOBAL SEARCH MODAL
     Opens #gsModal on #openSearch click.
     Results show players first, then schools (grouped by region).
     ==================================================================== */
  var S3_BASE='https://yatstats-assets.s3.us-west-2.amazonaws.com';
  /* Canonical same-origin fallback: avoids CORB on cross-origin SVG from S3 */
  var CREST_FALLBACK='${CREST_FALLBACK_PATH}';
  var STAT_EMPTY='\u2014';
  var GS_RESULT_LIMIT=${GLOBAL_SEARCH_LIMIT};
  var GS_DEBOUNCE_MS=${GLOBAL_SEARCH_DEBOUNCE_MS};
  var gsModal=document.getElementById('gsModal');
  var gsOverlay=document.getElementById('gsOverlay');
  var gsClose=document.getElementById('gsClose');
  var gsInput=document.getElementById('gsInput');
  var gsResults=document.getElementById('gsResults');
  var gsTimer=null;
  var gsQueryToken=0;
  var gsHadError=false;
  function openGsModal(){
    if(!gsModal)return;
    gsModal.classList.add('open');
    document.body.classList.add('drawer-open');
    if(gsInput)setTimeout(function(){gsInput.focus();},60);
  }
  function closeGsModal(){
    if(!gsModal)return;
    gsModal.classList.remove('open');
    document.body.classList.remove('drawer-open');
    if(gsInput)gsInput.value='';
    if(gsResults)gsResults.innerHTML='';
  }
  var openSearch=document.getElementById('openSearch');
  if(openSearch)openSearch.addEventListener('click',function(){openGsModal();});
  if(gsOverlay)gsOverlay.addEventListener('click',function(){closeGsModal();});
  if(gsClose)gsClose.addEventListener('click',function(){closeGsModal();});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&gsModal&&gsModal.classList.contains('open')){closeGsModal();return;}
    if(!gsModal||!gsModal.classList.contains('open'))return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      var items=Array.from(gsResults.querySelectorAll('.yat-gs-result'));
      if(!items.length)return;
      var focused=document.activeElement;
      var idx=items.indexOf(focused);
      if(e.key==='ArrowDown')idx=idx<items.length-1?idx+1:0;
      else idx=idx>0?idx-1:items.length-1;
      items[idx].focus();
    }
  });

  function makeSectionLabel(text){
    var lbl=document.createElement('div');
    lbl.className='yat-gs-section';
    lbl.textContent=text;
    return lbl;
  }

  /* Normalize a raw API program record into a typed result object */
  function normalizeSchoolResult(p){
    var hasAlumni=p.current_aa&&p.current_aa>0;
    var status=p.microsite_url&&p.microsite_url.length>0?'live':(hasAlumni?'potential':'inactive');
    var dest;
    if(status==='live'){
      /* Use the canonical microsite URL so cross-school navigation always lands on
         the correct host instead of resolving a relative /{hsid} path on the current host */
      dest=p.microsite_url;
    } else if(p.hsid){
      dest='/'+p.hsid;
    } else {
      var sp=new URLSearchParams();
      if(p.hsname)sp.set('school',p.hsname);
      if(p.hslocation){
        var locParts=p.hslocation.split(',');
        if(locParts[0])sp.set('city',locParts[0].trim());
        if(locParts[1])sp.set('state',locParts[1].trim());
      }
      sp.set('reason',status);
      /* Use absolute URL so subdomain rewrites (e.g. school.yatstats.com → /hsid/...)
         don't intercept this path and cause a 404 */
      var notLiveBase=window.location.hostname.endsWith('.yatstats.com')?'https://yatstats.com':'';
      dest=notLiveBase+'/school-not-live?'+sp.toString();
    }
    var crestUrl=p.hsid?S3_BASE+'/schools/'+p.hsid+'.png':CREST_FALLBACK;
    var region=p.regionid||'';
    if(!region&&p.hslocation){
      var hlParts=p.hslocation.split(',');
      if(hlParts.length>=2)region=hlParts[hlParts.length-1].trim();
    }
    var draftedRatio=null;
    if(p.drafted_hs!=null&&p.drafted!=null&&(p.drafted_hs>0||p.drafted>0)){
      draftedRatio=p.drafted_hs+'/'+p.drafted;
    }
    return {
      schoolName:p.hsname||'',
      location:p.hslocation||'',
      region:region,
      crestUrl:crestUrl,
      status:status,
      dest:dest,
      activeAlumni:p.current_aa!=null?p.current_aa:null,
      mlb:p.mlb!=null?p.mlb:null,
      natRank:p.yatstats_national_rank!=null?p.yatstats_national_rank:null,
      stateRank:p.yatstats_state_rank!=null?p.yatstats_state_rank:null,
      atnla:p.atnla!=null?p.atnla:null,
      draftedRatio:draftedRatio
    };
  }

  /* Build a single stat chip element */
  function makeChip(val,lbl,highlight){
    var chip=document.createElement('div');
    chip.className='yat-gs-chip';
    var valEl=document.createElement('span');
    valEl.className='yat-gs-chip-val'+(highlight?' hi':'');
    valEl.textContent=val!=null?String(val):STAT_EMPTY;
    var lblEl=document.createElement('span');
    lblEl.className='yat-gs-chip-lbl';
    lblEl.textContent=lbl;
    chip.appendChild(valEl);
    chip.appendChild(lblEl);
    return chip;
  }

  /* Render a premium school result card */
  function renderSchoolResult(r){
    var statusLabel=r.status==='live'?'Live':(r.status==='potential'?'Candidate':'Not Active');
    var statusCls='yat-gs-status yat-gs-status-'+r.status;
    var el=document.createElement('a');
    el.className='yat-gs-result';
    el.setAttribute('data-status',r.status);
    el.setAttribute('href',r.dest);
    el.setAttribute('role','option');
    el.setAttribute('tabindex','0');
    /* Top row: crest | identity | status badge */
    var topDiv=document.createElement('div');
    topDiv.className='yat-gs-result-top';
    var crestImg=document.createElement('img');
    crestImg.className='yat-gs-result-crest';
    crestImg.alt='';
    crestImg.loading='lazy';
    crestImg.src=r.crestUrl;
    crestImg.onerror=function(){crestImg.onerror=null;crestImg.src=CREST_FALLBACK;};
    var infoDiv=document.createElement('div');
    infoDiv.className='yat-gs-result-info';
    var nameDiv=document.createElement('div');
    nameDiv.className='yat-gs-result-name';
    nameDiv.textContent=r.schoolName;
    var locDiv=document.createElement('div');
    locDiv.className='yat-gs-result-loc';
    locDiv.textContent=r.location;
    infoDiv.appendChild(nameDiv);
    if(r.location)infoDiv.appendChild(locDiv);
    var badge=document.createElement('span');
    badge.className=statusCls;
    badge.textContent=statusLabel;
    topDiv.appendChild(crestImg);
    topDiv.appendChild(infoDiv);
    topDiv.appendChild(badge);
    el.appendChild(topDiv);
    /* Stat chips row (only if at least one metric is non-null) */
    var hasStats=r.activeAlumni!=null||r.mlb!=null||r.natRank!=null||r.stateRank!=null||r.atnla!=null||r.draftedRatio!=null;
    if(hasStats){
      var statsDiv=document.createElement('div');
      statsDiv.className='yat-gs-stats';
      if(r.activeAlumni!=null)statsDiv.appendChild(makeChip(r.activeAlumni,'Active',true));
      if(r.mlb!=null)statsDiv.appendChild(makeChip(r.mlb,'MLB',false));
      if(r.natRank!=null)statsDiv.appendChild(makeChip('#'+r.natRank,"Nat'l",false));
      if(r.stateRank!=null)statsDiv.appendChild(makeChip('#'+r.stateRank,'State',false));
      if(r.atnla!=null)statsDiv.appendChild(makeChip(r.atnla,'All-Time',false));
      if(r.draftedRatio)statsDiv.appendChild(makeChip(r.draftedRatio,'Drafted',false));
      el.appendChild(statsDiv);
    }
    return el;
  }

  function renderPlayerResult(p){
    var el=document.createElement('a');
    el.className='yat-gs-result yat-gs-player';
    el.setAttribute('role','option');
    el.setAttribute('tabindex','0');
    var schoolId=p.schoolId||'';
    var playerId=p.playerId||'';
    var slug=p.slug||'player';
    var href=schoolId&&playerId?(\`/\${schoolId}/player/\${playerId}/\${slug}\`):'';
    if(href){
      el.setAttribute('href',href);
    }
    var topDiv=document.createElement('div');
    topDiv.className='yat-gs-result-top';
    var crestImg=document.createElement('img');
    crestImg.className='yat-gs-result-crest';
    crestImg.alt='';
    crestImg.loading='lazy';
    crestImg.src=p.crestUrl||CREST_FALLBACK;
    crestImg.onerror=function(){crestImg.onerror=null;crestImg.src=CREST_FALLBACK;};
    var infoDiv=document.createElement('div');
    infoDiv.className='yat-gs-result-info';
    var nameDiv=document.createElement('div');
    nameDiv.className='yat-gs-result-name';
    // fallback avoids empty label if data is incomplete while still showing partial names
    var displayName=[p.firstName,p.lastName].filter(Boolean).join(' ').trim()||'Unknown Player';
    nameDiv.textContent=displayName;
    var locDiv=document.createElement('div');
    locDiv.className='yat-gs-result-loc';
    var locParts=[];
    if(p.city)locParts.push(p.city);
    if(p.state)locParts.push(p.state);
    var subtitle=p.schoolName||'';
    var loc=locParts.join(', ');
    if(loc)subtitle+= (subtitle?' — ':'')+loc;
    locDiv.textContent=subtitle;
    infoDiv.appendChild(nameDiv);
    if(subtitle)infoDiv.appendChild(locDiv);
    topDiv.appendChild(crestImg);
    topDiv.appendChild(infoDiv);
    el.appendChild(topDiv);
    if(!href){
      el.setAttribute('aria-disabled','true');
      el.setAttribute('tabindex','-1');
      el.addEventListener('click',function(e){e.preventDefault();});
    }
    return el;
  }

  function renderSchoolGroups(items,frag){
    if(!items.length)return;
    frag.appendChild(makeSectionLabel('Schools'));
    var groups={};var order=[];
    items.forEach(function(r){
      var key=r.region||'Unknown Region';
      if(!groups[key]){groups[key]=[];order.push(key);}
      groups[key].push(r);
    });
    order.forEach(function(region){
      var hdr=document.createElement('div');
      hdr.className='yat-gs-region';
      hdr.textContent=region;
      frag.appendChild(hdr);
      groups[region].forEach(function(r){frag.appendChild(renderSchoolResult(r));});
    });
  }

  function renderPlayerSection(players,frag){
    if(!players.length)return;
    frag.appendChild(makeSectionLabel('Players'));
    players.forEach(function(p){frag.appendChild(renderPlayerResult(p));});
  }

  function fetchSchoolResults(q){
    return fetch(\`/api/schools/search?q=\${encodeURIComponent(q)}&limit=\${GS_RESULT_LIMIT}\`)
      .then(function(r){return r.json();})
      .then(function(d){return (d.programs||[]).map(normalizeSchoolResult);})
      .catch(function(err){gsHadError=true;console.warn('School search failed',err);return [];});
  }

  function fetchPlayerResults(q){
    return fetch(\`/api/players/search?q=\${encodeURIComponent(q)}&limit=\${GS_RESULT_LIMIT}\`)
      .then(function(r){return r.json();})
      .then(function(d){return d.players||[];})
      .catch(function(err){gsHadError=true;console.warn('Player search failed',err);return [];});
  }

  function renderCombinedResults(players,schools,q,hadError){
    if(!gsResults)return;
    gsResults.innerHTML='';
    var frag=document.createDocumentFragment();
    var hasPlayers=players&&players.length>0;
    var hasSchools=schools&&schools.length>0;
    if(hasPlayers)renderPlayerSection(players,frag);
    if(hasSchools)renderSchoolGroups(schools,frag);
    if(!hasPlayers&&!hasSchools){
      var msg=hadError?'Search unavailable. Please try again.':'No results found matching \u201c'+escHtml(q)+'\u201d';
      gsResults.innerHTML='<div class="yat-gs-msg">'+msg+'</div>';
      return;
    }
    gsResults.appendChild(frag);
  }

  function runGlobalSearch(q){
    if(!gsResults)return;
    gsHadError=false;
    var token=++gsQueryToken;
    gsResults.innerHTML='<div class="yat-gs-msg">Searching\u2026</div>';
    Promise.all([fetchPlayerResults(q), fetchSchoolResults(q)]).then(function(res){
      if(token!==gsQueryToken)return;
      var players=res[0],schools=res[1];
      renderCombinedResults(players||[],schools||[],q,gsHadError);
    }).catch(function(){
      if(token!==gsQueryToken)return;
      renderCombinedResults([],[],q,true);
    });
  }

  if(gsInput&&gsResults){
    gsInput.addEventListener('input',function(){
      var q=this.value.trim();
      clearTimeout(gsTimer);
      if(q.length<2){gsResults.innerHTML='';return;}
      gsTimer=setTimeout(function(){runGlobalSearch(q);},GS_DEBOUNCE_MS);
    });
    gsInput.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        var q=gsInput.value.trim();
        if(q.length>=2){clearTimeout(gsTimer);runGlobalSearch(q);}
      }
    });
  }
  var searchInput=document.getElementById('playerSearch');
  var liveResults=document.getElementById('liveResults');
  if(searchInput&&liveResults){
    searchInput.addEventListener('input',function(){
      var q=this.value.toLowerCase().trim();
      var results='';
      var seen={};
      if(q.length>=2){
        document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
          var name=card.getAttribute('data-name')||'';
          var pid=card.getAttribute('data-playerid')||'';
          var slug=card.getAttribute('data-slug')||'';
          if(name.includes(q)&&pid&&!seen[pid]){
            seen[pid]=true;
            var nameEl=card.querySelector('.yat-name');
            var dn;
            if(nameEl){var spans=nameEl.querySelectorAll('span');if(spans.length>=2){dn=escHtml((spans[0].textContent||'').trim()+' '+(spans[1].textContent||'').trim());}else{dn=escHtml((nameEl.textContent||name).trim());}}else{dn=escHtml(name);}
            results+='<a href="/${resolvedHsid}/player/'+pid+(slug?'/'+slug:'')+'" class="yat-live-hit" style="display:block;text-decoration:none;color:inherit;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--line)"><span style="font:400 14px Bebas Neue,sans-serif;letter-spacing:.04em">'+dn+'</span></a>';
          }
        });
      }
      liveResults.innerHTML=results||(q.length>=2?'<div style="padding:10px;opacity:.5;font-size:12px">No results</div>':'');
    });
  }
function applyFilters(){
  var activeSection=document.getElementById('sec-active');
  var allTimeSection=document.getElementById('sec-alltime');
  var newsSection=document.getElementById('sec-news');

  var isActivePage=activeSection&&activeSection.classList.contains('visible');
  var isAllTimePage=allTimeSection&&allTimeSection.classList.contains('visible');
  var isNewsPage=newsSection&&newsSection.classList.contains('visible');

  var nf=((document.getElementById('filterName')||{}).value||'').toLowerCase().trim();

  var lc=Array.from(document.querySelectorAll('#filterLevels input:checked')).map(function(i){return i.value;});
  var oc=Array.from(document.querySelectorAll('#filterOrgs input:checked')).map(function(i){return i.value;});
  var gc=Array.from(document.querySelectorAll('#filterGradClass input:checked')).map(function(i){return i.value;});
  var rc=Array.from(document.querySelectorAll('#filterRosterYears input:checked')).map(function(i){return i.value;});
  var sc=Array.from(document.querySelectorAll('#filterStatus input:checked')).map(function(i){return i.value;});

  document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
    var name=(card.getAttribute('data-name')||'').toLowerCase();
    var level=card.getAttribute('data-level')||'';
    var org=card.getAttribute('data-org')||'';
    var g=card.getAttribute('data-gradclass')||'';
    var rosterYears=(card.getAttribute('data-rosteryears')||'').split(',').filter(Boolean);
    var status=card.getAttribute('data-status')||'';

    var show=true;

    if(nf&&!name.includes(nf))show=false;
    if(lc.length&&!lc.includes(level))show=false;
    if(oc.length&&!oc.includes(org))show=false;
    if(gc.length&&!gc.includes(g))show=false;
    if(rc.length && !rosterYears.some(function(y){ return rc.includes(y); })) show=false;
    if(sc.length&&!sc.includes(status))show=false;

    if((isActivePage || isNewsPage) && !sc.length && status !== 'ACTIVE') show=false;

    card.style.display=show?'':'none';
  });
}
  document.addEventListener('change',function(e){
  if(e.target.closest('#filters')) applyFilters();
});

document.addEventListener('input',function(e){
  if(e.target.id==='filterName') applyFilters();
});

function resetFiltersForCurrentSection(){
  document.querySelectorAll('#filters input').forEach(function(i){
    if(i.type==='checkbox'){
      i.checked=false;
    }else{
      i.value='';
    }
  });

  var activeSection=document.getElementById('sec-active');
  var newsSection=document.getElementById('sec-news');
  var allTimeSection=document.getElementById('sec-alltime');

  var isActivePage=activeSection&&activeSection.classList.contains('visible');
  var isNewsPage=newsSection&&newsSection.classList.contains('visible');
  var isAllTimePage=allTimeSection&&allTimeSection.classList.contains('visible');

  document.querySelectorAll('#filterLevels input').forEach(function(i){
    i.checked=true;
  });

  document.querySelectorAll('#filterGradClass input').forEach(function(i){
    i.checked=true;
  });

  document.querySelectorAll('#filterRosterYears input').forEach(function(i){
    i.checked=true;
  });

  document.querySelectorAll('#filterOrgs input').forEach(function(i){
    i.checked=true;
  });

  if(isActivePage||isNewsPage){
    document.querySelectorAll('#filterStatus input[value="ACTIVE"]').forEach(function(i){
      i.checked=true;
    });
  }

  if(isAllTimePage){
    document.querySelectorAll('#filterStatus input').forEach(function(i){
      i.checked=true;
    });
  }

  applyFilters();
}

if(filtersReset)filtersReset.addEventListener('click',resetFiltersForCurrentSection);
if(filtersReset2)filtersReset2.addEventListener('click',resetFiltersForCurrentSection);
  document.querySelectorAll('.yat-fun-zone').forEach(function(fz){fz.setAttribute('data-stats-html',fz.innerHTML);});

  /* ====================================================================
     NEWS SECTION — Lazy-load from /api/news/:hsid on first tab switch
     ==================================================================== */
  var newsLoaded=false;
  var newsContainer=document.getElementById('news-grid');
  var allNewsPosts=[];

  function timeAgo(dateStr){
    try{
      var d=new Date(dateStr);
      var now=Date.now();
      var diff=now-d.getTime();
      var mins=Math.floor(diff/60000);
      if(mins<60)return mins+'m ago';
      var hrs=Math.floor(mins/60);
      if(hrs<24)return hrs+'h ago';
      var days=Math.floor(hrs/24);
      if(days<30)return days+'d ago';
      return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    }catch(e){return '';}
  }

  function stripHtml(html){
    var tmp=document.createElement('div');
    tmp.innerHTML=html;
    return tmp.textContent||tmp.innerText||'';
  }

  /* ── Article detail modal ─────────────────────────────────────────── */
  var articleOverlay=document.getElementById('articleOverlay');
  var articleModal=document.getElementById('articleModal');
  var articleModalClose=document.getElementById('articleModalClose');
  var articleModalImg=document.getElementById('articleModalImg');
  var articleModalBody=document.getElementById('articleModalBody');
  var currentArticleUrl='';

  function openArticleModal(post){
    if(!articleModal||!articleModalBody||!articleModalImg)return;
    currentArticleUrl=post.url||'';

    /* Image or placeholder */
    articleModalImg.innerHTML='';
    if(post.imageUrl){
      var mi=document.createElement('img');
      mi.className='yat-article-modal-img';
      mi.src=post.imageUrl;
      mi.alt='';
      mi.loading='lazy';
      mi.onerror=function(){
        articleModalImg.innerHTML='<div class="yat-article-modal-img-ph">\u26BE</div>';
      };
      articleModalImg.appendChild(mi);
    }else{
      articleModalImg.innerHTML='<div class="yat-article-modal-img-ph">\u26BE</div>';
    }

    /* Body */
    articleModalBody.innerHTML='';

    /* Player + level row */
    var displayName=post.playerName||post.playerDbName||'';
    if(displayName||post.level){
      var pRow=document.createElement('div');
      pRow.className='yat-article-modal-player';
      if(displayName){
        var pName=document.createElement('span');
        pName.className='yat-article-modal-player-name';
        pName.textContent=displayName.toUpperCase();
        pRow.appendChild(pName);
      }
      if(post.level){
        var lvlChip=document.createElement('span');
        lvlChip.className='yat-article-modal-level';
        lvlChip.textContent=post.level;
        pRow.appendChild(lvlChip);
      }
      articleModalBody.appendChild(pRow);
    }

    /* Title */
    var titleEl=document.createElement('div');
    titleEl.className='yat-article-modal-title';
    titleEl.textContent=stripHtml(post.title||'Untitled');
    articleModalBody.appendChild(titleEl);

    /* Snippet */
    if(post.snippet){
      var snipEl=document.createElement('div');
      snipEl.className='yat-article-modal-snippet';
      snipEl.innerHTML=post.snippet;
      articleModalBody.appendChild(snipEl);
    }

    /* Source + date meta */
    var metaEl=document.createElement('div');
    metaEl.className='yat-article-modal-meta';
    if(post.source){
      var srcEl=document.createElement('span');
      srcEl.className='yat-article-modal-source';
      srcEl.textContent=post.sourceFull||post.source;
      metaEl.appendChild(srcEl);
    }
    if(post.publishedAt){
      var dateEl=document.createElement('span');
      dateEl.className='yat-article-modal-date';
      try{
        var d=new Date(post.publishedAt);
        dateEl.textContent=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
      }catch(e){dateEl.textContent=timeAgo(post.publishedAt);}
      metaEl.appendChild(dateEl);
    }
    articleModalBody.appendChild(metaEl);

    /* Social sharing */
    var shareRow=document.createElement('div');
    shareRow.className='yat-share-row';
    var shareLabel=document.createElement('span');
    shareLabel.className='yat-share-label';
    shareLabel.textContent='Share:';
    shareRow.appendChild(shareLabel);

    function makeShareBtn(icon,label,handler){
      var btn=document.createElement('button');
      btn.className='yat-share-btn';
      btn.innerHTML='<i class="'+icon+'"></i> '+label;
      btn.addEventListener('click',handler);
      return btn;
    }

    var shareUrl=post.url||window.location.href;
    var shareTitle=encodeURIComponent(stripHtml(post.title||''));

    /* X / Twitter */
    shareRow.appendChild(makeShareBtn('ri-twitter-x-line','X',function(){
      window.open('https://x.com/intent/tweet?url='+encodeURIComponent(shareUrl)+'&text='+shareTitle,'_blank','noopener,noreferrer');
    }));
    /* Facebook */
    shareRow.appendChild(makeShareBtn('ri-facebook-line','Facebook',function(){
      window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl),'_blank','noopener,noreferrer');
    }));
    /* Email */
    shareRow.appendChild(makeShareBtn('ri-mail-line','Email',function(){
      window.open('mailto:?subject='+shareTitle+'&body='+encodeURIComponent(shareUrl));
    }));
    /* Copy link */
    var copyBtn=makeShareBtn('ri-link','Copy link',function(){
      navigator.clipboard&&navigator.clipboard.writeText(shareUrl).then(function(){
        copyBtn.classList.add('copied');
        copyBtn.querySelector('i').className='ri-check-line';
        setTimeout(function(){copyBtn.classList.remove('copied');copyBtn.querySelector('i').className='ri-link';},2000);
      });
    });
    shareRow.appendChild(copyBtn);
    articleModalBody.appendChild(shareRow);

    /* Actions — "Read full article at source" */
    var actionsEl=document.createElement('div');
    actionsEl.className='yat-article-modal-actions';
    if(post.url){
      var readBtn=document.createElement('a');
      readBtn.className='yat-article-modal-read';
      readBtn.href=post.url;
      readBtn.target='_blank';
      readBtn.rel='noopener noreferrer';
      readBtn.innerHTML='<i class="ri-external-link-line"></i> READ FULL ARTICLE AT SOURCE';
      actionsEl.appendChild(readBtn);
    }
    articleModalBody.appendChild(actionsEl);

    /* Open */
    document.body.classList.add('drawer-open');
    if(articleOverlay)articleOverlay.classList.add('open');
    articleModal.classList.add('open');
    articleModal.scrollTop=0;
  }

  function closeArticleModal(){
    if(!articleModal)return;
    articleModal.classList.remove('open');
    if(articleOverlay)articleOverlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
  }

  if(articleModalClose)articleModalClose.addEventListener('click',closeArticleModal);
  if(articleOverlay)articleOverlay.addEventListener('click',closeArticleModal);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&articleModal&&articleModal.classList.contains('open'))closeArticleModal();
  });

  /* ── News filter logic ────────────────────────────────────────────── */
  var newsFilterName=document.getElementById('newsFilterName');
  var newsFilterLevels=document.getElementById('newsFilterLevels');
  var newsFilterGradClass=document.getElementById('newsFilterGradClass');
  var newsFilterActive=document.getElementById('newsFilterActive');
  var newsFilterReset=document.getElementById('newsFilterReset');
  var activeNewsLevels=[];
  var activeGradClasses=[];
  var activeOnlyFlag=false;

  function applyNewsFilters(){
    var nf=(newsFilterName?newsFilterName.value||'':'').toLowerCase().trim();
    var cards=newsContainer?newsContainer.querySelectorAll('.yat-news-card'):[];
    var visible=0;
    cards.forEach(function(card){
      var name=(card.getAttribute('data-name')||'').toLowerCase();
      var level=card.getAttribute('data-level')||'';
      var gc=card.getAttribute('data-gradclass')||'';
      var isActive=card.getAttribute('data-active')==='true';
      var matchName=!nf||name.includes(nf);
      var matchLevel=!activeNewsLevels.length||activeNewsLevels.includes(level);
      var matchGc=!activeGradClasses.length||activeGradClasses.includes(gc);
      var matchActive=!activeOnlyFlag||isActive;
      var show=matchName&&matchLevel&&matchGc&&matchActive;
      card.style.display=show?'':'none';
      if(show)visible++;
    });
    /* show empty message if all filtered out */
    var emptyEl=newsContainer?newsContainer.querySelector('.yat-news-filtered-empty'):null;
    if(newsContainer){
      if(visible===0&&cards.length>0){
        if(!emptyEl){
          var empty=document.createElement('div');
          empty.className='yat-news-loading yat-news-filtered-empty';
          empty.style.cssText='grid-column:1/-1';
          empty.innerHTML='<div class="yat-news-empty-icon">\u26BE</div><div class="yat-news-loading-text">NO MATCHING ARTICLES</div>';
          newsContainer.appendChild(empty);
        }
      }else if(emptyEl){
        emptyEl.remove();
      }
    }
  }

  function buildNewsLevelChips(posts){
    if(!newsFilterLevels)return;
    var levels={};
    posts.forEach(function(p){if(p.level)levels[p.level]=true;});
    var keys=Object.keys(levels).sort();
    newsFilterLevels.innerHTML='';
    activeNewsLevels=[];
    keys.forEach(function(lvl){
      var btn=document.createElement('button');
      btn.className='yat-news-chip';
      btn.textContent=lvl;
      btn.dataset.level=lvl;
      btn.addEventListener('click',function(){
        btn.classList.toggle('active');
        if(btn.classList.contains('active')){
          if(!activeNewsLevels.includes(lvl))activeNewsLevels.push(lvl);
        }else{
          activeNewsLevels=activeNewsLevels.filter(function(l){return l!==lvl;});
        }
        applyNewsFilters();
      });
      newsFilterLevels.appendChild(btn);
    });
  }

  function buildNewsGradClassChips(posts){
    if(!newsFilterGradClass)return;
    var classes={};
    posts.forEach(function(p){if(p.gradClass)classes[p.gradClass]=true;});
    var keys=Object.keys(classes).sort().reverse();
    newsFilterGradClass.innerHTML='';
    activeGradClasses=[];
    keys.forEach(function(gc){
      var btn=document.createElement('button');
      btn.className='yat-news-chip';
      btn.textContent=gc;
      btn.dataset.gc=gc;
      btn.addEventListener('click',function(){
        btn.classList.toggle('active');
        if(btn.classList.contains('active')){
          if(!activeGradClasses.includes(gc))activeGradClasses.push(gc);
        }else{
          activeGradClasses=activeGradClasses.filter(function(c){return c!==gc;});
        }
        applyNewsFilters();
      });
      newsFilterGradClass.appendChild(btn);
    });
  }

  if(newsFilterName)newsFilterName.addEventListener('input',applyNewsFilters);
  if(newsFilterActive)newsFilterActive.addEventListener('click',function(){
    newsFilterActive.classList.toggle('active');
    activeOnlyFlag=newsFilterActive.classList.contains('active');
    applyNewsFilters();
  });
  if(newsFilterReset)newsFilterReset.addEventListener('click',function(){
    if(newsFilterName)newsFilterName.value='';
    activeNewsLevels=[];
    activeGradClasses=[];
    activeOnlyFlag=false;
    if(newsFilterLevels)newsFilterLevels.querySelectorAll('.yat-news-chip').forEach(function(b){b.classList.remove('active');});
    if(newsFilterGradClass)newsFilterGradClass.querySelectorAll('.yat-news-chip').forEach(function(b){b.classList.remove('active');});
    if(newsFilterActive)newsFilterActive.classList.remove('active');
    applyNewsFilters();
  });

  /* ── Card renderer ────────────────────────────────────────────────── */
  function renderNewsCard(post){
    var card=document.createElement('div');
    card.className='yat-news-card';
    /* Data attributes for filtering */
    var displayName=(post.playerName||post.playerDbName||'').toLowerCase();
    card.setAttribute('data-name',displayName);
    card.setAttribute('data-level',post.level||'');
    card.setAttribute('data-gradclass',post.gradClass||'');
    card.setAttribute('data-pid',post.playerId||'');
    card.setAttribute('data-active',post.active===true?'true':'false');

    /* Image area */
    var imgWrap=document.createElement('div');
    imgWrap.className='yat-news-img-wrap';
    if(post.imageUrl){
      var img=document.createElement('img');
      img.className='yat-news-img';
      img.loading='lazy';
      img.alt='';
      img.src=post.imageUrl;
      img.onerror=function(){
        img.style.display='none';
        var ph=document.createElement('div');
        ph.className='yat-news-img-placeholder';
        ph.innerHTML='\u26BE';
        imgWrap.appendChild(ph);
      };
      imgWrap.appendChild(img);
    }else{
      var ph=document.createElement('div');
      ph.className='yat-news-img-placeholder';
      ph.innerHTML='\u26BE';
      imgWrap.appendChild(ph);
    }
    /* Sentiment badge */
    var sent=post.sentiment||'neutral';
    var sentBadge=document.createElement('span');
    sentBadge.className='yat-news-sentiment yat-news-sentiment-'+sent;
    sentBadge.textContent=sent.toUpperCase();
    imgWrap.appendChild(sentBadge);
    card.appendChild(imgWrap);

    /* Body */
    var body=document.createElement('div');
    body.className='yat-news-body';

    /* Player name + level row */
    var cardDisplayName=post.playerName||post.playerDbName||'';
    if(cardDisplayName||post.level){
      var pRow=document.createElement('div');
      pRow.className='yat-news-player-row';
      if(cardDisplayName){
        var pNameEl=document.createElement('span');
        pNameEl.className='yat-news-player-name';
        pNameEl.textContent=cardDisplayName.toUpperCase();
        pRow.appendChild(pNameEl);
      }
      if(post.level){
        var lvlEl=document.createElement('span');
        lvlEl.className='yat-news-level-chip';
        lvlEl.textContent=post.level;
        pRow.appendChild(lvlEl);
      }
      body.appendChild(pRow);
    }

    /* Title */
    var title=document.createElement('div');
    title.className='yat-news-card-title';
    title.textContent=stripHtml(post.title||'Untitled');
    body.appendChild(title);

    /* Snippet */
    if(post.snippet){
      var snippet=document.createElement('div');
      snippet.className='yat-news-snippet';
      snippet.innerHTML=post.snippet;
      body.appendChild(snippet);
    }

    /* Categories */
    if(post.categories&&post.categories.length){
      var cats=document.createElement('div');
      cats.className='yat-news-categories';
      post.categories.slice(0,3).forEach(function(c){
        var tag=document.createElement('span');
        tag.className='yat-news-cat';
        tag.textContent=c;
        cats.appendChild(tag);
      });
      body.appendChild(cats);
    }

    /* Meta row */
    var meta=document.createElement('div');
    meta.className='yat-news-meta';
    var src=document.createElement('span');
    src.className='yat-news-source';
    src.textContent=post.source||'Unknown';
    var date=document.createElement('span');
    date.className='yat-news-date';
    date.textContent=timeAgo(post.publishedAt);
    meta.appendChild(src);
    meta.appendChild(date);
    body.appendChild(meta);

    card.appendChild(body);

    /* Click opens internal detail modal instead of navigating away */
    card.addEventListener('click',function(){openArticleModal(post);});

    return card;
  }

  function loadNews(){
    if(newsLoaded||!newsContainer)return;
    newsLoaded=true;
    newsContainer.innerHTML='<div class="yat-news-loading"><div class="yat-news-loading-spinner"></div><div class="yat-news-loading-text">LOADING ALUMNI NEWS\u2026</div></div>';
    var hsid=window.__YAT_HSID;
    fetch('/api/news/'+encodeURIComponent(hsid))
      .then(function(r){return r.json();})
      .then(function(data){
        newsContainer.innerHTML='';
        if(!data.posts||data.posts.length===0){
          newsContainer.innerHTML='<div class="yat-news-loading"><div class="yat-news-empty-icon">\u26BE</div><div class="yat-news-loading-text">NO ALUMNI NEWS FOUND YET</div><div class="yat-news-loading-text" style="font-weight:300;margin-top:8px;max-width:360px;margin-left:auto;margin-right:auto">News for active alumni will appear here as articles are published. Check back soon.</div></div>';
          return;
        }
        allNewsPosts=data.posts;
        /* Build level and grad-class filter chips from available data */
        buildNewsLevelChips(allNewsPosts);
        buildNewsGradClassChips(allNewsPosts);
        allNewsPosts.forEach(function(post){
          newsContainer.appendChild(renderNewsCard(post));
        });
        /* Footer */
        var footer=document.createElement('div');
        footer.className='yat-news-footer';
        footer.innerHTML='<span class="yat-news-powered">Powered by Webz.io News API \u00B7 '+data.total+' articles</span>';
        newsContainer.parentNode.appendChild(footer);
      })
      .catch(function(err){
        console.error('News fetch error:',err);
        newsContainer.innerHTML='<div class="yat-news-error"><div class="yat-news-error-icon">\u26A0\uFE0F</div><div class="yat-news-error-text">Unable to load news right now. Please try again later.</div></div>';
      });
  }

  /* Hook into section switching to trigger news load */
 var origShowSection=showSection;
showSection=function(tabId, updateHash){
  origShowSection(tabId, updateHash);
  if(tabId==='news')loadNews();
};
  /* Also load if news section is already visible on page load */
  var newsSection=document.getElementById('sec-news');
  if(newsSection&&newsSection.classList.contains('visible'))loadNews();
})();
        `,
      }}
    />
  );
}
