"use client";

import { useEffect, useRef } from "react";

/**
 * Attaches reliable, card-local flip behavior to the surrounding player card.
 *
 * The school page also has a legacy delegated document click handler. Stopping
 * propagation here prevents that handler from immediately toggling the same
 * card a second time, while links and controls remain fully interactive.
 */
export default function PlayerCardFlipBehavior() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const card = markerRef.current?.closest<HTMLElement>(".yat-card[data-playerid]");
    if (!card) return;

    const handleCardClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest(
          'a, button, input, select, textarea, label, [role="button"]'
        )
      ) {
        return;
      }

      event.stopPropagation();
      card.classList.toggle("is-flipped");
    };

    card.addEventListener("click", handleCardClick);
    return () => card.removeEventListener("click", handleCardClick);
  }, []);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}
