// Use the school gallery's actual roster membership for Back to Flip Card.
// The header is above the nested PlayerProfileContext provider.
export type PlayerGalleryView = 'active' | 'alltime' | 'current';

export function selectProfileGalleryView(
  playerId: string | null | undefined,
  activePlayerIds: readonly string[],
  currentPlayerIds: readonly string[],
): PlayerGalleryView {
  const id = String(playerId || '').trim();
  if (id && currentPlayerIds.includes(id)) return 'current';
  if (id && activePlayerIds.includes(id)) return 'active';
  return 'alltime';
}

export function flipCardReturnHref(
  schoolUrl: string | undefined,
  hsid: string,
  playerId: string,
  view: PlayerGalleryView,
): string {
  const base = (schoolUrl || `/${encodeURIComponent(hsid)}`).replace(/\/$/, '');
  const id = encodeURIComponent(playerId);
  return `${base}?view=${view}&player=${id}#player-${id}`;
}
