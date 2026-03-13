// src/components/yatstats/PlayerActionBar.tsx
// Reusable player action/tab bar — used on the player profile page and player card back.
// Action definitions live here so they are never duplicated across contexts.

export interface ActionDef {
  id: string;
  label: string;
  icon: string; // Remixicon class
}

export const PLAYER_ACTIONS: ActionDef[] = [
  { id: 'overview', label: 'Schedule', icon: 'ri-calendar-2-line'       },
  { id: 'stats',    label: 'Stats',    icon: 'ri-bar-chart-grouped-line' },
  { id: 'news',     label: 'News',     icon: 'ri-newspaper-line'         },
  { id: 'social',   label: 'Social',   icon: 'ri-share-circle-line'      },
  { id: 'mentor',   label: 'Connect',  icon: 'ri-group-line'             },
  { id: 'gallery',  label: 'Upload',   icon: 'ri-image-add-line'         },
];

interface Props {
  /** Which tab is visually active on initial render. Defaults to 'overview'. */
  activeTab?: string;
  /** 'profile' (full-page, sticky) vs 'card' (compact, used on player card back). */
  variant?: 'profile' | 'card';
}

/**
 * PlayerActionBar
 *
 * Mobile-first action/navigation row.  Icons sit above centred labels with
 * generous touch targets.  Active state is indicated by a gold underline and
 * full-weight label colour.  Colour inversion for dark/light themes is driven
 * entirely by CSS variables — no inline colour overrides.
 *
 * Tab switching behaviour is handled by the page-level inline script that
 * listens for clicks on `[data-profile-tab]` elements.
 */
export default function PlayerActionBar({ activeTab = 'overview', variant = 'profile' }: Props) {
  return (
    <div
      className={`pab${variant === 'card' ? ' pab--card' : ''}`}
      role="tablist"
      aria-label="Player actions"
    >
      {PLAYER_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          role="tab"
          className={`pab-btn${activeTab === action.id ? ' active' : ''}`}
          data-profile-tab={action.id}
          aria-selected={activeTab === action.id}
          aria-controls={`tab-${action.id}`}
          tabIndex={activeTab === action.id ? 0 : -1}
        >
          <i className={`pab-icon ${action.icon}`} aria-hidden="true" />
          <span className="pab-label">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
