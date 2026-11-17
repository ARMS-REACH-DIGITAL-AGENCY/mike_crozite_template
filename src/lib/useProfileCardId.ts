'use client';
// Client hook for src/lib/profileCardIds.ts: the card id behind a profile
// address. useSyncExternalStore re-checks the store right after subscribing,
// so a profile registered during a client-side navigation (the profile
// layout's registrar is a child, and child effects run before this parent
// subscribes) still re-renders the header and timeline with the card id.
// Before Nov 17 2026 that notice was lost: Jake Johnson's timeline asked S3
// for players/then/YAT162674.jpg instead of 309617.jpg and showed no photo.
import { useSyncExternalStore } from 'react';
import { getProfileCardVersion, profileCardIdFor, profileCardListeners, type ProfileCardPair } from './profileCardIds';

function subscribe(listener: () => void) {
  profileCardListeners.add(listener);
  return () => { profileCardListeners.delete(listener); };
}

export function useProfileCardId(routeId: string | null, initial?: ProfileCardPair | null): string | null {
  useSyncExternalStore(subscribe, getProfileCardVersion, () => 0);
  if (!routeId) return null;
  if (initial && initial.routeId === routeId) return initial.cardId;
  return profileCardIdFor(routeId);
}
