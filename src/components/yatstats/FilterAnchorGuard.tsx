// src/components/yatstats/FilterAnchorGuard.tsx
// Prevents a deep-linked #player anchor from forcing that card to stay visible
// after the fan changes Sort & Filter drawer selections.

export default function FilterAnchorGuard() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  function isPlayerAnchor(){
    return String(window.location.hash || '').indexOf('#player-') === 0;
  }

  function clearPlayerAnchorForManualFilter(){
    if(!isPlayerAnchor()) return;

    var activeSection = document.getElementById('sec-active');
    var allTimeSection = document.getElementById('sec-alltime');
    var visibleSection =
      activeSection && activeSection.classList.contains('visible')
        ? 'active'
        : allTimeSection && allTimeSection.classList.contains('visible')
          ? 'alltime'
          : 'active';

    var nextHash = '#sec-' + visibleSection;
    history.replaceState(null, '', window.location.pathname + window.location.search + nextHash);
  }

  document.addEventListener('change', function(event){
    var target = event.target;
    if(!target || !target.closest) return;
    if(target.closest('#filters')) clearPlayerAnchorForManualFilter();
  }, true);

  document.addEventListener('input', function(event){
    var target = event.target;
    if(!target || !target.closest) return;
    if(target.closest('#filters')) clearPlayerAnchorForManualFilter();
  }, true);
})();
        `,
      }}
    />
  );
}
