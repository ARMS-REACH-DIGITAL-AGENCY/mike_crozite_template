// src/lib/storyAssets.ts
// Where story photos live (S3), without pulling in the upload code.
export const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
export const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

// Verified, identical-team artwork substitutions for missing Draft Day
// story assets. Never rewrite a player's historic TBC team ID in the database.
// TBC 10032 is Baltimore Orioles, despite its incorrect legacy successor
// currentteamid=20 (New York Yankees). Its true same-team artwork is ID 4.
// TBC 231 and 32 both denote Washington Nationals.
// Oakland Athletics ID 21 has the existing approved Athletics alias to 37.
const STORY_LOGO_ASSET_ALIASES: Readonly<Record<string, string>> = {
  'teams/10032.png': 'teams/4.png',
  'teams-web/10032.webp': 'teams-web/4.webp',
  'teams/231.png': 'teams/32.png',
  'teams-web/231.webp': 'teams-web/32.webp',
  'teams/21.png': 'teams/37.png',
  'teams-web/21.webp': 'teams-web/37.webp',
};

// These identities have no public original OR 400px WebP as of 2026-11-10.
// A modern successor logo would misrepresent their historical team.
// Show the site's existing YAT?STATS crest until period-correct art is
// verified and uploaded under their exact historic TBC IDs.
// This fallback is deliberately scoped to Draft Day logo paths only.
const HISTORIC_LOGOS_AWAITING_ASSETS = new Set([
  '1',     // Anaheim Angels
  '12',    // Florida Marlins
  '18',    // Montreal Expos
  '31',    // California Angels
  '10011', // Kansas City Athletics
  '10013', // Milwaukee Braves
  '10014', // New York Giants
  '10018', // Seattle Pilots
]);
const STORY_CREST_FALLBACK = '/img/ys-crest.png';

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const historicLogo = /^(?:teams\/([0-9]+)\.png|teams-web\/([0-9]+)\.webp)$/.exec(key);
  if (historicLogo && HISTORIC_LOGOS_AWAITING_ASSETS.has(historicLogo[1] || historicLogo[2]))
    return STORY_CREST_FALLBACK;
  const assetKey = STORY_LOGO_ASSET_ALIASES[key] || key;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${assetKey.split('/').map(encodeURIComponent).join('/')}`;
}
