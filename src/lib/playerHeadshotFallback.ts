import { getPlayerHeadshotSources, PLAYER_HEADSHOT_FALLBACK_URL } from './playerImage';

type HeadshotState = {
  signature: string;
  sources: string[];
  index: number;
  exhausted: boolean;
  onError: () => void;
};

// Both the React strip and its DOM mirror use this one handler. Keeping
// progress on the element also survives ordinary mirror synchronizations
// without retrying a failed cutout on every src mutation.
const imageStates = new WeakMap<HTMLImageElement, HeadshotState>();

function applySource(image: HTMLImageElement, state: HeadshotState): void {
  const src = state.sources[state.index];
  image.dataset.silhouetteFallback = src === PLAYER_HEADSHOT_FALLBACK_URL ? 'true' : 'false';
  const visibility = state.exhausted ? 'hidden' : '';
  if (image.style.visibility !== visibility) image.style.visibility = visibility;
  if (image.getAttribute('src') !== src) image.setAttribute('src', src);
}

/**
 * Own a circle's headshot fallback once, including failures that happened
 * before hydration. Do not attach another React onError to these images:
 * one native error event must advance exactly one source.
 */
export function syncPlayerHeadshot(
  image: HTMLImageElement,
  playerId: string,
  headshotUrl?: string | null,
): void {
  const sources = getPlayerHeadshotSources(playerId, headshotUrl);
  const signature = JSON.stringify(sources);
  let state = imageStates.get(image);

  if (!state || state.signature !== signature) {
    const next: HeadshotState = {
      signature,
      sources,
      index: 0,
      exhausted: false,
      onError: () => {
        // A queued failure for an older src can arrive after React or the
        // mirror selected another player/source. Ignore it while the new
        // image is loading, or when that image already loaded correctly.
        if (imageStates.get(image) !== next || !image.complete || image.naturalWidth > 0) return;
        if (image.getAttribute('src') !== next.sources[next.index] || next.exhausted) return;

        if (next.index < next.sources.length - 1) next.index += 1;
        else next.exhausted = true;
        applySource(image, next);
      },
    };
    imageStates.set(image, next);
    state = next;
  }

  image.dataset.headshotManaged = 'true';
  image.onerror = state.onError;
  applySource(image, state);
  // SSR images can fail before any event handler exists. A successful
  // existing cutout is left untouched.
  if (image.complete && image.naturalWidth === 0) state.onError();
}
