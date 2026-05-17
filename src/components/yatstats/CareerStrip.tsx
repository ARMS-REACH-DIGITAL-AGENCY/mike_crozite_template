// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// Option C: Row 3 stays a horizontal strip, with the first slot rendered as
// a branded journey intro tile plus a gold timeline/swoosh that continues
// across the row.
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
          // A real foreground player requires a transparent PNG cutout.
          // Do not fake this with an oval/circle mask from the full HS photo.
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
      <div className="career-row-gold-line" aria-hidden="true" />
      <div className="gallery-strip-inner career-strip-inner">
        <JourneyIntroSlot playerId={playerId} href={flipCardHref} />
        <CareerSlot src={`${S3_BASE}/players/back/${playerId}.jpg`} />
        <CareerSlot src={`${S3_BASE}/players/now/${playerId}.jpg`} />
      </div>

      <style jsx global>{`
        #playerCareerStrip.career-strip {
          height: var(--row3-h, 100px);
          min-height: var(--row3-h, 100px);
          max-height: var(--row3-h, 100px);
          align-items: stretch;
          overflow: hidden;
          padding-top: 0;
          padding-bottom: 0;
        }

        #playerCareerStrip .career-strip-inner {
          position: relative;
          z-index: 2;
          height: var(--row3-h, 100px);
          min-height: var(--row3-h, 100px);
          max-height: var(--row3-h, 100px);
          align-items: stretch;
        }

        #playerCareerStrip .career-row-gold-line {
          position: absolute;
          left: 20px;
          right: 16px;
          bottom: 4px;
          z-index: 1;
          height: 4px;
          background: linear-gradient(90deg, rgba(255,206,66,.05), #f5a533 14%, #ffc947 52%, #f5a533 100%);
          box-shadow: 0 0 7px rgba(255,207,62,.85), 0 0 18px rgba(255,180,32,.48);
          pointer-events: none;
        }

        #playerCareerStrip .career-journey-slot {
          flex: 0 0 var(--journey-card-w, 270px) !important;
          width: var(--journey-card-w, 270px) !important;
          min-width: var(--journey-card-w, 270px) !important;
          max-width: var(--journey-card-w, 270px) !important;
          height: var(--row3-h, 100px) !important;
          overflow: hidden;
          background: #080808;
        }

        #playerCareerStrip .career-journey-slot a {
          display: block;
          height: 100%;
          width: 100%;
          color: inherit;
          text-decoration: none;
        }

        #playerCareerStrip .career-journey-card {
          position: relative;
          height: 100%;
          width: 100%;
          overflow: hidden;
          isolation: isolate;
          background: #0b0b0b;
        }

        #playerCareerStrip .career-journey-card::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          background: linear-gradient(90deg, rgba(0,0,0,.10), rgba(0,0,0,.04) 36%, rgba(0,0,0,.42));
          pointer-events: none;
        }

        #playerCareerStrip .career-journey-bg {
          position: absolute;
          inset: -18%;
          z-index: 0;
          width: 136% !important;
          height: 136% !important;
          max-width: none !important;
          object-fit: cover;
          object-position: center top;
          filter: blur(8px) saturate(1.05) brightness(.68);
          transform: scale(1.04);
        }

        #playerCareerStrip .career-journey-cutout {
          position: absolute;
          z-index: 4;
          left: -6px;
          bottom: -7px;
          width: 42% !important;
          height: 116% !important;
          max-width: none !important;
          object-fit: contain;
          object-position: left bottom;
          filter: drop-shadow(0 8px 9px rgba(0,0,0,.78));
          pointer-events: none;
        }

        #playerCareerStrip .career-journey-cutout-fallback {
          display: none !important;
        }

        #playerCareerStrip .career-journey-copy {
          position: absolute;
          z-index: 5;
          top: 9px;
          right: 8px;
          width: 58%;
          color: #fff;
          text-align: center;
          text-shadow: 0 1px 5px rgba(0,0,0,.82);
          pointer-events: none;
        }

        #playerCareerStrip .career-journey-quote {
          display: block;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 19px;
          font-weight: 900;
          line-height: .91;
          letter-spacing: -.04em;
        }

        #playerCareerStrip .career-journey-quote span {
          display: block;
        }

        #playerCareerStrip .career-journey-banner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 4px;
          width: 98%;
          padding: 3px 4px;
          color: #111;
          background: linear-gradient(180deg, #ffd968 0%, #f5b02f 48%, #d58c15 100%);
          border: 1px solid rgba(255,237,145,.82);
          box-shadow: 0 0 11px rgba(255,187,44,.42), inset 0 1px 3px rgba(255,255,255,.4);
          font-family: Georgia, "Times New Roman", serif;
          font-size: 8px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .015em;
          white-space: nowrap;
          text-transform: uppercase;
        }

        #playerCareerStrip .career-journey-swoosh {
          position: absolute;
          z-index: 3;
          left: -20px;
          right: -30px;
          bottom: -12px;
          width: 122%;
          height: 62%;
          overflow: visible;
          pointer-events: none;
        }

        #playerCareerStrip .career-journey-swoosh path {
          fill: none;
          stroke: #f5a533;
          stroke-width: 7;
          stroke-linecap: round;
          filter: drop-shadow(0 0 7px rgba(255,207,62,.95)) drop-shadow(0 0 17px rgba(255,180,32,.72));
        }

        #playerCareerStrip .career-journey-swoosh .core {
          stroke: #fff0a4;
          stroke-width: 2.25;
          filter: drop-shadow(0 0 7px rgba(255,231,118,.95));
        }

        #playerCareerStrip .career-journey-logo {
          position: absolute;
          z-index: 4;
          right: 9px;
          bottom: 9px;
          color: rgba(255,255,255,.26);
          font: 900 10px/1 Oswald, sans-serif;
          letter-spacing: .02em;
          text-transform: uppercase;
          text-shadow: 0 0 4px rgba(255,255,255,.14);
          pointer-events: none;
        }

        @media (max-width: 640px) {
          #playerCareerStrip .career-journey-slot {
            --journey-card-w: 240px;
          }
          #playerCareerStrip .career-journey-quote {
            font-size: 17px;
          }
          #playerCareerStrip .career-journey-banner {
            font-size: 7px;
          }
        }

        @media (min-width: 1000px) {
          #playerCareerStrip .career-journey-slot {
            --journey-card-w: 270px;
          }
          #playerCareerStrip .career-journey-quote {
            font-size: 21px;
          }
          #playerCareerStrip .career-journey-banner {
            font-size: 9px;
          }
        }
      `}</style>
    </div>
  );
}
