// One canonical source for the TBC Players feed. Never expose the URL in API responses.
// Store the credential in a server-only module; this file must not be imported by client components.
import 'server-only';
export const TBC_PLAYER_FEED_URL = "https://www.thebaseballcube.com/data/feed/yatstats/players/?pw=yattbc";
