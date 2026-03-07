'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { S3_SCHOOL_PLACEHOLDER } from '@/lib/schoolAssets';

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
    // If it's a crest, school, or logo, use the YatStats square crest from S3
    if (/\b(crest|school|logo|yat|wordmark)\b/i.test(alt)) {
      return S3_SCHOOL_PLACEHOLDER;
    }
    return '/img/player-silhouette.png';
  }, [placeholderSrc, alt]);

  const normalizedPlaceholder = useMemo(() => absolutize(computedPlaceholder), [computedPlaceholder]);

  const computedFallback = useMemo(() => {
    const fallback = normalizeCandidate(fallbackSrc);
    if (fallback) return absolutize(fallback);

    const primary = normalizeCandidate(src);
    // If it's a school crest and we have a primary src, the first fallback should be the placeholder
    if (/\b(crest|school)\b/i.test(alt)) {
      return S3_SCHOOL_PLACEHOLDER;
    }

    // If caller passed a bare filename like "237.png" or "yatstats-logo.png",
    // also try "/img/<filename>" as a second fallback.
    if (primary && !primary.startsWith('http') && !primary.startsWith('/') && !primary.startsWith('img/')) {
      return `/img/${primary}`;
    }
    return '';
  }, [fallbackSrc, src, alt]);

  const initialSrc = useMemo(() => {
    const primary = normalizeCandidate(src);
    if (primary) return absolutize(primary);
    if (computedFallback) return computedFallback;
    return normalizedPlaceholder;
  }, [src, computedFallback, normalizedPlaceholder]);

  const [failState, setFailState] = useState({ baseSrc: initialSrc, count: 0 });
  const effectiveFailCount = failState.baseSrc === initialSrc ? failState.count : 0;

  const currentSrc = useMemo(() => {
    if (effectiveFailCount === 0) return initialSrc;
    if (effectiveFailCount === 1 && computedFallback && computedFallback !== initialSrc) {
      return computedFallback;
    }
    return normalizedPlaceholder;
  }, [effectiveFailCount, initialSrc, computedFallback, normalizedPlaceholder]);

  const handleError = useCallback(() => {
    setFailState((prev) => {
      const baseSrc = initialSrc;
      const prevCount = prev.baseSrc === baseSrc ? prev.count : 0;
      if (
        prevCount === 0 &&
        computedFallback &&
        computedFallback !== baseSrc &&
        computedFallback !== normalizedPlaceholder
      ) {
        return { baseSrc, count: 1 };
      }
      if (prevCount < 2 && normalizedPlaceholder && normalizedPlaceholder !== baseSrc) {
        return { baseSrc, count: 2 };
      }
      return prev.baseSrc === baseSrc ? prev : { baseSrc, count: prevCount };
    });
  }, [computedFallback, initialSrc, normalizedPlaceholder]);

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
