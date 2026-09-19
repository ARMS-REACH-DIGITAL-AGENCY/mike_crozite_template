// src/components/yatstats/YatHomeSchoolFallback.tsx
// Rescues the "MY HOME SCHOOL" topbar/drawer links when YatInteractivity.tsx's
// own hydrateHomeCrest() couldn't populate them.
//
// hydrateHomeCrest() reads a cached user object from localStorage first, and
// returns immediately if that's empty -- it only calls /api/auth/session
// (the real, cookie-backed source of truth) to refine details it already got
// from localStorage, not as a fallback for when localStorage has nothing at
// all. localStorage is always empty the first time a browser sees a given
// site inside a cross-site iframe (a real Next.js page has never actually
// written to it there), so on a normal top-level visit this rarely matters --
// a returning user has that cache from an earlier visit -- but embedded, it
// means the link never appears even though the session cookie itself is
// perfectly valid.
//
// This component does not touch YatInteractivity.tsx. It waits for the page
// to settle, checks whether those elements are still hidden, and only then
// independently calls the same /api/auth/session endpoint and fills in the
// same elements the same way -- functionally identical to the code path
// hydrateHomeCrest() takes once it already has a localStorage-cached user,
// just reachable without that cache existing first. If hydrateHomeCrest()
// already succeeded (the normal top-level case, once localStorage has been
// seeded once), this sees the elements are no longer hidden and does nothing.

import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';

export default function YatHomeSchoolFallback() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  var CREST_FALLBACK = ${JSON.stringify(CREST_FALLBACK_PATH)};

  function isHidden(el){
    if (!el) return true;
    if (el.hasAttribute('hidden')) return true;
    try { return window.getComputedStyle(el).display === 'none'; } catch (e) { return true; }
  }

  function slugifySchoolName(name){
    return String(name || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeState(state){
    return String(state || '').toLowerCase().trim();
  }

  function normalizeMicrositeUrl(url){
    var raw = String(url || '').trim();
    if (!raw || !/^https?:\\/\\//i.test(raw)) return '';
    return raw.replace(/\\/+$/, '');
  }

  function buildAbsoluteMicrositeUrl(hsid, schoolName, schoolLocation, canonicalMicrositeUrl){
    var canonical = normalizeMicrositeUrl(canonicalMicrositeUrl);
    if (canonical) return canonical;
    if (!hsid) return '';

    var schoolSlug = slugifySchoolName(schoolName || '');
    var statePart = String(schoolLocation || '').split(',')[1] || '';
    var stateSlug = normalizeState(statePart);

    if (schoolSlug && stateSlug) {
      return 'https://' + schoolSlug + '.' + stateSlug + '.yatstats.com/' + hsid;
    }
    return 'https://yatstats.com/' + hsid;
  }

  function applyHomeLinks(homeHref, crestUrl){
    var topbarLink = document.getElementById('topbarHomeCrestLink');
    var topbarImg = document.getElementById('topbarHomeCrestImg');
    var drawerLink = document.getElementById('drawerHomeSchoolLink');
    var drawerImg = document.getElementById('drawerHomeCrestImg');

    if (topbarLink) {
      topbarLink.setAttribute('href', homeHref);
      topbarLink.removeAttribute('hidden');
      topbarLink.style.display = '';
      topbarLink.onclick = function(e){ e.preventDefault(); window.location.assign(homeHref); };
    }
    if (topbarImg) {
      topbarImg.setAttribute('src', crestUrl);
      topbarImg.onerror = function(){ topbarImg.onerror = null; topbarImg.src = CREST_FALLBACK; };
      topbarImg.onclick = function(e){ e.preventDefault(); e.stopPropagation(); window.location.assign(homeHref); };
    }
    if (drawerLink) {
      drawerLink.setAttribute('href', homeHref);
      drawerLink.style.display = '';
      drawerLink.onclick = function(e){ e.preventDefault(); window.location.assign(homeHref); };
    }
    if (drawerImg) {
      drawerImg.setAttribute('src', crestUrl);
      drawerImg.onerror = function(){ drawerImg.onerror = null; drawerImg.src = CREST_FALLBACK; };
      drawerImg.onclick = function(e){ e.preventDefault(); e.stopPropagation(); window.location.assign(homeHref); };
    }
  }

  async function fallbackHydrateHomeCrest(){
    var topbarLink = document.getElementById('topbarHomeCrestLink');
    var drawerLink = document.getElementById('drawerHomeSchoolLink');
    // hydrateHomeCrest() already succeeded (normal case once localStorage
    // has been seeded once) -- nothing to rescue, don't touch anything.
    if (!isHidden(topbarLink) || !isHidden(drawerLink)) return;

    try {
      var res = await fetch('/api/auth/session', { method: 'GET', credentials: 'include', cache: 'no-store' });
      var data = await res.json();
      var s = data && data.session ? data.session : null;
      if (!s || !s.homeHsid) return;

      var homeHsid = s.homeHsid;
      var crestUrl = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/' + homeHsid + '.png';
      var homeHref = buildAbsoluteMicrositeUrl(homeHsid, s.homeSchoolName || '', s.homeSchoolLocation || '', s.homeMicrositeUrl || '');
      if (!homeHref) return;

      applyHomeLinks(homeHref, crestUrl);

      // Seed the same cache hydrateHomeCrest() reads, so a subsequent load
      // in this same storage partition (e.g. staying on this embedded
      // origin) finds it directly next time instead of needing this rescue.
      try {
        localStorage.setItem('yat-user', JSON.stringify({
          homeHsid: homeHsid,
          homeSchoolName: s.homeSchoolName || '',
          homeSchoolLocation: s.homeSchoolLocation || '',
          homeMicrositeUrl: homeHref
        }));
      } catch (e) {}
    } catch (e) {}
  }

  // Give hydrateHomeCrest() (and hydration generally) a moment to run first --
  // this only ever steps in if it didn't already succeed.
  function schedule(){ setTimeout(fallbackHydrateHomeCrest, 400); }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
        `,
      }}
    />
  );
}
