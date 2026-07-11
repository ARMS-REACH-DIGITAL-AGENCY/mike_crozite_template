'use client';

import { useEffect, useState } from 'react';
import AccountDrawerContent from '@/components/AccountDrawer';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';

interface AccountDrawerProps {
  subdomain: string;
}

type AccountTab = 'signin' | 'register';

type HomeIdentity = {
  uid?: string | null;
  email?: string | null;
  contactId?: string | null;
  firstName?: string | null;
  homeHsid?: string | null;
  homeSchoolName?: string | null;
  homeSchoolLocation?: string | null;
  homeMicrositeUrl?: string | null;
  role?: string | null;
  plan?: string | null;
};

const S3_SCHOOLS_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/schools';

function normalizeMicrositeUrl(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return '';
  return raw.replace(/\/+$/, '');
}

function slugifySchoolName(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildHomeHref(identity: HomeIdentity): string {
  const canonical = normalizeMicrositeUrl(identity.homeMicrositeUrl);
  if (canonical) return canonical;

  const hsid = String(identity.homeHsid || '').trim();
  if (!hsid) return '';

  const schoolSlug = slugifySchoolName(identity.homeSchoolName);
  const statePart = String(identity.homeSchoolLocation || '').split(',')[1] || '';
  const stateSlug = statePart.toLowerCase().trim();

  if (schoolSlug && stateSlug) {
    return `https://${schoolSlug}.${stateSlug}.yatstats.com/${encodeURIComponent(hsid)}`;
  }

  return `https://yatstats.com/${encodeURIComponent(hsid)}`;
}

function hideHomeIdentity() {
  const topbarLink = document.getElementById('topbarHomeCrestLink');
  const drawerLink = document.getElementById('drawerHomeSchoolLink');

  topbarLink?.setAttribute('hidden', '');
  if (topbarLink instanceof HTMLElement) topbarLink.style.display = 'none';
  if (drawerLink instanceof HTMLElement) drawerLink.style.display = 'none';
}

function applyHomeIdentity(identity: HomeIdentity) {
  const homeHsid = String(identity.homeHsid || '').trim();
  const homeHref = buildHomeHref(identity);

  if (!homeHsid || !homeHref) {
    hideHomeIdentity();
    return;
  }

  const crestUrl = `${S3_SCHOOLS_BASE}/${encodeURIComponent(homeHsid)}.png`;
  const topbarLink = document.getElementById('topbarHomeCrestLink') as HTMLAnchorElement | null;
  const topbarImg = document.getElementById('topbarHomeCrestImg') as HTMLImageElement | null;
  const drawerLink = document.getElementById('drawerHomeSchoolLink') as HTMLAnchorElement | null;
  const drawerImg = document.getElementById('drawerHomeCrestImg') as HTMLImageElement | null;

  if (topbarLink) {
    topbarLink.href = homeHref;
    topbarLink.removeAttribute('hidden');
    topbarLink.style.display = '';
  }

  if (topbarImg) {
    topbarImg.src = crestUrl;
    topbarImg.alt = identity.homeSchoolName
      ? `${identity.homeSchoolName} home school crest`
      : 'My home school crest';
    topbarImg.onerror = () => {
      topbarImg.onerror = null;
      topbarImg.src = CREST_FALLBACK_PATH;
    };
  }

  if (drawerLink) {
    drawerLink.href = homeHref;
    drawerLink.style.display = '';
  }

  if (drawerImg) {
    drawerImg.src = crestUrl;
    drawerImg.alt = identity.homeSchoolName
      ? `${identity.homeSchoolName} home school crest`
      : 'Home school crest';
    drawerImg.onerror = () => {
      drawerImg.onerror = null;
      drawerImg.src = CREST_FALLBACK_PATH;
    };
  }

  try {
    const current = JSON.parse(localStorage.getItem('yat-user') || '{}') as HomeIdentity;
    localStorage.setItem(
      'yat-user',
      JSON.stringify({
        ...current,
        ...identity,
        homeHsid,
        homeMicrositeUrl: homeHref,
      })
    );

    if (identity.plan) localStorage.setItem('yat-plan', identity.plan);
  } catch {}
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  const [activeTab, setActiveTab] = useState<AccountTab>('register');

  useEffect(() => {
    let cancelled = false;

    const applyStoredIdentity = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('yat-user') || 'null') as HomeIdentity | null;
        if (stored?.homeHsid) applyHomeIdentity(stored);
      } catch {}
    };

    const hydrateFromServerSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await response.json();

        if (cancelled) return;

        if (data?.authenticated && data?.session?.uid) {
          applyHomeIdentity(data.session as HomeIdentity);
        } else {
          hideHomeIdentity();
        }
      } catch {
        if (!cancelled) applyStoredIdentity();
      }
    };

    const onAuthSuccess = (event: Event) => {
      const detail = (event as CustomEvent<HomeIdentity>).detail;
      if (detail?.homeHsid) applyHomeIdentity(detail);
      void hydrateFromServerSession();
    };

    const onSignOut = () => hideHomeIdentity();

    applyStoredIdentity();
    void hydrateFromServerSession();

    window.addEventListener('yat-auth-success', onAuthSuccess);
    window.addEventListener('yat-sign-out', onSignOut);

    return () => {
      cancelled = true;
      window.removeEventListener('yat-auth-success', onAuthSuccess);
      window.removeEventListener('yat-sign-out', onSignOut);
    };
  }, []);

  const switchTab = (tab: AccountTab) => {
    setActiveTab(tab);
    window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
  };

  return (
    <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
      <div
        role="tablist"
        aria-label="Account access"
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          minHeight: '48px',
          gap: 0,
        }}
      >
        <button
          type="button"
          id="acctTabJoinReact"
          role="tab"
          aria-selected={activeTab === 'register'}
          onClick={() => switchTab('register')}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '12px 4px',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'register' ? '2px solid var(--gold)' : '2px solid transparent',
            color: activeTab === 'register' ? 'var(--gold)' : 'var(--fg)',
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: '15px',
            letterSpacing: '.06em',
          }}
        >
          JOIN
        </button>

        <button
          type="button"
          id="acctTabLoginReact"
          role="tab"
          aria-selected={activeTab === 'signin'}
          onClick={() => switchTab('signin')}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '12px 4px',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'signin' ? '2px solid var(--gold)' : '2px solid transparent',
            color: activeTab === 'signin' ? 'var(--gold)' : 'var(--muted)',
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: '15px',
            letterSpacing: '.06em',
          }}
        >
          LOG IN
        </button>

        <button
          type="button"
          id="closeAccount"
          aria-label="Close account drawer"
          style={{
            width: '48px',
            height: '48px',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--line)',
            color: 'var(--muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <i className="ri-close-line" style={{ fontSize: '18px' }} />
        </button>
      </div>

      <AccountDrawerContent subdomain={subdomain} />
    </aside>
  );
}
