// The timeline can hydrate before the nested player layout mounts its drawer.
// Keep the latest click until that player's drawer can receive it.
export const STORY_DRAWER_OPEN_EVENT = 'yat:story-drawer-open';

export type StoryDrawerOpenDetail = { playerId?: string; year?: number | null };
type StoryDrawerRequest = StoryDrawerOpenDetail & { playerId: string; pathname: string; owner: symbol };

let pendingOpen: StoryDrawerRequest | null = null;

export function openStoryDrawer(detail: StoryDrawerOpenDetail & { playerId: string }, owner: symbol) {
  if (typeof window === 'undefined') return;
  const playerId = String(detail.playerId || '').trim();
  if (!playerId) return;
  const request = { playerId, year: detail.year ?? null };
  pendingOpen = { ...request, pathname: window.location.pathname, owner };
  window.dispatchEvent(new CustomEvent<StoryDrawerOpenDetail>(STORY_DRAWER_OPEN_EVENT, { detail: request }));
}

export function cancelPendingStoryDrawerOpen(owner: symbol) {
  // An old timeline's delayed cleanup cannot erase a newer timeline's click.
  if (pendingOpen?.owner === owner) pendingOpen = null;
}

export function takePendingStoryDrawerOpen(playerId: string): StoryDrawerOpenDetail | null {
  if (typeof window === 'undefined' || !pendingOpen) return null;
  // A request from a departed page must never open on the new destination.
  if (pendingOpen.pathname !== window.location.pathname) {
    pendingOpen = null;
    return null;
  }
  // A stale player layout cannot consume a newer player's pending click.
  if (pendingOpen.playerId !== playerId) return null;
  const { year, playerId: requestedPlayerId } = pendingOpen;
  pendingOpen = null;
  return { playerId: requestedPlayerId, year };
}
