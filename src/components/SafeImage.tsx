'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string | null;
  placeholderSrc?: string;
  style?: React.CSSProperties;
}

function normalizeCandidate(s?: string | null) {
  if (!s) return '';
  const t = String(s).trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return '';
  return t;
}

function absolutize(s: string) {
  if (!s) return s;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
  return `/${s}`;
}

export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  placeholderSrc,
  style,
}: SafeImageProps) {
  // Default placeholder: silhouettes for players; crest fallback for schools/logos.
  const computedPlaceholder = useMemo(() => {
    if (placeholderSrc) return placeholderSrc;
    if (/\b(crest|school|logo|yat|wordmark)\b/i.test(alt)) return '/img/yatstats-circle.png';
    return '/img/player-silhouette.png';
  }, [placeholderSrc, alt]);

  const normalizedPlaceholder = useMemo(() => absolutize(computedPlaceholder), [computedPlaceholder]);

  const computedFallback = useMemo(() => {
    const fallback = normalizeCandidate(fallbackSrc);
    if (fallback) return absolutize(fallback);

    const primary = normalizeCandidate(src);
    // If caller passed a bare filename like "237.png" or "yatstats-logo.png",
    // also try "/img/<filename>" as a second fallback.
    if (primary && !primary.startsWith('http') && !primary.startsWith('/') && !primary.startsWith('img/')) {
      return `/img/${primary}`;
    }
    return '';
  }, [fallbackSrc, src]);

  const initialSrc = useMemo(() => {
    const primary = normalizeCandidate(src);
    if (primary) return absolutize(primary);
    if (computedFallback) return computedFallback;
    return normalizedPlaceholder;
  }, [src, computedFallback, normalizedPlaceholder]);

  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    setCurrentSrc(initialSrc);
    setFailCount(0);
  }, [initialSrc]);

  const handleError = useCallback(() => {
    setFailCount((prev) => {
      if (prev === 0 && computedFallback) {
        setCurrentSrc(computedFallback);
        return 1;
      }
      setCurrentSrc(normalizedPlaceholder);
      return 2;
    });
  }, [computedFallback, normalizedPlaceholder]);

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
