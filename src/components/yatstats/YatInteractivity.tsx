// src/components/yatstats/YatInteractivity.tsx
// Inline client-side script: theme toggle, card flip, section navigation,
// drawer open/close, hero inline search, player drawer search, filter logic

import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import { GLOBAL_SEARCH_DEBOUNCE_MS, GLOBAL_SEARCH_LIMIT } from '@/lib/searchConfig';

interface YatInteractivityProps {
  resolvedHsid: string;
  firebaseConfigJSON: string;
}

export default function YatInteractivity({
  resolvedHsid,
  firebaseConfigJSON,
}: YatInteractivityProps) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
window.__firebase_config = ${firebaseConfigJSON};
(function(){
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  var ORG_NORM={
    'ARIZONA DIAMONDBACKS':'ARIZONA DIAMONDBACKS','ARI':'ARIZONA DIAMONDBACKS','AZ DIAMONDBACKS':'ARIZONA DIAMONDBACKS',
    'ATLANTA BRAVES':'ATLANTA BRAVES','ATL':'ATLANTA BRAVES',
    'BALTIMORE ORIOLES':'BALTIMORE ORIOLES','BAL':'BALTIMORE ORIOLES',
    'BOSTON RED SOX':'BOSTON RED SOX','BOS':'BOSTON RED SOX',
    'CHICAGO CUBS':'CHICAGO CUBS','CHC':'CHICAGO CUBS',
    'CHICAGO WHITE SOX':'CHICAGO WHITE SOX','CHA':'CHICAGO WHITE SOX','CHW':'CHICAGO WHITE SOX',
    'CINCINNATI REDS':'CINCINNATI REDS','CIN':'CINCINNATI REDS',
    'CLEVELAND GUARDIANS':'CLEVELAND GUARDIANS','CLE':'CLEVELAND GUARDIANS',
    'COLORADO ROCKIES':'COLORADO ROCKIES','COL':'COLORADO ROCKIES',
    'DETROIT TIGERS':'DETROIT TIGERS','DET':'DETROIT TIGERS',
    'HOUSTON ASTROS':'HOUSTON ASTROS','HOU':'HOUSTON ASTROS',
    'KANSAS CITY ROYALS':'KANSAS CITY ROYALS','KC':'KANSAS CITY ROYALS','KCR':'KANSAS CITY ROYALS',
    'LOS ANGELES ANGELS':'LOS ANGELES ANGELS','LAA':'LOS ANGELES ANGELS','LA ANGELS':'LOS ANGELES ANGELS',
    'LOS ANGELES DODGERS':'LOS ANGELES DODGERS','LAD':'LOS ANGELES DODGERS','LA DODGERS':'LOS ANGELES DODGERS',
    'MIAMI MARLINS':'MIAMI MARLINS','MIA':'MIAMI MARLINS',
    'MILWAUKEE BREWERS':'MILWAUKEE BREWERS','MIL':'MILWAUKEE BREWERS',
    'MINNESOTA TWINS':'MINNESOTA TWINS','MIN':'MINNESOTA TWINS',
    'NEW YORK METS':'NEW YORK METS','NYM':'NEW YORK METS','NY METS':'NEW YORK METS',
    'NEW YORK YANKEES':'NEW YORK YANKEES','NYY':'NEW YORK YANKEES','NY YANKEES':'NEW YORK YANKEES',
    'ATHLETICS':'ATHLETICS','OAKLAND ATHLETICS':'ATHLETICS','OAK':'ATHLETICS',
    'LAS VEGAS ATHLETICS':'ATHLETICS','SACRAMENTO ATHLETICS':'ATHLETICS',
    'PHILADELPHIA PHILLIES':'PHILADELPHIA PHILLIES','PHI':'PHILADELPHIA PHILLIES',
    'PITTSBURGH PIRATES':'PITTSBURGH PIRATES','PIT':'PITTSBURGH PIRATES',
    'SAN DIEGO PADRES':'SAN DIEGO PADRES','SD':'SAN DIEGO PADRES','SDP':'SAN DIEGO PADRES',
    'SAN FRANCISCO GIANTS':'SAN FRANCISCO GIANTS','SF':'SAN FRANCISCO GIANTS','SFG':'SAN FRANCISCO GIANTS',
    'SEATTLE MARINERS':'SEATTLE MARINERS','SEA':'SEATTLE MARINERS',
    'ST. LOUIS CARDINALS':'ST. LOUIS CARDINALS','STL':'ST. LOUIS CARDINALS','ST LOUIS CARDINALS':'ST. LOUIS CARDINALS',
    'TAMPA BAY RAYS':'TAMPA BAY RAYS','TB':'TAMPA BAY RAYS','TBR':'TAMPA BAY RAYS',
    'TEXAS RANGERS':'TEXAS RANGERS','TEX':'TEXAS RANGERS',
    'TORONTO BLUE JAYS':'TORONTO BLUE JAYS','TOR':'TORONTO BLUE JAYS',
    'WASHINGTON NATIONALS':'WASHINGTON NATIONALS','WSH':'WASHINGTON NATIONALS','WAS':'WASHINGTON NATIONALS',
    'ATLANTIC LEAGUE':'ATLANTIC LEAGUE','INDY':'INDY',
    'ACC':'ACC','ATLANTIC COAST CONFERENCE':'ACC','ATLANTIC COAST':'ACC',
    'BIG TEN':'BIG TEN','BIG TEN CONFERENCE':'BIG TEN','BIG 10':'BIG TEN','BIG 10 CONFERENCE':'BIG TEN','BIG10':'BIG TEN','B1G':'BIG TEN',
    'BIG 12':'BIG 12','BIG 12 CONFERENCE':'BIG 12','BIG12':'BIG 12',
    'BIG EAST':'BIG EAST','BIG EAST CONFERENCE':'BIG EAST',
    'BIG WEST':'BIG WEST','BIG WEST CONFERENCE':'BIG WEST',
    'BIG SOUTH':'BIG SOUTH','BIG SOUTH CONFERENCE':'BIG SOUTH',
    'PAC-12':'PAC-12','PAC 12':'PAC-12','PAC 12 CONFERENCE':'PAC-12','PAC12':'PAC-12','PAC-12 CONFERENCE':'PAC-12',
    'SEC':'SEC','SOUTHEASTERN CONFERENCE':'SEC',
    'AMERICAN':'AMERICAN','AMERICAN ATHLETIC CONFERENCE':'AMERICAN','AAC':'AMERICAN',
    'MOUNTAIN WEST':'MOUNTAIN WEST','MOUNTAIN WEST CONFERENCE':'MOUNTAIN WEST','MWC':'MOUNTAIN WEST',
    'MAC':'MAC','MID-AMERICAN CONFERENCE':'MAC','MID AMERICAN CONFERENCE':'MAC',
    'WCC':'WCC','WEST COAST CONFERENCE':'WCC',
    'WAC':'WAC','WESTERN ATHLETIC CONFERENCE':'WAC',
    'ATLANTIC SUN':'ATLANTIC SUN','ASUN':'ATLANTIC SUN','A-SUN':'ATLANTIC SUN',
    'C-USA':'C-USA','CONFERENCE USA':'C-USA','CUSA':'C-USA',
    'HORIZON':'HORIZON','HORIZON LEAGUE':'HORIZON',
    'IVY LEAGUE':'IVY LEAGUE','IVY':'IVY LEAGUE',
    'MAAC':'MAAC','METRO ATLANTIC ATHLETIC CONFERENCE':'MAAC',
    'MEAC':'MEAC','MID-EASTERN ATHLETIC CONFERENCE':'MEAC',
    'MISSOURI VALLEY':'MISSOURI VALLEY','MISSOURI VALLEY CONFERENCE':'MISSOURI VALLEY','MVC':'MISSOURI VALLEY',
    'NEC':'NEC','NORTHEAST CONFERENCE':'NEC',
    'OVC':'OVC','OHIO VALLEY CONFERENCE':'OVC',
    'PATRIOT':'PATRIOT','PATRIOT LEAGUE':'PATRIOT',
    'SOUTHERN':'SOUTHERN','SOUTHERN CONFERENCE':'SOUTHERN','SOCON':'SOUTHERN',
    'SOUTHLAND':'SOUTHLAND','SOUTHLAND CONFERENCE':'SOUTHLAND',
    'SUMMIT':'SUMMIT','SUMMIT LEAGUE':'SUMMIT',
    'SUN BELT':'SUN BELT','SUN BELT CONFERENCE':'SUN BELT',
    'SWAC':'SWAC','SOUTHWESTERN ATHLETIC CONFERENCE':'SWAC',
    'COLONIAL':'COLONIAL','COLONIAL ATHLETIC ASSOCIATION':'COLONIAL','CAA':'COLONIAL',
    'INDEPENDENT':'INDEPENDENT','NAIA':'NAIA','JUCO':'JUCO','JUNIOR COLLEGE':'JUCO',
    'ACCAC':'ACCAC',
    'RMAC':'RMAC','ROCKY MOUNTAIN ATHLETIC CONFERENCE':'RMAC',
    'GAC':'GAC','GREAT AMERICAN CONFERENCE':'GAC',
    'MIAA':'MIAA',
    'CONFERENCE CAROLINAS':'CONFERENCE CAROLINAS',
    'CONTINENTAL ATHLETIC CONFERENCE':'CONTINENTAL ATHLETIC CONFERENCE',
    'NACC':'NACC','NORTHERN ATHLETICS COLLEGIATE CONFERENCE':'NACC',
    'NORTHWEST CONFERENCE':'NORTHWEST CONFERENCE',
    'MIDWEST CONFERENCE':'MIDWEST CONFERENCE',
    'BIG 8 - CCCAA':'BIG 8 - CCCAA','BIG 8':'BIG 8 - CCCAA'
  };
  function normalizeOrg(raw){var k=(raw||'').trim().toUpperCase();return ORG_NORM[k]||k;}
  window.__YAT_HSID='${resolvedHsid}';

    function yatOpenLeftDrawer(){
    document.body.classList.add('drawer-left-open', 'drawer-open');
    document.body.classList.remove('drawer-right-open', 'drawer-account-open');
  }

  function yatOpenRightDrawer(){
    document.body.classList.toggle('drawer-right-open');
    document.body.classList.toggle('drawer-open');
    document.body.classList.remove('drawer-left-open', 'drawer-account-open');
  }

  function yatOpenAccountDrawer(){
    document.body.classList.toggle('drawer-account-open');
    document.body.classList.toggle('drawer-open');
    document.body.classList.remove('drawer-left-open', 'drawer-right-open');
  }

  function yatCloseDrawers(){
    document.body.classList.remove(
      'drawer-left-open',
      'drawer-right-open',
      'drawer-account-open',
      'drawer-open'
    );
  }

  function yatToggleTheme(){
    var isLight=document.body.classList.toggle('light-theme');
    localStorage.setItem('yat-theme',isLight?'light':'dark');

    var btn=document.getElementById('theme-toggle');
    if(btn){
      var ic=btn.querySelector('i');
      if(ic)ic.className=isLight?'ri-moon-line':'ri-sun-line';
    }
  }

  function yatOpenGlobalSearch(){
    var gsModal=document.getElementById('gsModal');
    var gsInput=document.getElementById('gsInput');

    if(!gsModal)return;

    gsModal.classList.add('open');
    document.body.classList.add('drawer-open');

    if(gsInput){
      setTimeout(function(){
        gsInput.focus();
      },60);
    }
  }

  function yatCloseGlobalSearch(){
    var gsModal=document.getElementById('gsModal');
    var gsInput=document.getElementById('gsInput');
    var gsResults=document.getElementById('gsResults');

    if(!gsModal)return;

    gsModal.classList.remove('open');
    document.body.classList.remove('drawer-open');

    if(gsInput)gsInput.value='';
    if(gsResults)gsResults.innerHTML='';
  }

  var yatFlipAllActive=false;

  function getVisibleGallerySection(){
    var activeSection=document.getElementById('sec-active');
    var allTimeSection=document.getElementById('sec-alltime');

    if(activeSection&&activeSection.classList.contains('visible'))return activeSection;
    if(allTimeSection&&allTimeSection.classList.contains('visible'))return allTimeSection;

    return null;
  }

  function getVisibleGalleryCards(){
    var visibleSection=getVisibleGallerySection();
    if(!visibleSection)return [];

    return Array.from(visibleSection.querySelectorAll('.yat-card[data-playerid]')).filter(function(card){
      var wrap=card.closest('[data-player-card-wrap="true"]');
      if(wrap&&wrap.style.display==='none')return false;
      return card.style.display!=='none';
    });
  }

  function syncFlipAllButton(){
    var btn=document.getElementById('flipAllCards');
    if(!btn)return;

    btn.setAttribute('aria-pressed',String(yatFlipAllActive));
    btn.setAttribute(
      'aria-label',
      yatFlipAllActive?'Flip all cards to front':'Flip all cards to stats'
    );
    btn.setAttribute('title',yatFlipAllActive?'Flip all cards to front':'Flip all cards to stats');

    var label=btn.querySelector('[data-flip-all-label]');
    if(label){
      label.textContent=yatFlipAllActive?'SHOW FRONT':'FLIP ALL';
    }

    var icon=btn.querySelector('i');
    if(icon){
      icon.className=yatFlipAllActive?'ri-arrow-go-back-line':'ri-loop-right-line';
    }
  }

  function syncFlipAllVisibleCards(){
    if(yatFlipAllActive){
      getVisibleGalleryCards().forEach(function(card){
        card.classList.add('is-flipped');
      });
    }

    syncFlipAllButton();
  }

  function setVisibleGalleryCardsFlipped(shouldFlip){
    getVisibleGalleryCards().forEach(function(card){
      card.classList.toggle('is-flipped',shouldFlip);
    });
  }

 document.addEventListener('click',function(e){
    var acctTab=e.target.closest('#acctTabJoin, #acctTabLogin');
    if(acctTab){
      e.preventDefault();
      e.stopPropagation();
      var acctTabName=acctTab.getAttribute('data-tab');
      if(acctTabName){
        window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:acctTabName}));
      }
      return;
    }

    var flipAllBtn=e.target.closest('#flipAllCards');
    if(flipAllBtn){
      e.preventDefault();
      e.stopPropagation();
      yatFlipAllActive=!yatFlipAllActive;
      setVisibleGalleryCardsFlipped(yatFlipAllActive);
      syncFlipAllButton();
      return;
    }

    var themeBtn=e.target.closest('#theme-toggle');
    if(themeBtn){
      e.preventDefault();
      yatToggleTheme();
      return;
    }

    var menuBtn=e.target.closest('#btnMenu, #openMenu');
    if(menuBtn){
      e.preventDefault();
      yatOpenLeftDrawer();
      return;
    }

    var filterBtn=e.target.closest('#openFilters');
    if(filterBtn){
      e.preventDefault();
      yatOpenRightDrawer();
      return;
    }

    var accountBtn=e.target.closest('#btnAccount');
    if(accountBtn){
      e.preventDefault();
      yatOpenAccountDrawer();
      return;
    }

    var searchBtn=e.target.closest('#openSearch');
    if(searchBtn){
      e.preventDefault();
      yatOpenGlobalSearch();
      return;
    }

        var closeBtn=e.target.closest('#closeLeft, #closeFilters, #closeAccount, #drawerMask');
    if(closeBtn){
      e.preventDefault();
      yatCloseDrawers();
      return;
    }

    var resetBtn=e.target.closest('#filtersReset, #filtersReset2');
    if(resetBtn){
      e.preventDefault();
      resetFiltersForCurrentSection();
      return;
    }
  });

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      yatCloseDrawers();
      yatCloseGlobalSearch();
    }
  });

  function yatSafeApplyFilters(){
    try{
      if(typeof resetFiltersForCurrentSection==='function'){
        resetFiltersForCurrentSection();
      }else if(typeof applyFilters==='function'){
        applyFilters();
      }
    }catch(err){
      console.error('YAT applyFilters failed',err);
    }
  }

 document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      yatSafeApplyFilters();
    },0);
  });

  window.addEventListener('load',function(){
    setTimeout(function(){
      yatSafeApplyFilters();
    },0);
  });
  
  var favLink=document.querySelector('link[rel="icon"][type="image/png"]');
  if(favLink){
    var favImg=new Image();
    favImg.onerror=function(){
      var placeholder='/img/yatstats-logo-circle.png';
      favLink.href=placeholder;
      var appleLink=document.querySelector('link[rel="apple-touch-icon"]');
      if(appleLink)appleLink.href=placeholder;
    };
    favImg.src=favLink.href;
  }

  function loadBgImages(scope){
    var container=scope||document;
    container.querySelectorAll('.yat-bg[data-src]').forEach(function(el){
      if(el.getAttribute('data-bg-loaded'))return;
      el.setAttribute('data-bg-loaded','1');
      var src=el.getAttribute('data-src');
      var placeholder=el.getAttribute('data-placeholder');
      var img=new Image();
      img.onload=function(){el.style.backgroundImage="url('"+src+"')";};
      img.onerror=function(){
        var altsrc=null;
        if(src&&src.endsWith('.jpg'))altsrc=src.slice(0,-4)+'.png';
        else if(src&&src.endsWith('.png'))altsrc=src.slice(0,-4)+'.jpg';
        if(altsrc){
          var altimg=new Image();
          altimg.onload=function(){el.style.backgroundImage="url('"+altsrc+"')";};
          altimg.onerror=function(){
            if(placeholder){
              el.style.backgroundImage="url('"+placeholder+"')";
              el.style.backgroundSize='contain';
              el.style.backgroundPosition='center bottom';
              el.style.backgroundColor='#1a1a1a';
            }
          };
          altimg.src=altsrc;
        }else if(placeholder){
          el.style.backgroundImage="url('"+placeholder+"')";
          el.style.backgroundSize='contain';
          el.style.backgroundPosition='center bottom';
          el.style.backgroundColor='#1a1a1a';
        }
      };
      img.src=src;
    });
  }

  if(!document.querySelector('.yat-section')){
    loadBgImages(undefined);
  }

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
    if(saved==='light'){
      var ic=btn.querySelector('i');
      if(ic)ic.className='ri-moon-line';
    }
  }

  document.addEventListener('click',function(e){
    var card=e.target.closest('.yat-card');
    if(!card)return;
    if(e.target.closest('a')||e.target.closest('button'))return;
    card.classList.toggle('is-flipped');
  });

  document.addEventListener('click',function(e){
    var slot=e.target.closest('.gallery-slot-link[data-playerid]');
    if(!slot)return;
    var pid=slot.dataset.playerid;
    if(!pid)return;
    e.preventDefault();
    
    var secActive=document.getElementById('sec-active');
    var secAlltime=document.getElementById('sec-alltime');
    var secNews=document.getElementById('sec-news');
    
    if(secNews && secNews.classList.contains('visible')){
      // NEWS PAGE BEHAVIOR: Filter by player
      if(newsFilterName){
        var pName = (slot.querySelector('.gallery-slot-name')?.textContent || '').toLowerCase().trim();
        // If already filtered by this name, reset filter
        if(newsFilterName.value.toLowerCase().trim() === pName) {
          newsFilterName.value = '';
        } else {
          newsFilterName.value = pName;
        }
        applyNewsFilters();
      }
      return;
    }

    var visibleSection=(secAlltime&&secAlltime.classList.contains('visible'))
      ? secAlltime
      : (secActive&&secActive.classList.contains('visible'))
        ? secActive
        : null;
    if(!visibleSection)return;
    var target=visibleSection.querySelector('#player-'+pid);
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  });

  function normalizeTab(tabId){
    if(tabId==='team')return 'current';
    return tabId;
  }

  var _activeSection=null;
  var _stripOriginalOrder=null;
  
  function syncStripImagesToSection(key){
    var useThenImages = key === 'alltime';
  
    document.querySelectorAll('.gallery-slot-link[data-playerid] .gallery-slot-img').forEach(function(img){
      var nextSrc = useThenImages
        ? img.getAttribute('data-then-src')
        : img.getAttribute('data-now-src');
  
      if(!nextSrc)return;
  
      img.dataset.fallbackApplied = '';
      if(img.getAttribute('src') !== nextSrc){
        img.setAttribute('src', nextSrc);
      }
    });
  }

 function syncStripToSection(key){
    syncStripImagesToSection(key);

    var stripInner=document.querySelector('.gallery-strip-inner');
    if(!stripInner)return;

    var allSlots=Array.from(stripInner.querySelectorAll('.gallery-slot-link[data-playerid]'));
    if(!allSlots.length)return;

    if(!_stripOriginalOrder){
      _stripOriginalOrder=allSlots.map(function(s){return s.getAttribute('data-playerid');});
    }

    if(key==='active'||key==='news'){
      if(_stripOriginalOrder){
        var origMap={};
        allSlots.forEach(function(s){origMap[s.getAttribute('data-playerid')]=s;});
        _stripOriginalOrder.forEach(function(pid){
          var slot=origMap[pid];
          if(slot)stripInner.appendChild(slot);
        });
      }
    }else if(key==='alltime'){
      var allTimeSection=document.getElementById('sec-alltime');
      if(!allTimeSection){allSlots.forEach(function(s){s.style.display='none';});return;}
      var allTimeCards=Array.from(allTimeSection.querySelectorAll('.yat-card[data-playerid]'));
      var allTimeOrder=allTimeCards.map(function(c){return c.getAttribute('data-playerid');});

      var slotMap={};
      allSlots.forEach(function(slot){slotMap[slot.getAttribute('data-playerid')]=slot;});

      allTimeOrder.forEach(function(pid){
        var slot=slotMap[pid];
        if(slot){
          slot.style.display='';
          stripInner.appendChild(slot);
        }
      });

      allSlots.forEach(function(slot){
        var pid=slot.getAttribute('data-playerid');
        if(allTimeOrder.indexOf(pid)===-1)slot.style.display='none';
      });
    }else{
      allSlots.forEach(function(slot){slot.style.display='none';});
    }
  }

