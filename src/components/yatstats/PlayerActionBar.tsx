// src/components/yatstats/PlayerActionBar.tsx
// Reusable icon+label action row for player profile page and player card back.
// Variant 'profile'   → sticky buttons, wired to profile-tab JS via data-profile-tab.
// Variant 'card-back' → nav anchor links to the player profile page with hash tabs.

import type { JSX } from 'react';

// ─── SVG icon definitions (outline style, currentColor) ─────────────────────

function ScheduleIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="12" y2="14"/>
      <line x1="8" y1="18" x2="14" y2="18"/>
    </svg>
  );
}

function StatsIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="14" width="4" height="7" rx="1"/>
      <rect x="10" y="9" width="4" height="12" rx="1"/>
      <rect x="17" y="4" width="4" height="17" rx="1"/>
    </svg>
  );
}

function NewsIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/>
      <path d="M14 2v5h5"/>
      <line x1="2" y1="12" x2="10" y2="12"/>
      <line x1="2" y1="16" x2="10" y2="16"/>
      <line x1="2" y1="20" x2="8" y2="20"/>
    </svg>
  );
}

function SocialIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function ConnectIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function UploadIcon(): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <polyline points="8 12 12 8 16 12"/>
      <line x1="12" y1="8" x2="12" y2="17"/>
    </svg>
  );
}

// ─── Centralised action definitions ─────────────────────────────────────────

export const PLAYER_ACTIONS = [
  { id: 'schedule', tabId: 'overview', label: 'Schedule', Icon: ScheduleIcon },
  { id: 'stats',    tabId: 'stats',    label: 'Stats',    Icon: StatsIcon    },
  { id: 'news',     tabId: 'news',     label: 'News',     Icon: NewsIcon     },
  { id: 'social',   tabId: 'social',   label: 'Social',   Icon: SocialIcon   },
  { id: 'connect',  tabId: 'mentor',   label: 'Connect',  Icon: ConnectIcon  },
  { id: 'upload',   tabId: 'gallery',  label: 'Upload',   Icon: UploadIcon   },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

interface PlayerActionBarProps {
  /** 'profile'   → sticky button row wired to the profile-tab JS (player detail page).
   *  'card-back' → nav link row pointing to player profile with hash fragments. */
  variant: 'profile' | 'card-back';
  /** Initially-active tab on first render. JS takes over for profile variant. */
  activeTab?: string;
  /** Required for card-back variant: used to build profile href. */
  playerId?: string;
  slug?: string;
  resolvedHsid?: string;
}

export default function PlayerActionBar({
  variant,
  activeTab = 'overview',
  playerId,
  slug,
  resolvedHsid,
}: PlayerActionBarProps): JSX.Element {
  const isProfile  = variant === 'profile';
  const isCardBack = variant === 'card-back';

  const barClass = [
    'yat-action-bar',
    // 'profile-tabs' kept for JS height measurement (--tabBarH CSS var)
    isProfile  ? 'yat-action-bar--profile profile-tabs' : '',
    isCardBack ? 'yat-action-bar--card-back'            : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={barClass} role={isProfile ? 'tablist' : undefined}
      aria-label={isCardBack ? 'Player actions' : undefined}>
      {PLAYER_ACTIONS.map(({ id, tabId, label, Icon }, idx) => {
        const isActive = isProfile && tabId === activeTab;
        const itemClass = [
          'yat-action-item',
          // 'profile-tab' kept for JS querySelectorAll compatibility
          isProfile ? 'profile-tab' : '',
          isActive  ? 'active'      : '',
        ].filter(Boolean).join(' ');

        if (isProfile) {
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className={itemClass}
              data-profile-tab={tabId}
              aria-selected={isActive}
              tabIndex={0}
              style={idx < PLAYER_ACTIONS.length - 1 ? { borderRight: '1px solid var(--line)' } : undefined}
            >
              <span className="yat-action-icon"><Icon /></span>
              <span className="yat-action-label">{label}</span>
            </button>
          );
        }

        // card-back: anchor links to player profile with hash fragment
        const href = resolvedHsid && playerId && slug
          ? `/${resolvedHsid}/player/${playerId}/${slug}#tab-${tabId}`
          : '#';

        return (
          <a
            key={id}
            href={href}
            className={itemClass}
            aria-label={label}
            style={idx < PLAYER_ACTIONS.length - 1 ? { borderRight: '1px solid var(--line)' } : undefined}
          >
            <span className="yat-action-icon"><Icon /></span>
            <span className="yat-action-label">{label}</span>
          </a>
        );
      })}
    </div>
  );
}
