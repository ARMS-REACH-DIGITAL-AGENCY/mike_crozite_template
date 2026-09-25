'use client';

// The flip card front's photo, as a real <img> instead of a CSS background
// so the browser lazy-loads it natively: only cards on or near the screen
// download their photo, and the server-rendered HTML already carries the
// tag, so the first screen's photos start loading before any JS runs. (As a
// background on every card, a gallery tab downloaded every alum's photo up
// front -- all 136 of Hamilton's, 191MB of originals.)
//
// Tries each source in order (card-size WebP, then the original); if all
// fail it renders nothing and the silhouette behind it on .yat-bg shows.
// alt is empty on purpose: the name is already on the card as text, and an
// empty alt keeps a failed load from drawing a broken-image icon.
import { useEffect, useRef, useState } from 'react';

export default function CardPhoto({ srcs }: { srcs: string[] }) {
  const [index, setIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const src = srcs[index];

  // A load that failed before hydration never reached onError; replay it
  // so the next source is tried.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
      img.dispatchEvent(new Event('error'));
    }
  }, []);

  if (!src) return null;
  return (
    <img
      ref={imgRef}
      key={src}
      className="yat-bg-photo"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
