// One team-logo policy for every school hub. Team IDs are identities, NOT
// franchise-successor pointers. Never follow currentteamid for artwork.
export const TEAM_LOGO_S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
export const TEAM_LOGO_FALLBACK = '/img/ys-crest.png';

// Verified equivalent artwork for the SAME club identity only. Try the
// exact team ID first, so a newly published historically correct logo wins.
// 10032's legacy currentteamid=20 is the Yankees: deliberately NOT followed.
const SAME_CLUB_ART: Readonly<Record<string, readonly string[]>> = {
  '10032': ['4'],  // Baltimore Orioles (2011 draft), NOT NY Yankees
  '231': ['32'],   // Washington Nationals
  '21': ['37'],   // Oakland Athletics / Athletics (approved club mark)
};

export function normalizeTeamLogoId(value: unknown): string | null {
  const id = String(value ?? '').trim();
  return /^\d{1,10}$/.test(id) && !/^0+$/.test(id) ? id : null;
}

// The only URL contract for consumers. The server resolves actual published
// artwork with fallback and cache: a new verified upload needs NO code edit.
export function teamLogoPath(teamId: unknown): string | null {
  const id = normalizeTeamLogoId(teamId);
  return id ? `/api/team-logo/${id}` : null;
}

export function teamLogoIdFromAssetKey(key: unknown): string | null {
  const text = String(key ?? '');
  const match = /^(?:teams\/(?:cutouts\/)?(\d{1,10})\.(?:png|jpe?g|webp)|teams-web\/(\d{1,10})\.webp)$/i.exec(text);
  return match ? normalizeTeamLogoId(match[1] || match[2]) : null;
}

export function teamLogoAssetKeys(teamId: unknown): string[] {
  const id = normalizeTeamLogoId(teamId);
  if (!id) return [];
  const ids = [id, ...(SAME_CLUB_ART[id] ?? [])];
  return ids.flatMap((value) => [
    `teams-web/${value}.webp`,
    `teams/cutouts/${value}.png`,
    `teams/${value}.png`,
    `teams/${value}.jpg`,
    `teams/${value}.jpeg`,
    `teams/${value}.webp`,
    `teams/${value}.PNG`,
    `teams/${value}.JPG`,
  ]);
}

export function teamLogoAssetUrls(teamId: unknown): string[] {
  return teamLogoAssetKeys(teamId).map((key) => `${TEAM_LOGO_S3_BASE}/${key}`);
}
