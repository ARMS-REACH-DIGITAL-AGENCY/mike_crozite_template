// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// Option C: keep Row 3 as a horizontal strip, but make the first slot a
// special wider branded journey card. The player layer expects a transparent
// cutout at S3 /players/cutouts/{playerId}.png.
"use client";

import { useContext } from "react";
import { SchoolContext } from "@/context/SchoolContext";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function CareerSlot({ src }: { src: string }) {
  return (
    <div className="career-slot">
      <img
        src={src}
        alt=""
        style={{
          display: "block",
          height: "100px",
          width: "auto",
          maxWidth: "none",
          objectPosition: "top center",
        }}
        onError={(e) => {
          const slot = (e.currentTarget as HTMLImageElement).closest(".career-slot");
          if (slot) (slot as HTMLElement).style.display = "none";
        }}
      />
    </div>
  );
}

function JourneyIntroSlot({ playerId, href }: { playerId: string; href?: string }) {
  const encodedId = encodeURIComponent(playerId);
  const cutoutSrc = `${S3_BASE}/players/cutouts/${encodedId}.png`;
  const thenJpg = `${S3_BASE}/players/then/${encodedId}.jpg`;
  const thenPng = `${S3_BASE}/players/then/${encodedId}.png`;

  const card = (
    <div className="career-journey-card" aria-label="Baseball journeys don't always end at graduation. Neither should their stories.">
      <img
        className="career-journey-bg"
        src={thenJpg}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (!img.dataset.fallbackTried) {
            img.dataset.fallbackTried = "1";
            img.src = thenPng;
          }
        }}
      />

      <img
        className="career-journey-cutout"
        src={cutoutSrc}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          // Do not fall back to a boxed photo here. If the transparent PNG
          // cutout is not available yet, the card still renders cleanly with
          // the blurred HS photo background and copy.
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />

      <div className="career-journey-copy">
        <div className="career-journey-quote">
          <span>“Baseball</span>
          <span>journeys don’t</span>
          <span>always end at</span>
          <span>graduation.”</span>
        </div>
        <div className="career-journey-banner">NEITHER SHOULD THEIR STORIES</div>
      </div>

      <svg className="career-journey-swoosh" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-24 214 C136 44 374 48 558 108 C724 162 812 220 1050 226" />
        <path className="core" d="M-24 214 C136 44 374 48 558 108 C724 162 812 220 1050 226" />
      </svg>

      <div className="career-journey-logo">YAT?STATS</div>
    </div>
  );

  return (
    <div className="career-slot career-journey-slot">
      {href ? (
        <a href={href} title="Back to flip card" aria-label="Back to player flip card">
          {card}
        </a>
      ) : card}
    </div>
  );
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const hsid = schoolData?.hsid ?? "";
  const flipCardHref = hsid ? `/${hsid}#player-${playerId}` : undefined;

  return (
    <div className="gallery-strip career-strip" id="playerCareerStrip">
      <div className="gallery-strip-inner career-strip-inner">
        <JourneyIntroSlot playerId={playerId} href={flipCardHref} />
        <CareerSlot src={`${S3_BASE}/players/back/${playerId}.jpg`} />
        <CareerSlot src={`${S3_BASE}/players/now/${playerId}.jpg`} />
      </div>

      <style jsx>{`
        .career-strip {
          height: var(--row3-h, 100px);
          min-height: var(--row3-h, 100px);
          max-height: var(--row3-h, 100px);
          align-items: stretch;
        }

        .career-strip-inner {
          height: var(--row3-h, 100px);
          min-height: var(--row3-h, 100px);
          max-height: var(--row3-h, 100px);
          align-items: stretch;
        }

        .career-journey-slot {
          flex: 0 0 var(--journey-card-w, 178px);
          width: var(--journey-card-w, 178px);
          min-width: var(--journey-card-w, 178px);
          height: var(--row3-h, 100px);
          overflow: hidden;
          background: #080808;
        }

        .career-journey-slot a {
          display: block;
          height: 100%;
          width: 100%;
          color: inherit;
          text-decoration: none;
        }

        .career-journey-card {
          position: relative;
          height: 100%;
          width: 100%;
          overflow: hidden;
          isolation: isolate;
          background: #0b0b0b;
        }

        .career-journey-card::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          background: linear-gradient(90deg, rgba(0,0,0,.08), rgba(0,0,0,.16) 42%, rgba(0,0,0,.58));
          pointer-events: none;
        }

        .career-journey-bg {
          position: absolute;
          inset: -16%;
          z-index: 0;
          width: 132%;
          height: 132%;
          object-fit: cover;
          object-position: center top;
          filter: blur(7px) saturate(1.05) brightness(.68);
          transform: scale(1.05);
        }

        .career-journey-cutout {
          position: absolute;
          z-index: 4;
          left: -10px;
          bottom: -10px;
          width: 48%;
          height: 124%;
          object-fit: contain;
          object-position: left bottom;
          filter: drop-shadow(0 8px 9px rgba(0,0,0,.78));
          pointer-events: none;
        }

        .career-journey-copy {
          position: absolute;
          z-index: 5;
          top: 8px;
          right: 6px;
          width: 64%;
          color: #fff;
          text-align: center;
          text-shadow: 0 1px 5px rgba(0,0,0,.82);
          pointer-events: none;
        }

        .career-journey-quote {
          display: block;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 17px;
          font-weight: 900;
          line-height: .92;
          letter-spacing: -.045em;
        }

        .career-journey-quote span {
          display: block;
        }

        .career-journey-banner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 5px;
          width: 100%;
          padding: 3px 4px;
          color: #111;
          background: linear-gradient(180deg, #ffd968 0%, #f5b02f 48%, #d58c15 100%);
          border: 1px solid rgba(255,237,145,.82);
          box-shadow: 0 0 11px rgba(255,187,44,.42), inset 0 1px 3px rgba(255,255,255,.4);
          font-family: Georgia, "Times New Roman", serif;
          font-size: 7px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .015em;
          white-space: nowrap;
          text-transform: uppercase;
        }

        .career-journey-swoosh {
          position: absolute;
          z-index: 3;
          left: -14px;
          right: -20px;
          bottom: -13px;
          width: 118%;
          height: 60%;
          overflow: visible;
          pointer-events: none;
        }

        .career-journey-swoosh path {
          fill: none;
          stroke: #f5a533;
          stroke-width: 7;
          stroke-linecap: round;
          filter: drop-shadow(0 0 7px rgba(255,207,62,.95)) drop-shadow(0 0 17px rgba(255,180,32,.72));
        }

        .career-journey-swoosh .core {
          stroke: #fff0a4;
          stroke-width: 2.25;
          filter: drop-shadow(0 0 7px rgba(255,231,118,.95));
        }

        .career-journey-logo {
          position: absolute;
          z-index: 4;
          right: 9px;
          bottom: 7px;
          color: rgba(255,255,255,.27);
          font: 900 10px/1 Oswald, sans-serif;
          letter-spacing: .02em;
          text-transform: uppercase;
          text-shadow: 0 0 4px rgba(255,255,255,.14);
          pointer-events: none;
        }

        @media (min-width: 640px) {
          .career-journey-slot {
            --journey-card-w: 210px;
          }
          .career-journey-quote {
            font-size: 20px;
          }
          .career-journey-banner {
            font-size: 8px;
          }
        }

        @media (min-width: 1000px) {
          .career-journey-slot {
            --journey-card-w: 240px;
          }
          .career-journey-quote {
            font-size: 23px;
          }
          .career-journey-banner {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  );
}
