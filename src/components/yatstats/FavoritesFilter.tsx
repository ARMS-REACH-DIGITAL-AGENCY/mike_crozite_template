'use client';

// "By My Favorites" in the Filters drawer (school layout): marks the
// reader's favorites at this school (data-fav="true" on their flip cards) and
// shows the group once there is at least one. GalleryFilterController keeps
// only marked cards while "Show my favorites only" is checked. Uses the same
// one-per-page favorites lookup as the hearts on the cards (FavoriteButton),
// and re-reads it when a favorite changes or the Filters drawer opens (which
// also covers signing in after the page loaded).

import { useEffect } from 'react';
import { loadFavoriteIds, readYatUser } from './FavoriteButton';

export default function FavoritesFilter() {
  useEffect(() => {
    let live = true;

    const sync = async () => {
      const user = readYatUser();
      const ids = user?.uid ? await loadFavoriteIds(user.uid) : new Set<string>();
      if (!live) return;

      const here = new Set<string>();
      document.querySelectorAll<HTMLElement>('.yat-card[data-playerid]').forEach((card) => {
        const id = card.dataset.playerid || '';
        if (ids.has(id)) { card.dataset.fav = 'true'; here.add(id); }
        else delete card.dataset.fav;
      });

      const group = document.getElementById('filterFavsGroup');
      const box = document.getElementById('filterFavs') as HTMLInputElement | null;
      if (group) group.style.display = here.size ? '' : 'none';
      // Only while "Show my favorites only" is checked does the gallery need
      // filtering again (to follow the new marks, or to let everyone back in
      // when the last favorite here is gone); otherwise leave it alone.
      if (!box?.checked) return;
      if (!here.size) box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const onChange = () => { window.setTimeout(sync, 0); };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('#openFilters')) onChange();
    };

    void sync();
    window.addEventListener('yat-favorites-changed', onChange);
    document.addEventListener('click', onClick, true);
    return () => {
      live = false;
      window.removeEventListener('yat-favorites-changed', onChange);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
