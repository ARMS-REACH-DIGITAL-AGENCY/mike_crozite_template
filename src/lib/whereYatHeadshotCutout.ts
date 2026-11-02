// Only a generated alpha-PNG cutout may appear on a retired alumnus's business card.
// Legacy uploads were stored under "pending" as opaque JPEGs or PNGs; the hourly
// rembg job writes matching output objects without changing the original URLs.
const SOURCE = '/alumni-where-yat-now/pending/';
const CUTOUT = '/alumni-where-yat-now/headshot-cutouts/';

/** Return the published, background-removed PNG, never an opaque source photo. */
export function whereYatHeadshotCutoutUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    if (url.pathname.includes(CUTOUT)) {
      return url.pathname.toLowerCase().endsWith('.png') ? url.toString() : null;
    }
    const sourceAt = url.pathname.indexOf(SOURCE);
    if (sourceAt < 0) return null;
    const relative = url.pathname.slice(sourceAt + SOURCE.length);
    // Both historical upload paths: pending/{playerId}/business-headshots/uuid.jpg
    // and pending/{submissionId}/headshot/uuid.png.
    if (!/^[^/]+\/(?:headshot|business-headshots)\/[^/]+\.(?:jpe?g|webp|png)$/i.test(relative)) return null;
    url.pathname = url.pathname.slice(0, sourceAt) + CUTOUT +
      relative.replace(/\.(?:jpe?g|webp|png)$/i, '.png');
    return url.toString();
  } catch {
    return null;
  }
}
