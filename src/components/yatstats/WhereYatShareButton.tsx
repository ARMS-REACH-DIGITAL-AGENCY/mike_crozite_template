'use client';

import { useState } from 'react';

/**
 * Share a completed, publicly approved retired-alumni profile.
 * Hash opens the retired player's Where YAT tab for fans; the query string
 * is read server-side to render a #YATABOY-specific rich link preview.
 * Unapproved profiles never render this button.
 */
export default function WhereYatShareButton({ playerName }: { playerName: string }) {
  const [feedback, setFeedback] = useState('');
  const fullName = playerName.trim() || 'BASEBALL ALUMNI';

  const share = async () => {
    // Build a fresh link to this exact player. Never inherit a story/filter
    // parameter from the current page or send fans to the school's homepage.
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('yataboy', '1');
    url.hash = 'ppTab-schedule';

    const title = `#YATABOY ${fullName.toUpperCase()}`;
    const payload = {
      title,
      text: `#YATABOY ${fullName} — life after baseball on YAT?STATS`,
      url: url.toString(),
    };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        setFeedback('');
        return;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        // Clipboard is the supported fallback when Web Share is unavailable.
      }
    }

    try {
      await navigator.clipboard.writeText(url.toString());
      setFeedback('Link copied');
    } catch {
      setFeedback('Unable to copy link');
    }
  };

  return (
    <div className="wyn-panel-share">
      <button type="button" className="wyn-panel-share-btn" onClick={() => void share()}
        aria-label={`Share #YATABOY ${fullName}`} title={`Share ${fullName}'s life after baseball`}>
        <i className="ri-share-forward-line" aria-hidden="true" />
        <span>SHARE</span>
      </button>
      {feedback && <span className="wyn-panel-share-feedback" role="status">{feedback}</span>}
    </div>
  );
}
