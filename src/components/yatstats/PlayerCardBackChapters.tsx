'use client';

// A person with two schools: one card, one chapter per school (CLAUDE.md;
// src/lib/playerChapters.ts). The toggle switches the chapter on the card
// back: the school, status, level and team, and the first tab (Where YAT
// Now? for a coach or RETIRED chapter, the 7-day snapshot for ACTIVE). Name,
// photos and stats stay the same. Only rendered for people with two or
// more chapters; everyone else's card back is unchanged.

import { useState, type ReactNode } from 'react';
import PlayerCardBackHero from '@/components/yatstats/PlayerCardBackHero';
import FunZone, { type FunZoneProps } from '@/components/yatstats/FunZone';
import { isCoachStatus, type PlayerChapter } from '@/lib/playerChapters';
import { usesWhereYatNowStatus } from '@/lib/galleryStatuses';

type HeroProps = {
  playerId: string;
  photoId?: string;
  displayName: string;
  profileHref: string;
  btHw: string;
};

export default function PlayerCardBackChapters({
  chapters,
  defaultIndex,
  position,
  hero,
  funZone,
  scheduleSnapshot,
  lazySchedulePlayerId,
}: {
  chapters: PlayerChapter[];
  defaultIndex: number;
  position: string;
  hero: HeroProps;
  funZone: Omit<FunZoneProps, 'statusLabel' | 'scheduleSnapshot' | 'lazySchedulePlayerId' | 'whereYatNow'>;
  scheduleSnapshot?: ReactNode;
  lazySchedulePlayerId?: string;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(defaultIndex, 0), chapters.length - 1));
  const chapter = chapters[index];
  const whereYatNow = isCoachStatus(chapter.statusLabel) || usesWhereYatNowStatus(chapter.statusLabel);
  const posLevelStatus = [position, chapter.levelLabel, chapter.statusLabel].filter(Boolean).join(' - ');
  return (
    <>
      <div className="yat-chapter-toggle" role="group" aria-label="School">
        {chapters.map((c, i) => (
          <button
            key={c.hsid}
            type="button"
            className={i === index ? 'is-on' : undefined}
            aria-pressed={i === index}
            onClick={(event) => { event.stopPropagation(); setIndex(i); }}
          >
            {(c.schoolName || c.hsid).toUpperCase()}
          </button>
        ))}
      </div>
      <PlayerCardBackHero
        {...hero}
        teamName={chapter.teamName}
        orgConf={chapter.orgName}
        posLevelStatus={posLevelStatus}
      />
      <FunZone
        key={chapter.hsid}
        {...funZone}
        statusLabel={chapter.statusLabel}
        whereYatNow={whereYatNow}
        scheduleSnapshot={whereYatNow ? undefined : scheduleSnapshot}
        lazySchedulePlayerId={whereYatNow ? undefined : lazySchedulePlayerId}
      />
      <style>{`
        .yat-chapter-toggle{ position:relative; z-index:2; display:flex; gap:4px; justify-content:center; padding:6px 8px 0; }
        .yat-chapter-toggle button{ font:700 10px/1 system-ui,sans-serif; letter-spacing:.06em; padding:5px 10px; border-radius:999px; border:1px solid rgba(0,0,0,.35); background:rgba(255,255,255,.55); color:#1b1b1b; cursor:pointer; }
        .yat-chapter-toggle button.is-on{ background:#1b1b1b; color:#fff; border-color:#1b1b1b; }
        .yat-chapter-toggle button:focus-visible{ outline:2px solid #1b1b1b; outline-offset:2px; }
      `}</style>
    </>
  );
}
