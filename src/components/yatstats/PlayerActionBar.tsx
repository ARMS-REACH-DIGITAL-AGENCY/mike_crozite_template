// src/components/yatstats/PlayerActionBar.tsx
// Reusable mobile-first action/tab row for the player profile page and player card back.
// Action definitions are centralized here; consumers only pass active id and optional hrefs.

export const PLAYER_ACTIONS = [
  { id: 'schedule', label: 'Schedule', icon: 'ri-calendar-event-line', tab: 'overview' },
  { id: 'stats',    label: 'Stats',    icon: 'ri-bar-chart-2-line',    tab: 'stats'    },
  { id: 'news',     label: 'News',     icon: 'ri-newspaper-line',      tab: 'news'     },
  { id: 'social',   label: 'Social',   icon: 'ri-share-circle-line',   tab: 'social'   },
  { id: 'connect',  label: 'Connect',  icon: 'ri-team-line',           tab: 'mentor'   },
  { id: 'upload',   label: 'Upload',   icon: 'ri-image-add-line',      tab: 'gallery'  },
] as const;

export type PlayerActionId = (typeof PLAYER_ACTIONS)[number]['id'];

export interface PlayerActionBarProps {
  /** Currently active action id — sets initial active styling; JS takes over on profile page */
  active?: PlayerActionId;
  /**
   * Per-action href values. When provided for an action the element renders as an <a>;
   * otherwise it renders as a <button type="button">.
   * Use in card-back context to link to the player profile URL with hash targets.
   */
  hrefs?: Partial<Record<PlayerActionId, string>>;
  /**
   * 'card-back' — compact layout for use inside a flipped player card.
   * 'profile'   — (default) sticky positioning for the player profile page.
   */
  variant?: 'profile' | 'card-back';
}

export default function PlayerActionBar({
  active,
  hrefs,
  variant = 'profile',
}: PlayerActionBarProps) {
  const isCardBack = variant === 'card-back';
  const barClass = isCardBack
    ? 'yat-action-bar yat-action-bar--card'
    : 'yat-action-bar';

  return (
    <nav
      className={barClass}
      role={isCardBack ? 'navigation' : 'tablist'}
      aria-label="Player actions"
    >
      {PLAYER_ACTIONS.map(({ id, label, icon, tab }) => {
        const isActive = id === active;
        const href = hrefs?.[id];
        const btnClass = `yat-action-btn${isActive ? ' active' : ''}`;

        return href ? (
          // Card-back context: navigation links to player profile sections
          <a key={id} href={href} className={btnClass} aria-label={label} data-profile-tab={tab}>
            <i className={icon} aria-hidden="true" />
            <span className="yat-action-label">{label}</span>
          </a>
        ) : (
          // Profile page context: tab buttons managed by JS
          <button
            key={id}
            type="button"
            role="tab"
            className={btnClass}
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            aria-label={label}
            data-profile-tab={tab}
          >
            <i className={icon} aria-hidden="true" />
            <span className="yat-action-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
