'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string | null;
  placeholderSrc?: string;
  style?: React.CSSProperties;
}

/** Tracks which base source a fail count applies to (0=initial, 1=fallback when available, 2=placeholder). */
type FailState = { baseSrc: string; count: 0 | 1 | 2 };

/** Return fail count for the current source, resetting to zero when the source changes. */
function computeEffectiveFailCount(state: FailState, source: string) {
  return state.baseSrc === source ? state.count : 0;
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

function StatefulSafeImage({
  initialSrc,
  computedFallback,
  normalizedPlaceholder,
  alt,
  className,
  style,
}: {
  initialSrc: string;
  computedFallback: string;
  normalizedPlaceholder: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failState, setFailState] = useState<FailState>({ baseSrc: initialSrc, count: 0 });
  const effectiveFailCount = computeEffectiveFailCount(failState, initialSrc);
  const hasFallback = !!computedFallback && computedFallback !== initialSrc;
  const hasDistinctPlaceholder =
    !!normalizedPlaceholder &&
    normalizedPlaceholder !== initialSrc &&
    normalizedPlaceholder !== computedFallback;

  const currentSrc = useMemo(() => {
    if (effectiveFailCount === 0) return initialSrc;
    if (effectiveFailCount === 1 && hasFallback) {
      return computedFallback;
    }
    return hasDistinctPlaceholder ? normalizedPlaceholder : initialSrc;
  }, [effectiveFailCount, initialSrc, computedFallback, hasFallback, normalizedPlaceholder, hasDistinctPlaceholder]);

  // Derive the next fail stage for the current source when the browser reports an error.
  const handleError = useCallback(() => {
    setFailState((prev) => {
      const prevCount = computeEffectiveFailCount(prev, initialSrc);
      if (prevCount >= 2) {
        return prev.baseSrc === initialSrc ? prev : { baseSrc: initialSrc, count: 2 };
      }

      let nextCount: FailState['count'] = prevCount;

      if (prevCount === 0) {
        if (hasFallback) {
          nextCount = 1;
        } else if (hasDistinctPlaceholder) {
          nextCount = 2;
        }
      } else if (prevCount === 1 && hasDistinctPlaceholder) {
        nextCount = 2;
      }

      // Skip state updates when both the base source and fail stage are unchanged.
      if (prev.baseSrc === initialSrc && prevCount === nextCount) return prev;
      return { baseSrc: initialSrc, count: nextCount };
    });
  }, [hasFallback, initialSrc, hasDistinctPlaceholder]);

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
      return CREST_FALLBACK_PATH;
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
      return CREST_FALLBACK_PATH;
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

  return (
    <StatefulSafeImage
      key={initialSrc}
      initialSrc={initialSrc}
      computedFallback={computedFallback}
      normalizedPlaceholder={normalizedPlaceholder}
      alt={alt}
      className={className}
      style={style}
    />
  );
}
