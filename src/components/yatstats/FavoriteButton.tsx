// src/components/yatstats/FavoriteButton.tsx
// Client component — renders the ☆/★ FAVORITE control on the player profile page.
//
// Access rules enforced here (client-side gate; server is canonical):
//   Visitor (not logged in)  → store pending intent, open Account Drawer
//   Fan, same-school player  → allow save / remove
//   Fan, cross-school player → block, explain, open Account Drawer to Superfan upgrade
//   Super Fan                → allow save / remove globally
//
// Auth source of truth: localStorage 'yat-user' (set by AccountDrawer after login/register).
// isSuperfan is NOT in yat-user; we derive it from the login API response stored in
// sessionStorage key 'yat-plan' (set below on first mount after login).
// Favorites source of truth: PostgreSQL via GET/POST/DELETE /api/favorites.
//
// NOTE: This component does NOT convert the profile page to a Client Component.
// It is imported as a leaf Client Component inside the Server Component page.

'use client';

import { useEffect, useState, useCallback, useContext } from 'react';
import { SchoolContext } from '@/context/SchoolContext';

interface YatUser {
  uid: string;
  contactId?: string | null;
  email?: string | null;
  firstName?: string | null;
  homeHsid?: string | null;
  role?: string;
}

interface FavoriteButtonProps {
  playerId: string;
  playerName: string;
  playerHsid: string;
}

function readYatUser(): YatUser | null {
  try {
    const raw = localStorage.getItem('yat-user');
    return raw ? (JSON.parse(raw) as YatUser) : null;
  } catch {
    localStorage.removeItem('yat-user');
    return null;
  }
}

function readIsSuperfan(): boolean {
  try {
    return localStorage.getItem('yat-plan') === 'superfan';
  } catch {
    return false;
  }
}

function openAccountDrawer() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
}

export default function FavoriteButton({
  playerId,
  playerName,
  playerHsid,
}: FavoriteButtonProps) {
  const schoolData = useContext(SchoolContext);
  const displayName = playerName || playerId;

  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'warn'>('success');

  const showToast = useCallback((msg: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 3500);
  }, []);

  useEffect(() => {
    const user = readYatUser();
    if (!user?.uid) {
      setIsFavorited(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`/api/favorites?uid=${encodeURIComponent(user.uid)}&scope=button`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const ids = Array.isArray(data?.playerIds) ? data.playerIds.map(String) : [];
        setIsFavorited(ids.includes(String(playerId)));
      })
      .catch(() => setIsFavorited(false))
      .finally(() => setIsLoading(false));
  }, [playerId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};

      // Plain login/register/session rehydrate events are not favorite events.
      // Only mark this button as favorited when the account drawer confirms that
      // this specific pending favorite was actually saved.
      if (
        detail.favoriteSaved === true &&
        detail.playerId &&
        String(detail.playerId) === String(playerId)
      ) {
        setIsFavorited(true);
        showToast(`${displayName} added to your favorites`);
        window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
      }
    };
    window.addEventListener('yat-auth-success', handler);
    return () => window.removeEventListener('yat-auth-success', handler);
  }, [playerId, displayName, showToast]);

  const handleClick = useCallback(async () => {
    const user = readYatUser();

    if (!user?.uid) {
      try {
        sessionStorage.setItem('pending_fav_pid', playerId);
        sessionStorage.setItem('pending_fav_name', displayName);
        sessionStorage.setItem('pending_fav_hsid', playerHsid);
      } catch {}
      openAccountDrawer();
      return;
    }

    const isSuperfan = readIsSuperfan();
    const currentHsid = schoolData?.hsid ?? playerHsid;
    const isSameSchool =
      user.homeHsid === currentHsid ||
      user.homeHsid === playerHsid;

    if (!isSuperfan && !isSameSchool) {
      if (!user.homeHsid) {
        showToast(
          'Account setup incomplete. Please sign out and sign back in to finish setting up your account.',
          'warn'
        );
        openAccountDrawer();
      } else {
        try {
          sessionStorage.setItem('pending_superfan', '1');
        } catch {}
        showToast(
          'Global favoriting requires a Superfan subscription. Upgrade in your account.',
          'warn'
        );
        openAccountDrawer();
      }
      return;
    }

    setIsLoading(true);
    try {
      if (isFavorited) {
        const res = await fetch('/api/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firebaseUid: user.uid, playerId }),
        });
        const data = await res.json();
        if (data?.success) {
          setIsFavorited(false);
          showToast(`${displayName} removed from favorites`, 'info');
          window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
        } else {
          showToast('Could not remove favorite. Please try again.', 'warn');
        }
      } else {
        const type = isSuperfan ? 'superfan' : 'fan';
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firebaseUid: user.uid,
            contactId: user.contactId,
            playerId,
            playerName: displayName,
            schoolId: playerHsid,
            type,
          }),
        });
        const data = await res.json();
        if (data?.success) {
          setIsFavorited(true);
          showToast(`${displayName} added to your favorites`);
          window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
        } else {
          showToast('Could not save favorite. Please try again.', 'warn');
        }
      }
    } catch {
      showToast('Network error. Please try again.', 'warn');
    } finally {
      setIsLoading(false);
    }
  }, [isFavorited, playerId, displayName, playerHsid, schoolData, showToast]);

  const toastColors: Record<typeof toastType, string> = {
    success: '#16a34a',
    info: 'var(--muted, #888)',
    warn: '#b8860b',
  };

  return (
    <>
      <button
        id="btnFanFav"
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isFavorited ? `Remove ${displayName} from favorites` : `Add ${displayName} to favorites`}
        aria-pressed={isFavorited}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          background: isFavorited ? 'rgba(200,169,110,.15)' : 'transparent',
          border: `1px solid ${isFavorited ? 'var(--accent, #c8a96e)' : 'rgba(255,255,255,.25)'}`,
          borderRadius: '6px',
          color: isFavorited ? 'var(--accent, #c8a96e)' : 'var(--fg, #f0f0f0)',
          font: '700 11px/1 Oswald, sans-serif',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          cursor: isLoading ? 'wait' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
          transition: 'all .2s ease',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <i
          className={isFavorited ? 'ri-star-fill' : 'ri-star-line'}
          style={{ fontSize: '14px' }}
        />
        {isFavorited ? 'FAVORITED' : 'FAVORITE'}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface, #1a1a1a)',
            border: `1px solid ${toastColors[toastType]}`,
            color: toastColors[toastType],
            padding: '10px 18px',
            borderRadius: '8px',
            font: '700 12px/1.4 Oswald, sans-serif',
            letterSpacing: '.06em',
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
