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
  /* Background image fallback for player cards */
  document.querySelectorAll('.yat-bg[data-src]').forEach(function(el){
    var src=el.getAttribute('data-src');
    var fallback=el.getAttribute('data-fallback');
    var placeholder=el.getAttribute('data-placeholder');
    var img=new Image();
    img.onload=function(){el.style.backgroundImage="url('"+src+"')";};
    img.onerror=function(){
      if(fallback){
        var fallbackBg="url('"+fallback+"')";
        var img2=new Image();
        img2.onload=function(){el.style.backgroundImage=fallbackBg;};
        img2.onerror=function(){if(placeholder)el.style.backgroundImage="url('"+placeholder+"')";el.style.backgroundSize='contain';el.style.backgroundPosition='center bottom';el.style.backgroundColor='#1a1a1a';};
        img2.src=fallback;
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

  function showSection(tabId){
    document.querySelectorAll('.yat-section').forEach(function(s){
      s.classList.remove('visible');
    });
    var sec=document.getElementById('sec-'+tabId);
    if(sec)sec.classList.add('visible');
    /* update section label in school row (serves as breadcrumb) */
    var sectionLabel=document.getElementById('yatSectionLabel');
    if(sectionLabel){
      var labels={
        active:'ACTIVE BASEBALL ALUMNI',
        news:'ACTIVE ALUMNI NEWS',
        alltime:'NEXT-LEVEL ALL-TIME LIST',
        team:'CURRENT TEAM',
        mentor:'MENTORSHIP MARKETPLACE',
        partner:'PCD ACTION PARTNER PROGRAM',
        faq:"FAQ'S"
      };
      var label=labels[tabId]||tabId.toUpperCase();
      sectionLabel.textContent=label;
    }
  }

  document.addEventListener('click',function(e){
    var pair=e.target.closest('[data-tab]');
    if(!pair)return;
    var tab=pair.dataset.tab;
    if(!tab)return;
    e.preventDefault();
    showSection(tab);
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });
  var btnMenu=document.getElementById('btnMenu');
  var closeLeft=document.getElementById('closeLeft');
  if(btnMenu)btnMenu.addEventListener('click',function(){document.body.classList.toggle('drawer-left-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-right-open','drawer-account-open');});
  if(closeLeft)closeLeft.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-open');});
  var openFilters=document.getElementById('openFilters');
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
      .catch(function(){gsHadError=true;return [];});
  }

  function fetchPlayerResults(q){
    return fetch(\`/api/players/search?q=\${encodeURIComponent(q)}&limit=\${GS_RESULT_LIMIT}\`)
      .then(function(r){return r.json();})
      .then(function(d){return d.players||[];})
      .catch(function(){gsHadError=true;return [];});
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
    var nf=((document.getElementById('filterName')||{}).value||'').toLowerCase().trim();
    var lc=Array.from(document.querySelectorAll('#filterLevels input:checked')).map(function(i){return i.value;});
    var gc=Array.from(document.querySelectorAll('#filterGradClass input:checked')).map(function(i){return i.value;});
    document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
      var name=card.getAttribute('data-name')||'';
      var level=card.getAttribute('data-level')||'';
      var g=card.getAttribute('data-gradclass')||'';
      var show=true;
      if(nf&&!name.includes(nf))show=false;
      if(lc.length&&!lc.includes(level))show=false;
      if(gc.length&&!gc.includes(g))show=false;
      card.style.display=show?'':'none';
    });
  }
  document.addEventListener('change',function(e){if(e.target.closest('#filters'))applyFilters();});
  document.addEventListener('input',function(e){if(e.target.id==='filterName')applyFilters();});
  if(filtersReset)filtersReset.addEventListener('click',function(){document.querySelectorAll('#filters input').forEach(function(i){if(i.type==='checkbox')i.checked=false;else i.value='';});applyFilters();});
  if(filtersReset2)filtersReset2.addEventListener('click',function(){document.querySelectorAll('#filters input').forEach(function(i){if(i.type==='checkbox')i.checked=false;else i.value='';});applyFilters();});
  document.querySelectorAll('.yat-fun-zone').forEach(function(fz){fz.setAttribute('data-stats-html',fz.innerHTML);});
})();
        `,
      }}
    />
  );
}
