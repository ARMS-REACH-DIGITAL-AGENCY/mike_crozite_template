// Profile addresses carry the player's YAT ID (/player/YAT109763/beau-brieske),
// but the gallery, favorites and images still key a player by his card's own
// id (often the Baseball Cube number). Client code that reads the player id
// from the address maps it back to the card id here.
//
// The school layout passes the first page's pair down (server and browser
// render the same thing); the profile layout registers each profile the
// browser opens afterwards (client-side navigation keeps the school layout).
export type ProfileCardPair = { routeId: string; cardId: string };

const known = new Map<string, string>();
/** Re-render hooks (see useProfileCardId.ts). Plain module: no React here, so
 *  server code (analytics.ts in the root layout) may import it. */
export const profileCardListeners = new Set<() => void>();
// Bumped on every new pair; the hook re-reads it after subscribing, so a pair
// registered before a parent subscribed (child effects run first) is not lost.
let profileCardVersion = 0;
export function getProfileCardVersion(): number { return profileCardVersion; }

/** Browser only: remember which card a profile address shows. */
export function rememberProfileCard(routeId: string, cardId: string, notify = true): void {
  if (typeof window === 'undefined' || !routeId || !cardId || known.get(routeId) === cardId) return;
  known.set(routeId, cardId);
  profileCardVersion += 1;
  if (notify) profileCardListeners.forEach((listener) => listener());
}

/** The card id behind a profile address id (the id itself when unknown). */
export function profileCardIdFor(routeId: string): string {
  return (routeId && known.get(routeId)) || routeId;
}
