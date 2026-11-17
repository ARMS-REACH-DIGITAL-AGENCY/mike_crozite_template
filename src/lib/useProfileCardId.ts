'use client';
// Client hook for src/lib/profileCardIds.ts: the card id behind a profile
// address, re-rendering when the profile layout registers a new one.
import { useEffect, useReducer } from 'react';
import { profileCardIdFor, profileCardListeners, type ProfileCardPair } from './profileCardIds';

export function useProfileCardId(routeId: string | null, initial?: ProfileCardPair | null): string | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    profileCardListeners.add(rerender);
    return () => { profileCardListeners.delete(rerender); };
  }, []);
  if (!routeId) return null;
  if (initial && initial.routeId === routeId) return initial.cardId;
  return profileCardIdFor(routeId);
}
