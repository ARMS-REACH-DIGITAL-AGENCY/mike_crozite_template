// Immediately refresh approved team logos in already-rendered search results.
// Fixed image paths can otherwise retain a previously loaded crest indefinitely.
export function refreshPublishedTeamLogo(teamId: string, revision: string = String(Date.now())): number {
  if (typeof document === 'undefined') return 0;
  const id = String(teamId || '').trim();
  if (!/^\d{1,10}$/.test(id)) return 0;
  const stamp = encodeURIComponent(revision.replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || String(Date.now()));
  const logoPrefix = `/api/team-logo/${id}`;
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  let refreshed = 0;
  for (const image of images) {
    const assigned = image.dataset.teamLogoId === id;
    const src = image.getAttribute('src') || '';
    const known = src.includes(logoPrefix) || src.includes(`/teams-web/${id}.webp`) || src.includes(`/teams/${id}.png`);
    if (!assigned && !known) continue;
    // A failed prior request may have replaced the image with a generic crest.
    // The data attribute persists even when its src has been replaced.
    image.onerror = () => {
      image.onerror = null;
      image.src = '/img/yatstats-logo-circle.png';
    };
    image.src = `${logoPrefix}?rev=${stamp}`;
    refreshed += 1;
  }
  return refreshed;
}
