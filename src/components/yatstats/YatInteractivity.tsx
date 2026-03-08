// src/components/yatstats/YatInteractivity.tsx
// Inline client-side script: theme toggle, card flip, section navigation,
// drawer open/close, hero inline search, player drawer search, filter logic

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
      var placeholder = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/ys_crest.svg';
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
     INLINE HERO SEARCH
     HERO_SEARCH_SCOPE controls where the search is performed:
       'global'    – searches all schools across the YAT?STATS platform
                     via /api/schools/search (API, fast, minimal friction)
       'subdomain' – searches only this school's current roster via DOM
     ==================================================================== */
  var HERO_SEARCH_SCOPE='global';
  var openSearch=document.getElementById('openSearch');
  var heroSearchInput=document.getElementById('heroSearchInput');
  var heroSearchClose=document.getElementById('heroSearchClose');
  var heroSearchDrop=document.getElementById('heroSearchDrop');
  function openHeroSearch(){document.body.classList.add('hero-search-open');if(heroSearchInput)setTimeout(function(){heroSearchInput.focus();},50);}
  function closeHeroSearch(){document.body.classList.remove('hero-search-open');if(heroSearchInput)heroSearchInput.value='';if(heroSearchDrop){heroSearchDrop.innerHTML='';heroSearchDrop.classList.remove('visible');}}
  if(openSearch)openSearch.addEventListener('click',function(){openHeroSearch();});
  if(heroSearchClose)heroSearchClose.addEventListener('click',function(){closeHeroSearch();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('hero-search-open'))closeHeroSearch();});
  document.addEventListener('click',function(e){
    if(!document.body.classList.contains('hero-search-open'))return;
    var t=e.target;
    if(!t.closest('#heroSearchWrap')&&!t.closest('#heroSearchDrop')&&!t.closest('#openSearch'))closeHeroSearch();
  });
  function runSubdomainSearch(q){
    var ql=q.toLowerCase();var html='';var seen={};
    document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
      var name=card.getAttribute('data-name')||'';var pid=card.getAttribute('data-playerid')||'';var slug=card.getAttribute('data-slug')||'';
      if(name.includes(ql)&&pid&&!seen[pid]){
        seen[pid]=true;var nameEl=card.querySelector('.yat-name');var dn;
        if(nameEl){var spans=nameEl.querySelectorAll('span');if(spans.length>=2){dn=escHtml((spans[0].textContent||'').trim()+' '+(spans[1].textContent||'').trim());}else{dn=escHtml((nameEl.textContent||name).trim());}}else{dn=escHtml(name);}
        html+='<a href="/${resolvedHsid}/player/'+pid+(slug?'/'+slug:'')+'" class="yat-hero-result"><div class="yat-hero-result-name">'+dn+'</div></a>';
      }
    });
    if(!html)html='<div style="padding:12px 16px;opacity:.5;font-size:12px">No players found</div>';
    heroSearchDrop.innerHTML=html;heroSearchDrop.classList.add('visible');
  }
  function runGlobalSearch(q){
    heroSearchDrop.innerHTML='<div style="padding:12px 16px;opacity:.5;font-size:12px">Searching\u2026</div>';
    heroSearchDrop.classList.add('visible');
    fetch('/api/schools/search?q='+encodeURIComponent(q)+'&limit=10')
      .then(function(r){return r.json();})
      .then(function(d){
        var items=d.programs||[];var html='';
        items.forEach(function(p){
          var url=escHtml(p.microsite_url||'#');var name=escHtml(p.hsname||'');
          var loc=escHtml(p.hslocation||'');var rank=p.yatstats_national_rank?'#'+p.yatstats_national_rank:'';
          html+='<a href="'+url+'" class="yat-hero-result"><div><div class="yat-hero-result-name">'+name+'</div>'+(loc?'<div class="yat-hero-result-sub">'+loc+'</div>':'')+'</div>'+(rank?'<div class="yat-hero-result-rank">'+rank+'</div>':'')+'</a>';
        });
        if(!html)html='<div style="padding:12px 16px;opacity:.5;font-size:12px">No schools found</div>';
        heroSearchDrop.innerHTML=html;
      })
      .catch(function(){heroSearchDrop.innerHTML='<div style="padding:12px 16px;opacity:.5;font-size:12px">Search unavailable</div>';});
  }
  var heroTimer=null;
  if(heroSearchInput&&heroSearchDrop){
    heroSearchInput.addEventListener('input',function(){
      var q=this.value.trim();clearTimeout(heroTimer);
      if(q.length<2){heroSearchDrop.innerHTML='';heroSearchDrop.classList.remove('visible');return;}
      heroTimer=setTimeout(function(){HERO_SEARCH_SCOPE==='global'?runGlobalSearch(q):runSubdomainSearch(q);},220);
    });
    heroSearchInput.addEventListener('keydown',function(e){
      if(e.key==='Enter'){var q=heroSearchInput.value.trim();if(q.length>=2){clearTimeout(heroTimer);HERO_SEARCH_SCOPE==='global'?runGlobalSearch(q):runSubdomainSearch(q);}}
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
