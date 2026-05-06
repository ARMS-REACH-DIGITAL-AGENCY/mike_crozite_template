'use client';

import { useEffect } from 'react';

function openFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-account-open');
}

function closeFavoritesDrawer() {
  document.body.classList.remove('drawer-favorites-open', 'drawer-open');
}

export default function FavoritesDrawer() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('#openFavorites')) {
        event.preventDefault();
        openFavoritesDrawer();
        return;
      }

      if (target.id === 'drawerMask' && document.body.classList.contains('drawer-favorites-open')) {
        event.preventDefault();
        closeFavoritesDrawer();
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeFavoritesDrawer();
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return (
    <>
      <aside className="yat-drawer yat-drawer-right" id="drawerFavorites" aria-label="Favorites drawer">
        <div
          className="yat-drawer-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h3 style={{ margin: 0 }}>MY FAVORITES</h3>
          <button className="yat-icon-btn" aria-label="Close favorites" onClick={closeFavoritesDrawer}>
            <i className="ri-close-line" />
          </button>
        </div>

        <div className="yat-drawer-content">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 12px Oswald, sans-serif', textTransform: 'uppercase' }}>
            <input type="checkbox" disabled />
            Show My Favorites
          </label>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ font: '700 12px Oswald, sans-serif', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Favorite Players
            </div>
            <div style={{ color: 'var(--muted)', font: '400 12px/1.45 Oswald, sans-serif' }}>
              Favorites list wiring comes next. This drawer is now separated from filters.
            </div>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        body.drawer-favorites-open #drawerFavorites {
          transform: translateX(0);
        }
        body.drawer-favorites-open .yat-drawer-mask {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </>
  );
}
