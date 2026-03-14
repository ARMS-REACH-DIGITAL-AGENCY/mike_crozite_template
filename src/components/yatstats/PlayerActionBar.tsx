// src/components/yatstats/PlayerActionBar.tsx
// FunZone canonical tab-action bar.
//
// PLAYER_ACTIONS is the single source of truth for the six player-engagement
// tabs that make up the FunZone.  Both the full player profile page and the
// flip-card back reference this array so the tab set is never duplicated.
//
// Tab-ID mapping:
//   profileTab   cardTab     Description
//   ──────────   ───────     ──────────────────────────────────────────────
//   overview     schedule    Game log / schedule feed
//   stats        stats       Season + career stats tables
//   news         news        News clips and video highlights
//   social       social      Social-media share buttons
//   mentor       connect     Mentorship marketplace CTA
//   gallery      upload      Chronological career photo gallery + upload CTA
//
// variant='profile'   → sticky .profile-tab divs with data-profile-tab attr
// variant='card-back' → compact .yat-back-action-btn buttons with data-card-tab attr

export const PLAYER_ACTIONS = [
  {
    profileTab: "overview",
    cardTab:    "schedule",
    icon:       "ri-calendar-schedule-line",
    label:      "GAME LOG",
    shortLabel: "Schedule",
  },
  {
    profileTab: "stats",
    cardTab:    "stats",
    icon:       "ri-bar-chart-2-line",
    label:      "STATS",
    shortLabel: "Stats",
  },
  {
    profileTab: "news",
    cardTab:    "news",
    icon:       "ri-article-line",
    label:      "NEWS & VIDEOS",
    shortLabel: "News",
  },
  {
    profileTab: "social",
    cardTab:    "social",
    icon:       "ri-share-line",
    label:      "SOCIAL MEDIA",
    shortLabel: "Social",
  },
  {
    profileTab: "mentor",
    cardTab:    "connect",
    icon:       "ri-group-line",
    label:      "MENTORSHIP MARKETPLACE",
    shortLabel: "Connect",
  },
  {
    profileTab: "gallery",
    cardTab:    "upload",
    icon:       "ri-upload-2-line",
    label:      "PHOTO GALLERY",
    shortLabel: "Upload",
  },
] as const;

// ── Derived types ─────────────────────────────────────────────────────────────
export type ProfileTabId = (typeof PLAYER_ACTIONS)[number]["profileTab"];
export type CardTabId    = (typeof PLAYER_ACTIONS)[number]["cardTab"];

// ── Component ─────────────────────────────────────────────────────────────────

interface ProfileVariantProps {
  variant: "profile";
  /** Which tab is active on initial server render (default: "overview"). */
  activeTab?: ProfileTabId;
}

interface CardBackVariantProps {
  variant: "card-back";
  /** Which tab is active on initial server render (default: "stats"). */
  activeTab?: CardTabId;
}

type PlayerActionBarProps = ProfileVariantProps | CardBackVariantProps;

/**
 * Renders the FunZone tab bar for either the player profile page or the
 * flip-card back.  All interactivity is wired by the host page's inline
 * <script> (no "use client" needed here).
 */
export default function PlayerActionBar(props: PlayerActionBarProps) {
  if (props.variant === "profile") {
    const activeTab = props.activeTab ?? "overview";
    return (
      <div className="profile-tabs" role="tablist">
        {PLAYER_ACTIONS.map(({ profileTab, label }) => (
          <div
            key={profileTab}
            role="tab"
            className={`profile-tab${profileTab === activeTab ? " active" : ""}`}
            data-profile-tab={profileTab}
            tabIndex={0}
          >
            {label}
          </div>
        ))}
      </div>
    );
  }

  // variant === "card-back"
  const activeTab = props.activeTab ?? "stats";
  return (
    <div className="yat-back-action-bar" role="tablist">
      {PLAYER_ACTIONS.map(({ cardTab, icon, shortLabel }) => (
        <button
          key={cardTab}
          type="button"
          role="tab"
          className={`yat-back-action-btn${cardTab === activeTab ? " active" : ""}`}
          data-card-tab={cardTab}
          aria-label={shortLabel}
          aria-selected={cardTab === activeTab}
        >
          <i className={icon} />
          <span className="yat-back-action-label">{shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
