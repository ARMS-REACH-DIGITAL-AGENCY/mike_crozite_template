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
  const flipTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const card = markerRef.current?.closest<HTMLElement>(".yat-card[data-playerid]");
    if (!card) return;

    const finishFlipLift = () => {
      card.classList.remove("is-flipping");
      flipTimerRef.current = null;
    };

    const startFlipLift = () => {
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current);
      }

      card.classList.remove("is-flipping");
      void card.offsetWidth;
      card.classList.add("is-flipping");
      flipTimerRef.current = window.setTimeout(finishFlipLift, 620);
    };

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
      startFlipLift();
      card.classList.toggle("is-flipped");
    };

    card.addEventListener("click", handleCardClick);
    return () => {
      card.removeEventListener("click", handleCardClick);
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current);
      }
    };
  }, []);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}
