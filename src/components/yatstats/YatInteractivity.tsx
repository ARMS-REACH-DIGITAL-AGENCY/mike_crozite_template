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
  
  /* Favicon fallback */
  var favLink=document.querySelector('link[rel="icon"][type="image/png"]');
  if(favLink){
    var favImg=new Image();
    favImg.onerror=function(){
      var placeholder = '/img/yatstats-logo-circle.png';
      favLink.href=placeholder;
    };
    favImg.src=favLink.href;
  }

  /* Theme Toggle */
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
  }

  /* Card Flip */
  document.addEventListener('click',function(e){
    var card=e.target.closest('.yat-card');
    if(!card)return;
    if(e.target.closest('a')||e.target.closest('button'))return;
    card.classList.toggle('is-flipped');
  });

  /* Section Switching */
  function showSection(tabId){
    var sec=document.getElementById('sec-'+tabId);
    if(!sec) {
      // If section doesn't exist on this page (e.g., we are on a player page),
      // navigate to the school page with the hash.
      window.location.href = '/' + window.__YAT_HSID + '#sec-' + tabId;
      return;
    }
    document.querySelectorAll('.yat-section').forEach(function(s){
      s.classList.remove('visible');
    });
    sec.classList.add('visible');
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
      sectionLabel.textContent=labels[tabId]||tabId.toUpperCase();
    }
  }

  /* Global Tab/Nav Click Handler */
  document.addEventListener('click',function(e){
    var pair=e.target.closest('[data-tab]');
    if(!pair)return;
    var tab=pair.dataset.tab;
    if(!tab)return;
    
    // Check if we should prevent default (only if we are staying on the same page)
    if(document.getElementById('sec-'+tab)) {
      e.preventDefault();
      showSection(tab);
    }
    // If section not found, let the default <a> behavior handle the navigation
    
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });

  /* Drawers */
  var btnMenu=document.getElementById('btnMenu');
  if(btnMenu)btnMenu.addEventListener('click',function(){document.body.classList.toggle('drawer-left-open');document.body.classList.toggle('drawer-open');});
  var closeLeft=document.getElementById('closeLeft');
  if(closeLeft)closeLeft.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-open');});
  
  var openSearch=document.getElementById('openSearch');
  var gsModal=document.getElementById('gsModal');
  if(openSearch&&gsModal)openSearch.addEventListener('click',function(){
    gsModal.classList.add('open');
    document.body.classList.add('drawer-open');
    var gsInput=document.getElementById('gsInput');
    if(gsInput)setTimeout(function(){gsInput.focus();},60);
  });
  
  var gsClose=document.getElementById('gsClose');
  if(gsClose)gsClose.addEventListener('click',function(){
    if(gsModal)gsModal.classList.remove('open');
    document.body.classList.remove('drawer-open');
  });

  /* Initial Section State from Hash */
  if(window.location.hash) {
    var hashTab = window.location.hash.replace('#sec-', '');
    if(hashTab) showSection(hashTab);
  }

})();
        `,
      }}
    />
  );
}