function syncStripToVisibleCards() {
  var stripInner = document.querySelector('.gallery-strip-inner');
  if (!stripInner) return;

  var activeSection = document.getElementById('sec-active');
  var allTimeSection = document.getElementById('sec-alltime');

  var visibleSection =
    activeSection && activeSection.classList.contains('visible')
      ? activeSection
      : allTimeSection && allTimeSection.classList.contains('visible')
        ? allTimeSection
        : null;

  if (!visibleSection) return;

  var visibleCards = Array.from(
    visibleSection.querySelectorAll('.yat-card[data-playerid]')
  ).filter(function(card) {
    var wrap = card.closest('[data-player-card-wrap="true"]');
    if (wrap && wrap.style.display === 'none') return false;
    return card.style.display !== 'none';
  });

  var visibleIds = visibleCards.map(function(card) {
    return card.getAttribute('data-playerid');
  });

  var slots = Array.from(
    stripInner.querySelectorAll('.gallery-slot-link[data-playerid]')
  );

  var slotMap = {};
  slots.forEach(function(slot) {
    slotMap[slot.getAttribute('data-playerid')] = slot;
  });

  visibleIds.forEach(function(pid) {
    var slot = slotMap[pid];
    if (slot) {
      slot.style.display = '';
      stripInner.appendChild(slot);
    }
  });

  slots.forEach(function(slot) {
    var pid = slot.getAttribute('data-playerid');
    slot.style.display = visibleIds.indexOf(pid) === -1 ? 'none' : '';
  });
}

  function showSection(tabId, updateHash){
    var key=normalizeTab(tabId);
    var isSectionChange=(_activeSection!==key);
    _activeSection=key;

    document.querySelectorAll('.yat-section').forEach(function(s){
      s.classList.remove('visible');
    });

    var sec=document.getElementById('sec-'+key);
    if(sec)sec.classList.add('visible');

    if(isSectionChange){
      resetFiltersForCurrentSection();
      if(sec)loadBgImages(sec);
      if(key==='news')loadNews();
    }

    var isPlayerProfilePage=window.location.pathname.indexOf('/player/')!==-1;
    var sectionLabel=document.getElementById('yatSectionLabel');
    if(sectionLabel&&!isPlayerProfilePage){
      var labels={
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
      var label=labels[key]||key.toUpperCase();
      sectionLabel.textContent=label;
    }

    if(updateHash){
      history.replaceState(null,'','#sec-'+key);
      window.scrollTo({top:0,behavior:'auto'});
    }

    syncStripToSection(key);
    syncFlipAllVisibleCards();
  }

  document.addEventListener('click',function(e){
    var pair=e.target.closest('[data-tab]');
    if(!pair)return;
    if(pair.closest('#drawerAccount'))return;
    var tab=pair.dataset.tab;
    if(!tab)return;
    e.preventDefault();
    showSection(tab,true);
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });

  (function initSectionFromHash(){
    var hash=window.location.hash||'';
    var tab='';
    if(hash.indexOf('#sec-')===0){
      tab=hash.replace('#sec-','');
    }
    if(!tab)tab='active';
    showSection(tab,false);
  })();

  window.addEventListener('hashchange',function(){
    var hash=window.location.hash||'';
    if(hash.indexOf('#sec-')!==0)return;
    var tab=hash.replace('#sec-','');
    showSection(tab,false);
  });

  var btnMenu=document.getElementById('btnMenu')||document.getElementById('openMenu');
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

  var openFilters=document.getElementById('openFilters');
  var closeFilters=document.getElementById('closeFilters');
  var filtersReset=document.getElementById('filtersReset');
  var filtersReset2=document.getElementById('filtersReset2');
  if(openFilters)openFilters.addEventListener('click',function(){
    document.body.classList.toggle('drawer-right-open');
    document.body.classList.toggle('drawer-open');
    document.body.classList.remove('drawer-left-open','drawer-account-open');
  });
  if(closeFilters)closeFilters.addEventListener('click',function(){
    document.body.classList.remove('drawer-right-open','drawer-open');
  });

  var btnAccount=document.getElementById('btnAccount');
  var closeAccount=document.getElementById('closeAccount');
  if(btnAccount)btnAccount.addEventListener('click',function(){
    document.body.classList.toggle('drawer-account-open');
    document.body.classList.toggle('drawer-open');
    document.body.classList.remove('drawer-left-open','drawer-right-open');
  });
  if(closeAccount)closeAccount.addEventListener('click',function(){
    document.body.classList.remove('drawer-account-open','drawer-open');
  });

  var acctTabJoin=document.getElementById('acctTabJoin');
  var acctTabLogin=document.getElementById('acctTabLogin');
  function dispatchAcctTab(tab){
    window.dispatchEvent(new CustomEvent('yat:acct-tab',{detail:tab}));
    if(acctTabJoin)acctTabJoin.style.borderBottom=tab==='register'?'2px solid var(--gold)':'2px solid transparent';
    if(acctTabJoin)acctTabJoin.style.color=tab==='register'?'var(--gold)':'var(--fg)';
    if(acctTabLogin)acctTabLogin.style.borderBottom=tab==='signin'?'2px solid var(--gold)':'2px solid transparent';
    if(acctTabLogin)acctTabLogin.style.color=tab==='signin'?'var(--gold)':'var(--muted)';
  }
  if(acctTabJoin)acctTabJoin.addEventListener('click',function(){dispatchAcctTab('register');});
  if(acctTabLogin)acctTabLogin.addEventListener('click',function(){dispatchAcctTab('signin');});
  dispatchAcctTab('register');

  var S3_BASE='https://yatstats-assets.s3.us-west-2.amazonaws.com';
  var CREST_FALLBACK='${CREST_FALLBACK_PATH}';
  var STAT_EMPTY='\\u2014';
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

  function refreshGlobalSearchEls(){
    gsModal=document.getElementById('gsModal');
    gsOverlay=document.getElementById('gsOverlay');
    gsClose=document.getElementById('gsClose');
    gsInput=document.getElementById('gsInput');
    gsResults=document.getElementById('gsResults');
  }

  function openGsModal(){
    refreshGlobalSearchEls();
    if(!gsModal)return;
    gsModal.classList.add('open');
    document.body.classList.add('drawer-open');
    if(gsInput)setTimeout(function(){gsInput.focus();},60);
  }

  function closeGsModal(){
    refreshGlobalSearchEls();
    if(!gsModal)return;
    gsModal.classList.remove('open');
    document.body.classList.remove('drawer-open');
    if(gsInput)gsInput.value='';
    if(gsResults)gsResults.innerHTML='';
  }

  function wireGlobalSearch(){
    refreshGlobalSearchEls();

    var openSearch=document.getElementById('openSearch');

    if(openSearch&&!openSearch.dataset.yatGsWired){
      openSearch.dataset.yatGsWired='1';
      openSearch.addEventListener('click',function(e){
        e.preventDefault();
        openGsModal();
      });
    }

    if(gsOverlay&&!gsOverlay.dataset.yatGsWired){
      gsOverlay.dataset.yatGsWired='1';
      gsOverlay.addEventListener('click',function(e){
        e.preventDefault();
        closeGsModal();
      });
    }

    if(gsClose&&!gsClose.dataset.yatGsWired){
      gsClose.dataset.yatGsWired='1';
      gsClose.addEventListener('click',function(e){
        e.preventDefault();
        closeGsModal();
      });
    }

    if(gsInput&&gsResults&&!gsInput.dataset.yatGsWired){
      gsInput.dataset.yatGsWired='1';
      gsInput.addEventListener('input',function(){
        var q=this.value.trim();
        clearTimeout(gsTimer);
        if(q.length<2){
          gsResults.innerHTML='';
          return;
        }
        gsTimer=setTimeout(function(){runGlobalSearch(q);},GS_DEBOUNCE_MS);
      });
      gsInput.addEventListener('keydown',function(e){
        if(e.key==='Enter'){
          var q=gsInput.value.trim();
          if(q.length>=2){
            clearTimeout(gsTimer);
            runGlobalSearch(q);
          }
        }
      });
    }
  }

  wireGlobalSearch();
  document.addEventListener('DOMContentLoaded',wireGlobalSearch);

  document.addEventListener('keydown',function(e){
    refreshGlobalSearchEls();
    if(e.key==='Escape'&&gsModal&&gsModal.classList.contains('open')){closeGsModal();return;}
    if(!gsModal||!gsModal.classList.contains('open'))return;
    if(!gsResults)return;
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

function normalizeSchoolResult(p){
  var hasAlumni=p.current_aa&&p.current_aa>0;
  var status=p.microsite_url&&p.microsite_url.length>0?'live':(hasAlumni?'potential':'inactive');
  var dest;

  if(status==='live' && p.microsite_url && p.microsite_url.length>0){
    dest=p.microsite_url;
  }else if(p.hsid){
    var stateParams=new URLSearchParams();
    stateParams.set('schoolState',status);
    dest='/' + encodeURIComponent(String(p.hsid)) + '?' + stateParams.toString();
  }else{
    var sp=new URLSearchParams();
    if(p.hsname)sp.set('school',p.hsname);
    if(p.hslocation){
      var locParts=p.hslocation.split(',');
      if(locParts[0])sp.set('city',locParts[0].trim());
      if(locParts[1])sp.set('state',locParts[1].trim());
    }
    sp.set('reason',status);
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

  function renderSchoolResult(r){
    var statusLabel=r.status==='live'?'Live':(r.status==='potential'?'Candidate':'Not Active');
    var statusCls='yat-gs-status yat-gs-status-'+r.status;
    var el=document.createElement('a');
    el.className='yat-gs-result';
    el.setAttribute('data-status',r.status);
    el.setAttribute('href',r.dest);
    el.setAttribute('role','option');
    el.setAttribute('tabindex','0');

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
    var micrositeBase=p.micrositeUrl||'';

    var href='';
    if(playerId){
      if(micrositeBase){
        href=micrositeBase.replace(/\\/$/,'')+'/player/'+playerId+'/'+slug;
      }else if(schoolId){
        href='/' + schoolId + '/player/' + playerId + '/' + slug;
      }
    }

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
    if(loc)subtitle+=(subtitle?' â€” ':'')+loc;
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
    var groups={},order=[];
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
    return fetch('/api/schools/search?q='+encodeURIComponent(q)+'&limit='+GS_RESULT_LIMIT)
      .then(function(r){return r.json();})
      .then(function(d){return (d.programs||[]).map(normalizeSchoolResult);})
      .catch(function(err){gsHadError=true;console.warn('School search failed',err);return [];});
  }

  function fetchPlayerResults(q){
    return fetch('/api/players/search?q='+encodeURIComponent(q)+'&limit='+GS_RESULT_LIMIT)
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
      var msg=hadError?'Search unavailable. Please try again.':'No results found matching \\u201c'+escHtml(q)+'\\u201d';
      gsResults.innerHTML='<div class="yat-gs-msg">'+msg+'</div>';
      return;
    }
    gsResults.appendChild(frag);
  }

  function runGlobalSearch(q){
    refreshGlobalSearchEls();
    if(!gsResults)return;
    gsHadError=false;
    var token=++gsQueryToken;
    gsResults.innerHTML='<div class="yat-gs-msg">Searching\\u2026</div>';
    Promise.all([fetchPlayerResults(q),fetchSchoolResults(q)]).then(function(res){
      if(token!==gsQueryToken)return;
      var players=res[0],schools=res[1];
      renderCombinedResults(players||[],schools||[],q,gsHadError);
    }).catch(function(){
      if(token!==gsQueryToken)return;
      renderCombinedResults([],[],q,true);
    });
  }

  function handleGlobalSearchQuery(q){
    refreshGlobalSearchEls();
    if(!gsResults)return;
    q=String(q||'').trim();
    clearTimeout(gsTimer);
    if(q.length<2){
      gsResults.innerHTML='';
      return;
    }
    gsTimer=setTimeout(function(){runGlobalSearch(q);},GS_DEBOUNCE_MS);
  }

  // Delegated listener: keeps Global Search live even if the modal/input is
  // rendered after this script first runs or is replaced during navigation.
  if(!document.documentElement.dataset.yatGsDelegated){
    document.documentElement.dataset.yatGsDelegated='1';
    document.addEventListener('input',function(e){
      var input=e.target&&e.target.closest?e.target.closest('#gsInput'):null;
      if(!input)return;
      handleGlobalSearchQuery(input.value);
    });
    document.addEventListener('keydown',function(e){
      var input=e.target&&e.target.closest?e.target.closest('#gsInput'):null;
      if(!input||e.key!=='Enter')return;
      var q=input.value.trim();
      if(q.length>=2){
        clearTimeout(gsTimer);
        runGlobalSearch(q);
      }
    });
  }

  wireGlobalSearch();

  var searchInput=document.getElementById('playerSearch');
  var liveResults=document.getElementById('liveResults');
  var liveSearchTimer=null;
  var liveSearchToken=0;

  function renderInlineGlobalResults(players,schools,q){
    if(!liveResults)return;
    liveResults.innerHTML='';

    var hasPlayers=players&&players.length>0;
    var hasSchools=schools&&schools.length>0;

    if(!hasPlayers&&!hasSchools){
      liveResults.innerHTML=q.length>=2
        ? '<div style="padding:10px;opacity:.5;font-size:12px">No results</div>'
        : '';
      return;
    }

    var frag=document.createDocumentFragment();

    if(hasPlayers){
      var playerLabel=document.createElement('div');
      playerLabel.style.cssText='padding:8px 12px;font:400 11px Bebas Neue,sans-serif;letter-spacing:.08em;opacity:.7;border-bottom:1px solid var(--line)';
      playerLabel.textContent='PLAYERS';
      frag.appendChild(playerLabel);

      players.forEach(function(p){
        var row=renderPlayerResult(p);
        row.className='yat-live-hit yat-gs-result yat-gs-player';
        row.style.display='block';
        row.style.textDecoration='none';
        row.style.color='inherit';
        row.style.padding='8px 12px';
        row.style.cursor='pointer';
        row.style.borderBottom='1px solid var(--line)';
        frag.appendChild(row);
      });
    }

    if(hasSchools){
      var schoolLabel=document.createElement('div');
      schoolLabel.style.cssText='padding:8px 12px;font:400 11px Bebas Neue,sans-serif;letter-spacing:.08em;opacity:.7;border-bottom:1px solid var(--line)';
      schoolLabel.textContent='SCHOOLS';
      frag.appendChild(schoolLabel);

      schools.forEach(function(s){
        var row=renderSchoolResult(s);
        row.className='yat-live-hit yat-gs-result';
        row.style.display='block';
        row.style.textDecoration='none';
        row.style.color='inherit';
        row.style.padding='8px 12px';
        row.style.cursor='pointer';
        row.style.borderBottom='1px solid var(--line)';
        frag.appendChild(row);
      });
    }

    liveResults.appendChild(frag);
  }

  if(searchInput&&liveResults){
    searchInput.addEventListener('input',function(){
      var q=this.value.trim();
      clearTimeout(liveSearchTimer);

      if(q.length<2){
        liveResults.innerHTML='';
        return;
      }

      liveSearchTimer=setTimeout(function(){
        var token=++liveSearchToken;
        liveResults.innerHTML='<div style="padding:10px;opacity:.5;font-size:12px">Searching...</div>';

        Promise.all([fetchPlayerResults(q),fetchSchoolResults(q)])
          .then(function(res){
            if(token!==liveSearchToken)return;
            renderInlineGlobalResults(res[0]||[],res[1]||[],q);
          })
          .catch(function(){
            if(token!==liveSearchToken)return;
            liveResults.innerHTML='<div style="padding:10px;opacity:.5;font-size:12px">Search unavailable</div>';
          });
      },GS_DEBOUNCE_MS);
    });
  }
function getFilterBoxes(groupId) {
  var group = document.getElementById(groupId);
  if (!group) return [];
  return Array.from(
    group.querySelectorAll('input[type="checkbox"]:not([data-select-all])')
  );
}

function getFilterSelectAll(groupId) {
  var group = document.getElementById(groupId);
  if (!group) return null;
  return group.querySelector('input[type="checkbox"][data-select-all]');
}

function setFilterGroup(groupId, checkedValues) {
  var wanted = (checkedValues || []).map(function(v) {
    return String(v || '').toUpperCase().trim();
  });

  getFilterBoxes(groupId).forEach(function(box) {
    var val = String(box.value || '').toUpperCase().trim();
    box.checked = wanted.indexOf(val) !== -1;
  });

  syncSelectAllForGroup(groupId);
}

function setAllInFilterGroup(groupId, checked) {
  getFilterBoxes(groupId).forEach(function(box) {
    box.checked = checked;
  });

  var selectAll = getFilterSelectAll(groupId);
  if (selectAll) selectAll.checked = checked;
}

function syncSelectAllForGroup(groupId) {
  var boxes = getFilterBoxes(groupId);
  var selectAll = getFilterSelectAll(groupId);

  if (!selectAll) return;

  selectAll.checked =
    boxes.length > 0 &&
    boxes.every(function(box) {
      return box.checked;
    });
}

function syncAllSelectAllBoxes() {
  [
    'filterStatus',
    'filterLevels',
    'filterOrgs',
    'filterGradClass',
    'filterRosterYears'
  ].forEach(syncSelectAllForGroup);
}
  function applyFilters(){
    var activeSection=document.getElementById('sec-active');
    var allTimeSection=document.getElementById('sec-alltime');
    var newsSection=document.getElementById('sec-news');

    var isActivePage=activeSection&&activeSection.classList.contains('visible');
    var isAllTimePage=allTimeSection&&allTimeSection.classList.contains('visible');
    var isNewsPage=newsSection&&newsSection.classList.contains('visible');

    var nf=((document.getElementById('filterName')||{}).value||'').toLowerCase().trim();

    var lc=Array.from(document.querySelectorAll('#filterLevels input:checked:not([data-select-all])')).map(function(i){return i.value;});
    var oc=Array.from(document.querySelectorAll('#filterOrgs input:checked:not([data-select-all])')).map(function(i){return i.value;});
    var gc=Array.from(document.querySelectorAll('#filterGradClass input:checked:not([data-select-all])')).map(function(i){return i.value;});
    var rc=Array.from(document.querySelectorAll('#filterRosterYears input:checked:not([data-select-all])')).map(function(i){return i.value;});
    var sc=Array.from(document.querySelectorAll('#filterStatus input:checked:not([data-select-all])')).map(function(i){return i.value;});

    var visibleSection=isActivePage ? activeSection
      : isAllTimePage ? allTimeSection
      : isNewsPage ? newsSection
      : null;

    var cardScope=visibleSection
      ? visibleSection.querySelectorAll('.yat-card[data-name]')
      : document.querySelectorAll('.yat-card[data-name]');

    if(isActivePage){
      document.querySelectorAll('.gallery-slot-link[data-playerid]').forEach(function(slot){
        slot.style.display='';
      });
    }else if(isAllTimePage){
      document.querySelectorAll('.gallery-slot-link[data-playerid]').forEach(function(slot){
        slot.style.display='';
      });
    }

    cardScope.forEach(function(card){
      var name=(card.getAttribute('data-name')||'').toLowerCase();
      var level=card.getAttribute('data-level')||'';
      var org=normalizeOrg(card.getAttribute('data-org')||'');
      var g=card.getAttribute('data-gradclass')||'';
      var rosterYears=(card.getAttribute('data-rosteryears')||'').split(',').filter(Boolean);
      var status=String(card.getAttribute('data-status')||'').trim().toUpperCase();

      var show=true;

      if(nf&&!name.includes(nf))show=false;
      if(lc.length&&!lc.includes(level))show=false;
      if(oc.length&&!oc.map(function(v){return normalizeOrg(v);}).includes(org))show=false;
      if(gc.length&&!gc.includes(g))show=false;
      if(rc.length&&!rosterYears.some(function(y){return rc.includes(y);} ))show=false;
      if(sc.length&&!sc.map(function(v){return v.toUpperCase();}).includes(status))show=false;

  var displayTarget=card.closest('[data-player-card-wrap="true"]')||card;
  displayTarget.style.display=show?'':'none';
});

try {
  if (typeof syncStripToVisibleCards === 'function') {
    syncStripToVisibleCards();
  }
} catch (err) {
  console.error('YAT strip sync failed', err);
}

try {
  syncFlipAllVisibleCards();
} catch (err) {
  console.error('YAT flip-all sync failed', err);
}
  }

  document.addEventListener('change', function(e){
    if(!e.target.closest('#filters')) return;

    var selectAll =
      e.target.hasAttribute('data-select-all') ||
      e.target.classList.contains('select-all');

    if(selectAll){
      var group=e.target.closest('.yat-filter-options');
      if(group){
        group.querySelectorAll('input[type="checkbox"]:not([data-select-all]):not(.select-all)').forEach(function(i){
          i.checked=e.target.checked;
        });
      }
    }else if(e.target.type==='checkbox'){
      var group=e.target.closest('.yat-filter-options');
      if(group){
        var sa=group.querySelector('input[data-select-all], input.select-all');
        var boxes=Array.from(group.querySelectorAll('input[type="checkbox"]:not([data-select-all]):not(.select-all)'));
        if(sa){
          sa.checked=boxes.length>0 && boxes.every(function(i){return i.checked;});
        }
      }
    }

    applyFilters();
  });

  var filterNameInput=document.getElementById('filterName');
  if(filterNameInput){
    filterNameInput.addEventListener('input', applyFilters);
  }

function resetFiltersForCurrentSection(){
    document.querySelectorAll('#filters input').forEach(function(i){
      if(i.type==='checkbox')i.checked=false;
      else i.value='';
    });

    var activeSection=document.getElementById('sec-active');
    var newsSection=document.getElementById('sec-news');
    var allTimeSection=document.getElementById('sec-alltime');

    var isActivePage=activeSection&&activeSection.classList.contains('visible');
    var isNewsPage=newsSection&&newsSection.classList.contains('visible');
    var isAllTimePage=allTimeSection&&allTimeSection.classList.contains('visible');

    if(isActivePage||isNewsPage){
      document.querySelectorAll('#filterStatus input[type="checkbox"]:not([data-select-all])').forEach(function(i){
        var statusValue=String(i.value||'').toUpperCase().trim();
        i.checked=statusValue!==''&&statusValue!=='RETIRED';
      });
    }

    if(isAllTimePage){
      document.querySelectorAll('#filterStatus input[type="checkbox"]:not([data-select-all])').forEach(function(i){
        i.checked=true;
      });
    }

    document.querySelectorAll('#filters input[data-select-all]').forEach(function(sa){
      var groupId=sa.getAttribute('data-select-all');
      var group=groupId?document.getElementById(groupId):null;
      if(!group)return;

      var boxes=Array.from(group.querySelectorAll('input[type="checkbox"]:not([data-select-all])'));
      sa.checked=boxes.length>0&&boxes.every(function(box){return box.checked;});
    });

    applyFilters();
  }

  if(filtersReset)filtersReset.addEventListener('click',resetFiltersForCurrentSection);
  if(filtersReset2)filtersReset2.addEventListener('click',resetFiltersForCurrentSection);

  document.querySelectorAll('.yat-fun-zone').forEach(function(fz){
    fz.setAttribute('data-stats-html',fz.innerHTML);
  });

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

  var articleOverlay=document.getElementById('articleOverlay');
  var articleModal=document.getElementById('articleModal');
  var articleModalClose=document.getElementById('articleModalClose');
  var articleModalImg=document.getElementById('articleModalImg');
  var articleModalBody=document.getElementById('articleModalBody');
  var currentArticleUrl='';

  function openArticleModal(post){
    if(!articleModal||!articleModalBody||!articleModalImg)return;
    currentArticleUrl=post.url||'';

    articleModalImg.innerHTML='';
    if(post.imageUrl){
      var mi=document.createElement('img');
      mi.className='yat-article-modal-img';
      mi.src=post.imageUrl;
      mi.alt='';
      mi.loading='lazy';
      mi.onerror=function(){
        articleModalImg.innerHTML='<div class="yat-article-modal-img-ph">\\u26BE</div>';
      };
      articleModalImg.appendChild(mi);
    }else{
      articleModalImg.innerHTML='<div class="yat-article-modal-img-ph">\\u26BE</div>';
    }

    articleModalBody.innerHTML='';

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

    var titleEl=document.createElement('div');
    titleEl.className='yat-article-modal-title';
    titleEl.textContent=stripHtml(post.title||'Untitled');
    articleModalBody.appendChild(titleEl);

    if(post.snippet){
      var snipEl=document.createElement('div');
      snipEl.className='yat-article-modal-snippet';
      snipEl.innerHTML=post.snippet;
      articleModalBody.appendChild(snipEl);
    }

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

    shareRow.appendChild(makeShareBtn('ri-twitter-x-line','X',function(){
      window.open('https://x.com/intent/tweet?url='+encodeURIComponent(shareUrl)+'&text='+shareTitle,'_blank','noopener,noreferrer');
    }));
    shareRow.appendChild(makeShareBtn('ri-facebook-line','Facebook',function(){
      window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl),'_blank','noopener,noreferrer');
    }));
    shareRow.appendChild(makeShareBtn('ri-mail-line','Email',function(){
      window.open('mailto:?subject='+shareTitle+'&body='+encodeURIComponent(shareUrl));
    }));
    var copyBtn=makeShareBtn('ri-link','Copy link',function(){
      navigator.clipboard&&navigator.clipboard.writeText(shareUrl).then(function(){
        copyBtn.classList.add('copied');
        copyBtn.querySelector('i').className='ri-check-line';
        setTimeout(function(){
          copyBtn.classList.remove('copied');
          copyBtn.querySelector('i').className='ri-link';
        },2000);
      });
    });
    shareRow.appendChild(copyBtn);
    articleModalBody.appendChild(shareRow);

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
    var cards=newsContainer?newsContainer.querySelectorAll('.news-card'):[];
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
    var emptyEl=newsContainer?newsContainer.querySelector('.yat-news-filtered-empty'):null;
    if(newsContainer){
      if(visible===0&&cards.length>0){
        if(!emptyEl){
          var empty=document.createElement('div');
          empty.className='yat-news-loading yat-news-filtered-empty';
          empty.style.cssText='grid-column:1/-1';
          empty.innerHTML='<div class="yat-news-empty-icon">\\u26BE</div><div class="yat-news-loading-text">NO MATCHING ARTICLES</div>';
          newsContainer.appendChild(empty);
        }
      }else if(emptyEl){
        emptyEl.remove();
      }
    }
  }

  // Removed: buildNewsLevelChips and buildNewsGradClassChips â€” use side drawer filters only

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

  function renderNewsCard(post){
    var card=document.createElement('div');
    card.className='yat-card news-card';
    card.setAttribute('id','news-'+post.uuid);
    var displayName=(post.playerName||post.playerDbName||'').toLowerCase();
    card.setAttribute('data-name',displayName);
    card.setAttribute('data-level',(post.level||'').toUpperCase());
    card.setAttribute('data-gradclass',post.gradClass||'');
    card.setAttribute('data-pid',post.playerId||'');
    card.setAttribute('data-active',post.active===true?'true':'false');
    card.setAttribute('data-team', (post.teamName||'').toLowerCase());
    card.setAttribute('data-org', (post.source||'').toUpperCase());
    card.setAttribute('data-status', 'ACTIVE');

    var inner=document.createElement('div');
    inner.className='yat-card-inner';
    var flip=document.createElement('div');
    flip.className='yat-flip';

    // FRONT FACE
    var front=document.createElement('div');
    front.className='yat-face yat-front';
    var bg=document.createElement('div');
    bg.className='yat-bg';
    bg.style.backgroundImage="url('"+(post.imageUrl||'/images/news-placeholder.jpg')+"')";
    front.appendChild(bg);
    var shade=document.createElement('div');
    shade.className='yat-shade';
    front.appendChild(shade);

    var frontContent=document.createElement('div');
    frontContent.className='yat-front-content';
    
    var topRow=document.createElement('div');
    topRow.className='yat-front-top';
    topRow.style.justifyContent='flex-end';
    var posChip=document.createElement('div');
    posChip.className='yat-front-top-right';
    posChip.innerHTML='<span class="front-chip">'+escHtml((post.source||'NEWS').toUpperCase())+'</span>';
    topRow.appendChild(posChip);
    frontContent.appendChild(topRow);

    var bottomWrap=document.createElement('div');
    bottomWrap.className='yat-news-bottom-wrap';

    var infoBlock=document.createElement('div');
    infoBlock.className='yat-info-block';
    
    var nameDiv=document.createElement('div');
    nameDiv.className='yat-name';
    var pName = post.playerName || post.playerDbName || "";
    var finalFirst = pName ? pName.split(" ").slice(0, -1).join(" ") : "--";
    var finalLast = pName ? pName.split(" ").slice(-1).join(" ") : "";
    nameDiv.innerHTML='<span>'+escHtml(finalFirst).toUpperCase()+'</span><span>'+escHtml(finalLast).toUpperCase()+'</span>';
    infoBlock.appendChild(nameDiv);

    var metaDiv=document.createElement('div');
    metaDiv.className='yat-meta';
    metaDiv.innerHTML='<span>UCLA - Big 10 Conference</span>';
    infoBlock.appendChild(metaDiv);

    var badgeRow=document.createElement('div');
    badgeRow.className='yat-front-badge-row';
    var lChip=document.createElement('span');
    lChip.className='front-chip';
    lChip.textContent=(post.level||'PRO').toUpperCase();
    badgeRow.appendChild(lChip);
    var sChip=document.createElement('span');
    sChip.className='front-chip';
    sChip.textContent='ACTIVE';
    badgeRow.appendChild(sChip);
    infoBlock.appendChild(badgeRow);

    var chipsCol=document.createElement('div');
    chipsCol.className='yat-chips-col';
    chipsCol.style.marginTop='4px';
    var classChip=document.createElement('span');
    classChip.className='front-chip';
    classChip.textContent='CLASS OF '+(post.gradClass||'2023');
    chipsCol.appendChild(classChip);
    var dots=document.createElement('div');
    dots.className='yat-dots';
    dots.style.marginTop='4px';
    ['23','22','21','20'].forEach(function(y){
      var dot=document.createElement('div');
      dot.className='yat-dot';
      dot.textContent=y;
      dots.appendChild(dot);
    });
    chipsCol.appendChild(dots);
    infoBlock.appendChild(chipsCol);

    var gameBlock=document.createElement('div');
    gameBlock.className='yat-game-block';
    gameBlock.style.marginTop='8px';
    var flipPill=document.createElement('div');
    flipPill.className='yat-pill';
    flipPill.style.background='#00e676';
    flipPill.style.color='#000';
    flipPill.style.border='none';
    flipPill.innerHTML='FLIP TO READ RECAP <i class="ri-arrow-right-line"></i>';
    gameBlock.appendChild(flipPill);
    var gameText=document.createElement('div');
    gameText.className='yat-game-text';
    gameText.style.fontSize='10px';
    gameText.style.opacity='0.7';
    gameText.style.marginTop='4px';
    var dateStr = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'RECENT';
    gameText.textContent=escHtml(post.source.toUpperCase()) + ' (' + dateStr + ')';
    gameBlock.appendChild(gameText);
    infoBlock.appendChild(gameBlock);
    
    bottomWrap.appendChild(infoBlock);

    var headlineWrap=document.createElement('div');
    headlineWrap.className='yat-news-headline-wrap';
    var headline=document.createElement('div');
    headline.className='yat-news-headline';
    headline.textContent=post.title;
    headlineWrap.appendChild(headline);
    bottomWrap.appendChild(headlineWrap);

    frontContent.appendChild(bottomWrap);
    front.appendChild(frontContent);

    // BACK FACE
    var back=document.createElement('div');
    back.className='yat-face yat-back';
    var backContent=document.createElement('div');
    backContent.className='news-back-content';
    backContent.style.padding='20px';
    backContent.style.display='flex';
    backContent.style.flexDirection='column';
    backContent.style.height='100%';
    
    var header=document.createElement('div');
    header.style.marginBottom='15px';
    var label=document.createElement('div');
    label.style.color='#00e676';
    label.style.fontFamily='"Bebas Neue",Oswald,sans-serif';
    label.style.fontSize='12px';
    label.style.letterSpacing='.1em';
    label.style.marginBottom='4px';
    label.textContent='HAMILTON YAT?STATS RECAP';
    header.appendChild(label);
    var rTitle=document.createElement('div');
    rTitle.style.fontFamily='"Bebas Neue",Oswald,sans-serif';
    rTitle.style.fontSize='18px';
    rTitle.style.lineHeight='1.1';
    rTitle.style.color='#fff';
    rTitle.textContent=post.title.toUpperCase();
    header.appendChild(rTitle);
    backContent.appendChild(header);

    var body=document.createElement('div');
    body.style.fontFamily='Oswald,sans-serif';
    body.style.fontSize='14px';
    body.style.lineHeight='1.4';
    body.style.color='rgba(255,255,255,.8)';
    body.style.flex='1';
    body.style.overflowY='auto';
    body.textContent=post.localRecap || post.snippet || "No recap available yet. Check back soon for the local Hamilton angle!";
    backContent.appendChild(body);

    var actions=document.createElement('div');
    actions.style.marginTop='15px';
    var fullBtn=document.createElement('a');
    fullBtn.style.display='block';
    fullBtn.style.background='#00e676';
    fullBtn.style.color='#000';
    fullBtn.style.textAlign='center';
    fullBtn.style.padding='10px';
    fullBtn.style.fontFamily='"Bebas Neue",Oswald,sans-serif';
    fullBtn.style.fontSize='14px';
    fullBtn.style.letterSpacing='.1em';
    fullBtn.style.borderRadius='4px';
    fullBtn.style.textDecoration='none';
    fullBtn.style.marginBottom='12px';
    fullBtn.href=post.url;
    fullBtn.target='_blank';
    fullBtn.rel='noopener noreferrer';
    fullBtn.textContent='READ FULL STORY';
    actions.appendChild(fullBtn);

    var shareRow=document.createElement('div');
    shareRow.style.display='flex';
    shareRow.style.alignItems='center';
    shareRow.style.gap='12px';
    var sLabel=document.createElement('span');
    sLabel.style.fontFamily='"Bebas Neue",Oswald,sans-serif';
    sLabel.style.fontSize='12px';
    sLabel.style.color='rgba(255,255,255,.5)';
    sLabel.textContent='SHARE:';
    shareRow.appendChild(sLabel);

    function addShare(icon, handler) {
      var btn=document.createElement('button');
      btn.style.background='rgba(255,255,255,.1)';
      btn.style.border='none';
      btn.style.color='#fff';
      btn.style.width='32px';
      btn.style.height='32px';
      btn.style.borderRadius='50%';
      btn.style.display='flex';
      btn.style.alignItems='center';
      btn.style.justifyContent='center';
      btn.style.cursor='pointer';
      btn.innerHTML='<i class="'+icon+'"></i>';
      btn.addEventListener('click', function(e){ e.stopPropagation(); handler(); });
      shareRow.appendChild(btn);
    }

    var sUrl=post.url;
    var sTitle=encodeURIComponent('Check out this news about '+(post.playerName||'Hamilton Alumni')+': '+post.title);

    addShare('ri-twitter-x-line', function(){ window.open('https://x.com/intent/tweet?text='+sTitle+'&url='+encodeURIComponent(sUrl),'_blank'); });
    addShare('ri-facebook-fill', function(){ window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(sUrl),'_blank'); });
    addShare('ri-mail-line', function(){ window.open('mailto:?subject='+sTitle+'&body='+encodeURIComponent(sUrl)); });
    addShare('ri-chat-1-line', function(){ window.open('sms:?&body='+sTitle+'%20'+encodeURIComponent(sUrl)); });

    actions.appendChild(shareRow);
    backContent.appendChild(actions);
    back.appendChild(backContent);

    flip.appendChild(front);
    flip.appendChild(back);
    inner.appendChild(flip);
    card.appendChild(inner);

    card.addEventListener('click', function(e){
      if(e.target.closest('a') || e.target.closest('button')) return;
      card.classList.toggle('is-flipped');
    });

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
        
        allNewsPosts.forEach(function(post){
          newsContainer.appendChild(renderNewsCard(post));
        });
        
        var footer=document.createElement('div');
        footer.className='yat-news-footer';
        footer.innerHTML='<span class="yat-news-powered">Powered by Webz.io News API \u00B7 '+data.total+' articles</span>';
        newsContainer.parentNode.appendChild(footer);
        
        // If there's a pending filter from a headshot click, apply it now
        if(newsFilterName && newsFilterName.value) {
          applyNewsFilters();
        }
      })
      .catch(function(err){
        console.error('News fetch error:',err);
        newsContainer.innerHTML='<div class="yat-news-error"><div class="yat-news-error-icon">\u26A0\uFE0F</div><div class="yat-news-error-text">Unable to load news right now. Please try again later.</div></div>';
      });
  }

  function handleHash(){
    var h=window.location.hash;
    if(!h)return;
    var tid=h.replace('#sec-','');
    showSection(tid,false);
  }
  handleHash();
  window.addEventListener('hashchange',handleHash);

  function stampFavorites(){
    var raw;
    try{raw=localStorage.getItem('yat-user');}catch(e){return;}
    if(!raw)return;
    var user;
    try{user=JSON.parse(raw);}catch(e){return;}
    if(!user||!user.uid)return;
    fetch('/api/favorites?uid='+encodeURIComponent(user.uid))
      .then(function(r){return r.json();})
      .then(function(data){
        var ids=data&&Array.isArray(data.playerIds)?data.playerIds:[];
        if(!ids.length)return;
        document.querySelectorAll('.yat-card[data-playerid]').forEach(function(card){
          if(ids.indexOf(card.getAttribute('data-playerid'))!==-1){
            card.setAttribute('data-fav','true');
          }
        });
      })
      .catch(function(){});
  }
  stampFavorites();

  async function hydrateHomeCrest(){
    var raw;
    try{raw=localStorage.getItem('yat-user');}catch(e){return;}
    if(!raw)return;

    var user;
    try{user=JSON.parse(raw);}catch(e){return;}
    if(!user||!user.homeHsid)return;

    var homeHsid=user.homeHsid;
    var crestUrl='https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/'+homeHsid+'.png';

    function slugifySchoolName(name){
      return String(name||'')
        .toLowerCase()
        .trim()
        .replace(/&/g,' and ')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-+|-+$/g,'');
    }

    function normalizeState(state){
      return String(state||'').toLowerCase().trim();
    }

    function buildAbsoluteMicrositeUrl(hsid, schoolName, schoolLocation){
      if(!hsid)return '';

      var schoolSlug=slugifySchoolName(schoolName||'');
      var statePart=String(schoolLocation||'').split(',')[1]||'';
      var stateSlug=normalizeState(statePart);

      if(schoolSlug&&stateSlug){
        return 'https://'+schoolSlug+'.'+stateSlug+'.yatstats.com/'+hsid;
      }

      return '';
    }

    function applyHomeLinks(homeHref){
      if(!homeHref)return;

      var topbarLink=document.getElementById('topbarHomeCrestLink');
      var topbarImg=document.getElementById('topbarHomeCrestImg');

      if(topbarLink){
        topbarLink.setAttribute('href',homeHref);
        topbarLink.removeAttribute('hidden');
        topbarLink.style.display='';
        topbarLink.onclick=function(e){
          e.preventDefault();
          window.location.assign(homeHref);
        };
      }

      if(topbarImg){
        topbarImg.setAttribute('src',crestUrl);
        topbarImg.onerror=function(){topbarImg.onerror=null;topbarImg.src='${CREST_FALLBACK_PATH}';};
        topbarImg.onclick=function(e){
          e.preventDefault();
          e.stopPropagation();
          window.location.assign(homeHref);
        };
      }

      var drawerLink=document.getElementById('drawerHomeSchoolLink');
      var drawerImg=document.getElementById('drawerHomeCrestImg');

      if(drawerLink){
        drawerLink.setAttribute('href',homeHref);
        drawerLink.style.display='';
        drawerLink.onclick=function(e){
          e.preventDefault();
          window.location.assign(homeHref);
        };
      }

      if(drawerImg){
        drawerImg.setAttribute('src',crestUrl);
        drawerImg.onerror=function(){drawerImg.onerror=null;drawerImg.src='${CREST_FALLBACK_PATH}';};
        drawerImg.onclick=function(e){
          e.preventDefault();
          e.stopPropagation();
          window.location.assign(homeHref);
        };
      }

      try{
        user.homeMicrositeUrl=homeHref;
        localStorage.setItem('yat-user',JSON.stringify(user));
      }catch(e){}
    }

    var homeHref=user.homeMicrositeUrl||'';

    if(!homeHref){
      homeHref=buildAbsoluteMicrositeUrl(
        homeHsid,
        user.homeSchoolName||'',
        user.homeSchoolLocation||''
      );
    }

    if(!homeHref){
      try{
        var res=await fetch('/api/auth/session', {
          method:'GET',
          credentials:'include',
          cache:'no-store'
        });
        var data=await res.json();

        var s=data&&data.session?data.session:null;
        if(s&&String(s.homeHsid||'')===String(homeHsid)){
          if(!user.homeSchoolName&&s.homeSchoolName)user.homeSchoolName=s.homeSchoolName;
          if(!user.homeSchoolLocation&&s.homeSchoolLocation)user.homeSchoolLocation=s.homeSchoolLocation;

          homeHref=buildAbsoluteMicrositeUrl(
            homeHsid,
            user.homeSchoolName||'',
            user.homeSchoolLocation||''
          );
        }
      }catch(e){}
    }

    if(!homeHref)return;
    applyHomeLinks(homeHref);
  }
  hydrateHomeCrest();

  function openAccountDrawer(){
    document.body.classList.remove('drawer-left-open','drawer-right-open');
    document.body.classList.add('drawer-account-open','drawer-open');
  }

  function getUserTier(){
    var raw;
    try{raw=localStorage.getItem('yat-user');}catch(e){return null;}
    if(!raw)return null;
    var u;
    try{u=JSON.parse(raw);}catch(e){return null;}
    if(!u||!u.uid)return null;
    var plan;
    try{plan=localStorage.getItem('yat-plan')||u.role||'fan';}catch(e){plan=u.role||'fan';}
    return plan;
  }

  var homeChk=document.getElementById('filterFavsHome');
  var allChk=document.getElementById('filterFavsAll');

  if(homeChk){
    homeChk.addEventListener('change',function(){
      if(!this.checked)return;
      var tier=getUserTier();
      if(!tier){
        this.checked=false;
        openAccountDrawer();
        return;
      }
      applyFilters();
    });
  }

  if(allChk){
    allChk.addEventListener('change',function(){
      if(!this.checked)return;
      var tier=getUserTier();
      if(tier!=='superfan'){
        this.checked=false;
        openAccountDrawer();
        return;
      }
      applyFilters();
    });
  }

  var _origApplyFilters=applyFilters;
  applyFilters=function(){
    _origApplyFilters();
    var homeChecked=homeChk&&homeChk.checked;
    var allChecked=allChk&&allChk.checked;
    if(!homeChecked&&!allChecked)return;
    document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
      if(card.getAttribute('data-fav')!=='true')card.style.display='none';
    });
    document.querySelectorAll('.gallery-slot-link[data-playerid]').forEach(function(slot){
      var pid=slot.getAttribute('data-playerid');
      var card=document.querySelector('.yat-card[data-playerid="'+pid+'"]');
      if(card&&card.style.display==='none')slot.style.display='none';
    });
  };

  var _origReset=resetFiltersForCurrentSection;
  resetFiltersForCurrentSection=function(){
    _origReset();
    if(homeChk)homeChk.checked=false;
    if(allChk)allChk.checked=false;
  };

  window.addEventListener('yat-auth-success',function(){
    stampFavorites();
    hydrateHomeCrest();
  });

  window.addEventListener('yat-sign-out',function(){
    var topbarLink=document.getElementById('topbarHomeCrestLink');
    if(topbarLink)topbarLink.setAttribute('hidden','');
    var drawerLink=document.getElementById('drawerHomeSchoolLink');
    if(drawerLink)drawerLink.style.display='none';
    stampFavorites();
  });
})();
        `,
      }}
    />
  );
}
