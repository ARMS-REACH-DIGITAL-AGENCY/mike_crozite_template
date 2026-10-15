'use client';

import { useEffect, useState } from 'react';
import {
  FANTASY_COUNTDOWN_START,
  FANTASY_COUNTDOWN_START_LABEL,
  getFantasyCountdown,
} from '@/lib/fantasyCountdown';

type Countdown = ReturnType<typeof getFantasyCountdown>;

export default function FantasyNavCountdown() {
  // Do not freeze the count at server-render/build time or create a hydration
  // mismatch. The first client effect fills these placeholders immediately.
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    const update = () => setCountdown(getFantasyCountdown(Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    // Recalculate after a sleeping/background tab; never decrement a stale count.
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const label = !countdown
    ? `Alumni Fantasy Bracket Tournament countdown. Starts ${FANTASY_COUNTDOWN_START_LABEL}.`
    : countdown.complete
      ? `Countdown complete. Scheduled start: ${FANTASY_COUNTDOWN_START_LABEL}.`
      : `Alumni Fantasy Bracket Tournament countdown: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes. Starts ${FANTASY_COUNTDOWN_START_LABEL}.`;
  const cells = [
    { key: 'days', label: 'Days', value: countdown?.days },
    { key: 'hours', label: 'Hours', value: countdown?.hours },
    { key: 'minutes', label: 'Minutes', value: countdown?.minutes },
  ];

  return (
    <span
      className="yat-fantasy-countdown"
      role="img"
      aria-label={label}
      title={`Starts ${FANTASY_COUNTDOWN_START_LABEL}`}
      data-countdown-start={FANTASY_COUNTDOWN_START}
      data-countdown-complete={countdown?.complete ? 'true' : 'false'}
    >
      <span className="yat-fantasy-countdown-date" aria-hidden="true">
        {countdown?.complete ? 'Countdown complete' : 'Starts February 1st, 2027'}
      </span>
      <span className="yat-fantasy-countdown-cells" aria-hidden="true">
        {cells.map(({ key, label: unitLabel, value }) => (
          <span className="yat-fantasy-countdown-cell" key={key}>
            <span className="yat-fantasy-countdown-unit">{unitLabel}</span>
            <strong className="yat-fantasy-countdown-number" data-countdown-unit={key}>
              {value === undefined ? '—' : String(value).padStart(2, '0')}
            </strong>
          </span>
        ))}
      </span>
    </span>
  );
}
