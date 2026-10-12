'use client';

// "My Favorites" in the Filters drawer (school layout). The group shows for
// everyone, so a visitor sees what registering gets them:
// - visitor: the hint says to register, and tapping the checkbox opens the
//   Account drawer instead of checking it;
// - signed in, no favorites at this school yet: the hint says how to add one,
//   and the checkbox stays unchecked;
// - signed in with favorites: their flip cards are marked data-fav="true" and
//   GalleryFilterController keeps only those while the box is checked.
// Uses the same one-per-page favorites lookup as the hearts on the cards
// (FavoriteButton), and re-reads it when a favorite changes, the reader signs
// in, or the Filters drawer opens.

import { useEffect } from 'react';
import { loadFavoriteIds, openAccountDrawer, readYatUser } from './FavoriteButton';

const HINT_VISITOR = 'Register free to save your favorites.';
const HINT_NONE = 'Tap ♡ on any player to add them here.';

export default function FavoritesFilter() {
  useEffect(() => {
    let live = true;
    let favoritesHere = 0;

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
      favoritesHere = here.size;

      const hint = document.getElementById('filterFavsHint');
      if (hint) hint.textContent = !user?.uid ? HINT_VISITOR : here.size ? '' : HINT_NONE;

      const box = document.getElementById('filterFavs') as HTMLInputElement | null;
      // Only while "Only show my favorites" is checked does the gallery need
      // filtering again (to follow the new marks, or to let everyone back in
      // when the last favorite here is gone); otherwise leave it alone.
      if (!box?.checked) return;
      if (!here.size) box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const onChange = () => { window.setTimeout(sync, 0); };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('#openFilters')) { onChange(); return; }
      const box = target?.closest?.('#filterFavs') as HTMLInputElement | null;
      // Checking the box with nothing to show: a visitor goes to register,
      // a fan with no favorites here keeps the hint. Unchecking is never held.
      // (A click handler sees the box already toggled, so checked = checking.)
      if (!box || !box.checked) return;
      if (!readYatUser()?.uid) { event.preventDefault(); openAccountDrawer(); return; }
      if (!favoritesHere) event.preventDefault();
    };

    void sync();
    window.addEventListener('yat-favorites-changed', onChange);
    window.addEventListener('yat-auth-success', onChange);
    document.addEventListener('click', onClick, true);
    return () => {
      live = false;
      window.removeEventListener('yat-favorites-changed', onChange);
      window.removeEventListener('yat-auth-success', onChange);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
