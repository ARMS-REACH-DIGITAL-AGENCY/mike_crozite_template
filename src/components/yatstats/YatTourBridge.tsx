// src/components/yatstats/YatTourBridge.tsx
// Talks to the YAT?STATS corporate site when this microsite is embedded
// inside its guided-tour iframe. Does nothing on a normal top-level visit.
//
// Two jobs:
//   1. Report our real location (postMessage `YAT_LOCATION`) so the corporate
//      page's fake address bar / "Open full site" link never goes stale as
//      the visitor navigates or switches tabs inside the iframe.
//   2. Relay pinch/pan touch gestures out to the parent (`YAT_EMBED_GESTURE`,
//      `YAT_EMBED_PAN`) so a two-finger zoom over the embedded demo magnifies
//      the parent's device-preview frame instead of escaping it and zooming
//      the whole corporate page -- the standard cross-origin-iframe
//      limitation: the parent can't see touches inside another origin's
//      document on its own, so this document has to report them itself.
//
// Deliberately isolated from YatInteractivity.tsx: nothing here touches
// search, filters, flip cards, drawers or favorites. It only reads DOM
// selectors that other components already expose (#openSearch,
// #flipAllCards, etc.) to trigger their existing click handlers.

const CORPORATE_SOURCE = 'yatstats-corporate-tour';
const MICROSITE_SOURCE = 'yatstats-microsite';

const TRUSTED_PARENT_HOSTS = [
  /(^|\.)yatstats\.com$/i,
  /^armsreach-[a-z0-9]+-arms-reach-digital-agency\.vercel\.app$/i,
  /^armsreach-git-[a-z0-9-]+-arms-reach-digital-agency\.vercel\.app$/i,
];

export default function YatTourBridge() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  var TRUSTED_PARENT_HOSTS = ${JSON.stringify(TRUSTED_PARENT_HOSTS.map((r) => r.source))}.map(function(src){ return new RegExp(src, 'i'); });
  var CORPORATE_SOURCE = ${JSON.stringify(CORPORATE_SOURCE)};
  var MICROSITE_SOURCE = ${JSON.stringify(MICROSITE_SOURCE)};

  var embedded = true;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (!embedded) return; // Normal top-level visit -- nothing to bridge, nothing to touch.

  var trustedOrigin = null;
  var trustedSource = null;
  var parentZoom = 1;

  function isTrustedParentOrigin(origin){
    try {
      var host = new URL(origin).hostname;
      for (var i = 0; i < TRUSTED_PARENT_HOSTS.length; i++) {
        if (TRUSTED_PARENT_HOSTS[i].test(host)) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function report(type, extra){
    if (!trustedOrigin || !trustedSource) return;
    var payload = { source: MICROSITE_SOURCE, type: type, href: window.location.href };
    if (extra) { for (var k in extra) payload[k] = extra[k]; }
    try { trustedSource.postMessage(payload, trustedOrigin); } catch (e) {}
  }

  function reportLocation(){ report('YAT_LOCATION'); }

  var lastHref = window.location.href;
  function checkHref(){
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      reportLocation();
    }
  }
  window.addEventListener('hashchange', checkHref);
  window.addEventListener('popstate', checkHref);
  // Some in-app tab switches rewrite the hash via history.pushState without
  // firing hashchange; a light poll catches those too rather than trusting
  // any single event to fire reliably.
  setInterval(checkHref, 400);

  function runTourAction(selector){
    if (!selector) return;
    try {
      var first = String(selector).split(',')[0].trim();
      var el = document.querySelector(first);
      if (el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button')) {
        el.click();
        return;
      }
      var id = first.replace(/^#/, '');
      if (id && id.indexOf(' ') === -1 && id.indexOf('[') === -1) {
        window.location.hash = id;
      }
    } catch (e) {}
  }

  window.addEventListener('message', function(event){
    var data = event.data;
    if (!data || data.source !== CORPORATE_SOURCE) return;
    if (!isTrustedParentOrigin(event.origin)) return;
    trustedOrigin = event.origin;
    trustedSource = event.source;

    if (data.type === 'YAT_TOUR_HELLO') {
      report('YAT_TOUR_ACK');
      reportLocation();
      return;
    }
    if (data.type === 'YAT_REQUEST_LOCATION') { reportLocation(); return; }
    if (data.type === 'YAT_TOUR_ACTION') { runTourAction(data.selector); return; }
    if (data.type === 'YAT_EMBED_ZOOM_STATE') {
      var z = Number(data.zoom);
      if (isFinite(z) && z > 0) parentZoom = z;
      return;
    }
  });

  // ---- Pinch-to-zoom / pan relay, contained to this document's own touches ----
  var clamp = function(v, min, max){ return Math.min(max, Math.max(min, v)); };
  var point = function(t){ return { x: t.clientX, y: t.clientY }; };
  var dist = function(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); };
  var center = function(a, b){ return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  var fraction = function(pt){
    return {
      x: clamp(pt.x / Math.max(1, window.innerWidth), 0, 1),
      y: clamp(pt.y / Math.max(1, window.innerHeight), 0, 1)
    };
  };

  var pinchActive = false;
  var pinchStartDist = 0;
  var pinchCenter = { x: .5, y: .5 };
  var panPoint = null;
  var panActive = false;

  document.addEventListener('touchstart', function(e){
    if (!trustedOrigin) return; // Not yet handshaken with a verified parent -- leave native behavior alone.
    if (e.touches.length === 2) {
      pinchActive = true;
      panActive = false;
      panPoint = null;
      var a = point(e.touches[0]), b = point(e.touches[1]);
      pinchStartDist = dist(a, b) || 1;
      pinchCenter = fraction(center(a, b));
      report('YAT_EMBED_GESTURE', { phase: 'start' });
      e.preventDefault();
    } else if (e.touches.length === 1 && !pinchActive && parentZoom > 1.001) {
      panPoint = point(e.touches[0]);
    }
  }, { passive: false, capture: true });

  document.addEventListener('touchmove', function(e){
    if (!trustedOrigin) return;
    if (pinchActive && e.touches.length === 2) {
      var a = point(e.touches[0]), b = point(e.touches[1]);
      var d = dist(a, b) || 1;
      report('YAT_EMBED_GESTURE', { phase: 'change', scale: d / pinchStartDist, centerX: pinchCenter.x, centerY: pinchCenter.y });
      e.preventDefault();
    } else if (!pinchActive && panPoint && e.touches.length === 1 && parentZoom > 1.001) {
      var p = point(e.touches[0]);
      if (!panActive) { panActive = true; report('YAT_EMBED_PAN', { phase: 'start' }); }
      report('YAT_EMBED_PAN', { phase: 'change', deltaX: p.x - panPoint.x, deltaY: p.y - panPoint.y });
      e.preventDefault();
    }
  }, { passive: false, capture: true });

  function endTouch(){
    if (pinchActive) { pinchActive = false; report('YAT_EMBED_GESTURE', { phase: 'end' }); }
    panActive = false;
    panPoint = null;
  }
  document.addEventListener('touchend', endTouch, { passive: true, capture: true });
  document.addEventListener('touchcancel', endTouch, { passive: true, capture: true });
})();
        `,
      }}
    />
  );
}
