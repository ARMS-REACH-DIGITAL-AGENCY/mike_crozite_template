/**
 * A photo's published storage key is immutable even when its person is
 * assigned a new YAT identity. Resolve approved, recorded asset keys rather
 * than guessing players/then/{currentPlayerId}.jpg.
 *
 * Callers must only pass descriptions from approved media_upload records.
 * The contribution publisher writes published_assets after S3 succeeds.
 */
export function approvedPublishedPlayerImageKey(
  description: string | null | undefined,
  role: 'flip_card' | 'back_hero' | 'headshot',
): string | null {
  if (!description) return null;
  let assets: unknown;
  try {
    const data: unknown = JSON.parse(description);
    assets = data && typeof data === 'object'
      ? (data as { published_assets?: unknown }).published_assets : null;
  } catch {
    return null;
  }
  if (!Array.isArray(assets)) return null;
  const patterns: Record<typeof role, RegExp> = {
    flip_card: /^players\/then\/[A-Za-z0-9_-]+\.jpg$/,
    back_hero: /^players\/back\/[A-Za-z0-9_-]+\.jpg$/,
    headshot: /^players\/season-headshots\/[A-Za-z0-9_-]+_[0-9]{4}\.jpg$/,
  };
  const key = assets.find((value): value is string =>
    typeof value === 'string' && patterns[role].test(value));
  return key ?? null;
}
