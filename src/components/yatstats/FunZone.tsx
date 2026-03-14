// src/components/yatstats/FunZone.tsx
//
// FunZone — the conceptual name for the player engagement zone.
//
// "FunZone" is the product term for the six-tab player-engagement navigation
// zone that appears on the player profile page and (in simplified CTA form)
// on the flip-card back.  The six tabs are:
//
//   SCHEDULE  |  STATS  |  NEWS  |  SOCIAL  |  CONNECT  |  UPLOAD
//
// Canonical tab definitions live in PlayerActionBar.tsx (PLAYER_ACTIONS).
//
// On the full profile page:
//   • Rendered as sticky .profile-tabs + .tab-content panels (PlayerActionBar variant="profile").
//   • JavaScript tab wiring is in the page's inline <script>.
//
// On the flip-card back:
//   • Rendered as compact .yat-back-action-bar + .yat-back-tab-panel panels
//     (PlayerActionBar variant="card-back").
//   • JavaScript tab wiring is in PlayerCard's inline interactivity script.
//
// This component is reserved for future cross-context FunZone markup (e.g. a
// shared engagement prompt, sponsor slot, or upgrade CTA that should appear
// in both the profile and the card back without duplication).

export default function FunZone() {
  // Intentionally renders nothing for now.
  // The tab navigation and panels are handled by the host page or card back.
  // See PlayerActionBar.tsx for the PLAYER_ACTIONS tab set.
  return null;
}
