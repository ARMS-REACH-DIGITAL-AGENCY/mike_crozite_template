'use client';

import { useState, useCallback } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  className: string;
  fallbackSrc?: string;
  placeholderSrc?: string;
  style?: React.CSSProperties;
}

/**
 * SafeImage — handles image loading with a multi-step fallback chain:
 * 1. Try the primary src
 * 2. Try the fallbackSrc (e.g., alternate file extension)
 * 3. Show the placeholder (silhouette for players, crest for schools)
 */
export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  placeholderSrc = "/img/player-silhouette.png",
  style,
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failCount, setFailCount] = useState(0);

  const handleError = useCallback(() => {
    if (failCount === 0 && fallbackSrc) {
      // First failure: try alternate extension
      setCurrentSrc(fallbackSrc);
      setFailCount(1);
    } else {
      // Second failure (or no fallback): show placeholder
      setCurrentSrc(placeholderSrc);
      setFailCount(2);
    }
  }, [failCount, fallbackSrc, placeholderSrc]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      onError={handleError}
    />
  );
}
