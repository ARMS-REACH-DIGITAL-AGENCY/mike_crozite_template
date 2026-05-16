// Shared layout hook for the Hamilton MVP static spec.
// This file is loaded before the inline page script in index.html.
(function () {
  const NFHS_GAME = {
    id: 'hamilton-2026-aia-6a-sf-sdoc-nfhs',
    title: "Hamilton vs Sandra Day O'Connor — watch from 33:00",
    url: 'https://www.nfhsnetwork.com/events/aia/gam63324ef372?t=1980',
    image: 'assets/img/schools/{{HSID}}.png',
    source: 'NFHS Network',
    publishedAt: '2026-05-15T18:30:00-07:00',
    scope: 'current_team_2026',
    tags: {
      level: 'HIGH SCHOOL',
      team: 'Hamilton',
      season: '2026',
      event: 'AIA 6A Baseball Championships',
      start_time_seconds: 1980,
      start_time_label: '33:00'
    }
  };

  function isHamiltonPage() {
    const config = window.SCHOOL_CONFIG || {};
    const hsid = String(config.hsid || '').trim();
    const name = String(config.name || '').toLowerCase();
    return hsid === '5004' || name.includes('hamilton') || location.href.toLowerCase().includes('hamilton');
  }

  function cleanId(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function schoolCrestPath() {
    const config = window.SCHOOL_CONFIG || {};
    const hsid = String(config.hsid || '').trim();
    return hsid ? `assets/img/schools/${hsid}.png` : 'assets/img/schools/5004.png';
  }

  function buildCache(rawValue) {
    if (!isHamiltonPage()) return rawValue;

    const players = Array.isArray(window.PLAYERS) ? window.PLAYERS : [];
    const names = [...new Set(players
      .filter((player) => String(player.status || '').toUpperCase() === 'ACTIVE 2026')
      .map((player) => player.display_name || [player.first, player.last].filter(Boolean).join(' '))
      .map((name) => String(name || '').trim())
      .filter(Boolean))];

    if (!names.length) return rawValue;

    let cache = {};
    try {
      cache = rawValue ? JSON.parse(rawValue) : {};
    } catch {
      cache = {};
    }

    const existingItems = Array.isArray(cache.items) ? cache.items : [];
    const existingKeys = new Set(existingItems.map((item) => `${item.id || ''}|${String(item.player_display_name || '').toLowerCase()}`));

    const nfhsItems = names
      .map((name) => ({
        ...NFHS_GAME,
        id: `${NFHS_GAME.id}-${cleanId(name)}`,
        image: schoolCrestPath(),
        player_display_name: name
      }))
      .filter((item) => !existingKeys.has(`${item.id}|${String(item.player_display_name || '').toLowerCase()}`));

    return JSON.stringify({
      ...cache,
      items: [...nfhsItems, ...existingItems]
    });
  }

  if (!Storage.prototype.__yatstatsHamilton2026NfhsPatchInstalled) {
    const nativeGetItem = Storage.prototype.getItem;
    Object.defineProperty(Storage.prototype, '__yatstatsHamilton2026NfhsPatchInstalled', {
      value: true,
      configurable: false
    });

    Storage.prototype.getItem = function patchedGetItem(key) {
      const rawValue = nativeGetItem.call(this, key);
      return key === 'YAT_NEWS_CACHE_V1' ? buildCache(rawValue) : rawValue;
    };
  }
})();
