// The player's name in a news write-up, bolded wherever it appears. With an
// href (the Alumni News gallery) each mention links to his profile; without
// one (his own profile page) it is bold only.

import type { ReactNode } from "react";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function markPlayerName(text: string, playerName: string | null | undefined, href?: string | null): ReactNode {
  const name = (playerName || "").trim();
  if (!text || !name) return text;

  // Split with a capture group: odd indexes are the name as written.
  return text.split(new RegExp(`(${escapeRegExp(name)})`, "gi")).map((part, i) => {
    if (i % 2 === 0) return part;
    return href ? (
      <a key={i} className="yat-news-player-mention" href={href}>
        <strong>{part}</strong>
      </a>
    ) : (
      <strong key={i} className="yat-news-player-mention">
        {part}
      </strong>
    );
  });
}
