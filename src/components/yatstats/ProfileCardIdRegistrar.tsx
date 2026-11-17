'use client';
// Tells the page's client code which card this profile address shows (see
// src/lib/profileCardIds.ts). Renders nothing.
import { useEffect } from 'react';
import { rememberProfileCard } from '@/lib/profileCardIds';

export default function ProfileCardIdRegistrar({ routeId, cardId }: { routeId: string; cardId: string }) {
  // Set during render so effects that run before this one already see it;
  // listeners hear about it once mounted.
  rememberProfileCard(routeId, cardId, false);
  useEffect(() => {
    rememberProfileCard(routeId, `${cardId}`, true);
  }, [routeId, cardId]);
  return null;
}
