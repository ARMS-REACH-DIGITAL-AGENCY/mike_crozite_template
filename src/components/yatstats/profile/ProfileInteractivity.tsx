// src/components/yatstats/profile/ProfileInteractivity.tsx
// Client-side JS for the player profile page.
// Handles: tab switching, favorites, layout variable measurement,
// crest ↔ headshot swap via IntersectionObserver.
// Shell interactivity (theme toggle, drawers, global search) is handled by YatInteractivity in the layout.

interface ProfileInteractivityProps {
  playerId: string;
  playerName: string;
  resolvedHsid: string;
  headshotSrc: string;
  crestSrc: string;
  crestFallback: string;
}

export default function ProfileInteractivity({
  playerId,
  playerName,
  resolvedHsid,
  headshotSrc,
  crestSrc,
  crestFallback,
}: ProfileInteractivityProps) {
  return (
    <script dangerouslySetInnerHTML={{__html:`
(function(){
  /* ── Layout variable measurement ─────────────────────────────────── */
  (function setLayoutVars(){
    var header=document.querySelector('.yat-header');
    var tabBar=document.querySelector('.profile-tabs');
    var metaBand=document.querySelector('.player-meta-band');
    function update(){
      var headerHeight=header?header.offsetHeight:0;
      var tabBarHeight=tabBar?tabBar.offsetHeight:0;
      var metaBandHeight=metaBand?metaBand.offsetHeight:0;
      document.documentElement.style.setProperty('--stickyHeaderH',headerHeight+'px');
      document.documentElement.style.setProperty('--tabBarH',tabBarHeight+'px');
      document.documentElement.style.setProperty('--metaBandH',metaBandHeight+'px');
    }
    update();
    window.addEventListener('resize',update,{passive:true});
    window.addEventListener('load',update,{once:true,passive:true});
  }());

  /* ── Profile tab switching ──────────────────────────────────────── */
  var VALID_TABS=['overview','stats','news','social','mentor','gallery'];
  function activateTab(name){
    if(VALID_TABS.indexOf(name)===-1)return;
    document.querySelectorAll('.profile-tab').forEach(function(t){t.classList.remove('active');});
    document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});
    var tab=document.querySelector('.profile-tab[data-profile-tab="'+name+'"]');
    var content=document.getElementById('tab-'+name);
    if(tab)tab.classList.add('active');
    if(content)content.classList.add('active');
  }
  function scrollToTabBar(){
    var header=document.querySelector('.yat-header');
    var tabBar=document.querySelector('.profile-tabs');
    if(!header||!tabBar)return;
    var headerH=header.offsetHeight;
    var metaBand=document.querySelector('.player-meta-band');
    var metaBandH=metaBand?metaBand.offsetHeight:0;
    var y=tabBar.getBoundingClientRect().top+window.scrollY-headerH-metaBandH;
    window.scrollTo({top:Math.max(0,y),behavior:'auto'});
  }
  document.querySelectorAll('.profile-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      var target=tab.getAttribute('data-profile-tab');
      activateTab(target);
      history.replaceState(null,'','#tab-'+target);
    });
  });
  (function(){
    var hash=window.location.hash.slice(1);
    if(hash.slice(0,4)==='tab-'){
      activateTab(hash.slice(4));
      requestAnimationFrame(function(){
        requestAnimationFrame(scrollToTabBar);
      });
    }
  }());

  /* ── Favorites ──────────────────────────────────────────────────── */
  var playerId=${JSON.stringify(playerId)};
  var playerName=${JSON.stringify(playerName)};
  var favMask=document.getElementById('favModalMask');
  function openFavModal(){if(favMask){favMask.style.display='flex';}}
  function closeFavModal(){if(favMask){favMask.style.display='none';}}
  var btnFanFav=document.getElementById('btnFanFav');
  var favToast=document.getElementById('favToast');
  function showFavToast(msg){if(!favToast)return;favToast.textContent=msg;favToast.classList.add('show');setTimeout(function(){favToast.classList.remove('show');},3500);}
  function setFavState(btn,active){if(!btn)return;var icon=btn.querySelector('i');if(active){btn.classList.add('active');if(icon)icon.className='ri-star-fill';}else{btn.classList.remove('active');if(icon)icon.className='ri-star-line';}}
  function openAccountDrawer(){document.body.classList.add('drawer-account-open','drawer-open');document.body.classList.remove('drawer-left-open');}
  function getFirebaseUser(){
    try{
      var stored=JSON.parse(localStorage.getItem('yat-user')||'null');
      return stored||null;
    }catch(e){localStorage.removeItem('yat-user');return null;}
  }
  function addFavorite(){
    var user=getFirebaseUser();
    if(!user||!user.contactId){
      try{sessionStorage.setItem('pending_fav_pid',playerId);sessionStorage.setItem('pending_fav_name',playerName);}catch(e){}
      openAccountDrawer();
      return;
    }
    fetch('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firebaseUid:user.uid||'',contactId:user.contactId,playerId:playerId,playerName:playerName,type:'fan'})}).then(function(r){return r.json();}).then(function(data){
      if(data&&data.success){setFavState(btnFanFav,true);showFavToast(playerName+' added to your favorites');}
      else{console.warn('Favorite error:',(data&&data.error)||'unknown');}
    }).catch(function(){console.warn('Network error saving favorite.');});
  }
  function becomeSuperfan(){
    var user=getFirebaseUser();
    if(!user||!user.contactId){
      try{sessionStorage.setItem('pending_superfan','1');}catch(e){}
      openAccountDrawer();
      return;
    }
    if(!user.uid||!user.email){openAccountDrawer();return;}
    fetch('/api/stripe/create-superfan-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firebaseUid:user.uid,email:user.email})}).then(function(r){return r.json();}).then(function(data){
      if(data&&data.url){window.location.href=data.url;}
      else{console.warn('Checkout error:',(data&&data.error)||'unknown');}
    }).catch(function(){console.warn('Network error starting Superfan checkout.');});
  }
  window.addEventListener('yat-auth-success',function(e){
    var detail=e.detail||{};
    if(detail.playerId&&detail.playerId!==playerId)return;
    setFavState(btnFanFav,true);
    showFavToast(playerName+' added to your favorites');
  },{once:true});
  if(btnFanFav)btnFanFav.addEventListener('click',function(){addFavorite();});
  var favClose=document.getElementById('favModalClose');
  var favContinue=document.getElementById('favContinue');
  var favRegister=document.getElementById('favRegister');
  var favUpgrade=document.getElementById('favUpgrade');
  if(favClose)favClose.addEventListener('click',closeFavModal);
  if(favMask)favMask.addEventListener('click',function(e){if(e.target===favMask)closeFavModal();});
  if(favContinue)favContinue.addEventListener('click',closeFavModal);
  if(favRegister)favRegister.addEventListener('click',function(){openAccountDrawer();});
  if(favUpgrade)favUpgrade.addEventListener('click',function(){becomeSuperfan();});

  /* ── Crest ↔ headshot swap via IntersectionObserver ─────────────── */
  (function(){
    var heroMeta=document.getElementById('playerHeroMeta');
    var stickyImg=document.getElementById('stickyIdentityImg');
    if(!heroMeta||!stickyImg)return;
    var crestSrc=${JSON.stringify(crestSrc)};
    var headshotSrc=${JSON.stringify(headshotSrc)};
    var CREST_FALLBACK=${JSON.stringify(crestFallback)};
    stickyImg.onerror=function(){
      if(this.src!==crestSrc&&this.src!==CREST_FALLBACK){
        this.src=crestSrc;
        this.classList.remove('is-headshot');
      }else if(this.src!==CREST_FALLBACK){
        this.onerror=null;
        this.src=CREST_FALLBACK;
        crestSrc=CREST_FALLBACK;
      }else{
        this.onerror=null;
      }
    };
    if(!headshotSrc)return;
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting){
          stickyImg.src=headshotSrc;
          stickyImg.classList.add('is-headshot');
        }else{
          stickyImg.src=crestSrc;
          stickyImg.classList.remove('is-headshot');
        }
      });
    },{threshold:0,rootMargin:'0px 0px 0px 0px'});
    observer.observe(heroMeta);
  }());
})();
    `}} />
  );
}
