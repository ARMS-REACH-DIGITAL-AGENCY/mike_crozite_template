// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// The first timeline slot is now a branded Journey Intro card that uses a
// transparent HS cutout when available, instead of a normal cropped photo tile.
"use client";

import { useContext } from "react";
import { SchoolContext } from "@/context/SchoolContext";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function CareerSlot({
  src,
  href,
}: {
  src: string;
  href?: string;
}) {
  const img = (
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
        // Hide the parent slot entirely when the image 404s/403s.
        const slot = (e.currentTarget as HTMLImageElement).closest(".career-slot");
        if (slot) (slot as HTMLElement).style.display = "none";
      }}
    />
  );

  if (href) {
    return (
      <div className="career-slot">
        <a
          href={href}
          style={{ display: "block", textDecoration: "none" }}
          title="Back to flip card"
          aria-label="Back to player flip card"
        >
          {img}
        </a>
      </div>
    );
  }

  return <div className="career-slot">{img}</div>;
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
          if (img.src !== thenPng) img.src = thenPng;
        }}
      />
      <img
        className="career-journey-cutout"
        src={cutoutSrc}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          // Cutout is optional. If no transparent PNG exists yet, hide the
          // foreground rather than showing a boxed/cropped full photo.
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
        <path d="M-18 210 C120 44 350 42 545 102 C714 154 795 222 1048 226" />
        <path className="core" d="M-18 210 C120 44 350 42 545 102 C714 154 795 222 1048 226" />
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

  // Link the HS journey card back to the player's flip card on the gallery page.
  const flipCardHref = hsid ? `/${hsid}#player-${playerId}` : undefined;

  const slots = [
    { src: `${S3_BASE}/players/back/${playerId}.jpg` },
    { src: `${S3_BASE}/players/now/${playerId}.jpg` },
  ];

  return (
    <div className="gallery-strip" id="playerCareerStrip">
      <div className="gallery-strip-inner">
        <JourneyIntroSlot playerId={playerId} href={flipCardHref} />
        {slots.map(({ src }, idx) => (
          <CareerSlot key={idx} src={src} />
        ))}
      </div>
      <style jsx>{`
        .career-journey-slot {
          flex: 0 0 auto;
          height: 100px;
          width: 248px;
          overflow: hidden;
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
          height: 100px;
          width: 248px;
          overflow: hidden;
          isolation: isolate;
          background: #0b0b0b;
          border: 1px solid rgba(245, 200, 90, .45);
          box-shadow: 0 0 12px rgba(245, 170, 42, .18);
        }
        .career-journey-card::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          background: linear-gradient(90deg, rgba(0,0,0,.10), rgba(0,0,0,.12) 38%, rgba(0,0,0,.55));
          pointer-events: none;
        }
        .career-journey-bg {
          position: absolute;
          inset: -18%;
          z-index: 0;
          width: 136%;
          height: 136%;
          object-fit: cover;
          filter: blur(9px) saturate(1.05) brightness(.72);
          transform: scale(1.05);
        }
        .career-journey-cutout {
          position: absolute;
          z-index: 4;
          left: -5px;
          bottom: -8px;
          width: 46%;
          height: 118%;
          object-fit: contain;
          object-position: left bottom;
          filter: drop-shadow(0 8px 9px rgba(0,0,0,.72));
        }
        .career-journey-copy {
          position: absolute;
          z-index: 5;
          top: 8px;
          right: 8px;
          width: 61%;
          color: #fff;
          text-align: center;
          text-shadow: 0 1px 5px rgba(0,0,0,.72);
        }
        .career-journey-quote {
          display: block;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 22px;
          font-weight: 900;
          line-height: .92;
          letter-spacing: -.04em;
        }
        .career-journey-quote span {
          display: block;
        }
        .career-journey-banner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 5px;
          min-width: 95%;
          padding: 4px 6px;
          color: #111;
          background: linear-gradient(180deg, #ffd968 0%, #f5b02f 48%, #d58c15 100%);
          border: 1px solid rgba(255,237,145,.82);
          box-shadow: 0 0 13px rgba(255,187,44,.42), inset 0 1px 3px rgba(255,255,255,.4);
          font-family: Georgia, "Times New Roman", serif;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .02em;
          white-space: nowrap;
          text-transform: uppercase;
        }
        .career-journey-swoosh {
          position: absolute;
          z-index: 3;
          left: -12px;
          right: -22px;
          bottom: -12px;
          width: 115%;
          height: 58%;
          overflow: visible;
          pointer-events: none;
        }
        .career-journey-swoosh path {
          fill: none;
          stroke: #f5a533;
          stroke-width: 7;
          stroke-linecap: round;
          filter: drop-shadow(0 0 7px rgba(255,207,62,.95)) drop-shadow(0 0 18px rgba(255,180,32,.72));
        }
        .career-journey-swoosh .core {
          stroke: #fff0a4;
          stroke-width: 2.3;
          filter: drop-shadow(0 0 7px rgba(255,231,118,.95));
        }
        .career-journey-logo {
          position: absolute;
          z-index: 4;
          right: 12px;
          bottom: 9px;
          color: rgba(255,255,255,.30);
          font: 900 12px/1 Oswald, sans-serif;
          letter-spacing: .02em;
          text-transform: uppercase;
          text-shadow: 0 0 4px rgba(255,255,255,.16);
        }
        @media (max-width: 760px) {
          .career-journey-slot,
          .career-journey-card {
            width: 232px;
          }
          .career-journey-quote {
            font-size: 20px;
          }
          .career-journey-banner {
            font-size: 9px;
          }
        }
      `}</style>
    </div>
  );
}
