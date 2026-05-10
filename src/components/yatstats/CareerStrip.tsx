// src/components/yatstats/CareerStrip.tsx
// Interactive Golden Line career timeline strip (Block 3) on player profile pages.
// This is intentionally self-contained so it can be pushed and previewed without
// needing new database tables yet. Later, replace fallbackMoments with moderated
// player_moments rows and fan media submissions.
"use client";

import { useContext, useMemo, useState } from "react";
import { SchoolContext } from "@/context/SchoolContext";
import { usePlayerProfile } from "@/context/PlayerProfileContext";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

type CareerMoment = {
  id: string;
  year: string;
  stage: string;
  title: string;
  caption: string;
  src?: string;
  href?: string;
  cta?: string;
  contributor?: string;
  reactionCount?: number;
  commentCount?: number;
};

function joinSchoolUrl(base: string, suffix = "") {
  const cleanBase = String(base || "").replace(/\/$/, "");
  return cleanBase ? `${cleanBase}${suffix}` : suffix || "/";
}

function flipCardHref(playerSchoolUrl: string | undefined, hsid: string, playerId: string) {
  if (!playerSchoolUrl && !hsid) return undefined;

  const base = playerSchoolUrl || `/${encodeURIComponent(hsid)}`;
  return joinSchoolUrl(
    base,
    `?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`
  );
}

function fallbackMoments(playerId: string, playerName: string, href?: string): CareerMoment[] {
  const firstName = playerName.split(" ")[0] || "this player";

  return [
    {
      id: "then",
      year: "Before",
      stage: "High School",
      title: "Where the story started",
      caption: `Early ${firstName} memories, coach stories, and photos from the hometown years.`,
      src: `${S3_BASE}/players/then/${playerId}.jpg`,
      href,
      cta: "Back to flip card",
      contributor: "YAT?STATS archive",
      reactionCount: 12,
      commentCount: 3,
    },
    {
      id: "moment",
      year: "Memory",
      stage: "Fan Upload",
      title: "Add the missing piece",
      caption: "Upload a Little League, dugout, family, school, college, draft-day, or fan photo.",
      src: `${S3_BASE}/players/back/${playerId}.jpg`,
      cta: "Add a memory",
      contributor: "Community prompt",
      reactionCount: 7,
      commentCount: 0,
    },
    {
      id: "now",
      year: "Now",
      stage: "Current Path",
      title: "The journey continues",
      caption: `Track where ${firstName} is now and connect today's stats back to the people who remember when.`,
      src: `${S3_BASE}/players/now/${playerId}.jpg`,
      cta: "View story",
      contributor: "YAT?STATS archive",
      reactionCount: 18,
      commentCount: 5,
    },
    {
      id: "legacy",
      year: "Legacy",
      stage: "Living Archive",
      title: "Help complete the Golden Line",
      caption: "Every approved memory becomes another piece of the player’s baseball ancestry map.",
      cta: "Submit photo",
      contributor: "Fans, family, coaches",
      reactionCount: 22,
      commentCount: 8,
    },
  ];
}

function MomentImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(!src);

  if (failed || !src) {
    return (
      <div className="gl-image-fallback" aria-hidden="true">
        <i className="ri-camera-lens-line" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

function GoldenLinePath() {
  return (
    <svg className="gl-line" viewBox="0 0 900 88" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="goldenLineGlow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        className="gl-line-shadow"
        d="M0 58 C120 8 190 20 270 48 S410 90 510 42 S690 0 900 34"
      />
      <path
        className="gl-line-main"
        d="M0 58 C120 8 190 20 270 48 S410 90 510 42 S690 0 900 34"
      />
    </svg>
  );
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = usePlayerProfile();
  const [activeMoment, setActiveMoment] = useState<CareerMoment | null>(null);

  const hsid = String(playerProfile?.playerHsid || schoolData?.hsid || "").trim();
  const playerName = String(playerProfile?.playerName || "this player").trim();
  const href = flipCardHref(playerProfile?.playerSchoolUrl, hsid, playerId);

  const moments = useMemo(
    () => fallbackMoments(playerId, playerName, href),
    [playerId, playerName, href]
  );

  return (
    <div className="gallery-strip golden-line-strip" id="playerCareerStrip">
      <div className="gl-header" aria-label="Golden Line career timeline">
        <div>
          <span className="gl-kicker">The Golden Line</span>
          <span className="gl-title">Career Path</span>
        </div>
        <button className="gl-add" type="button" onClick={() => setActiveMoment(moments[1])}>
          + Memory
        </button>
      </div>

      <div className="gl-track-wrap">
        <GoldenLinePath />
        <div className="gl-track" role="list" aria-label={`${playerName} career memories`}>
          {moments.map((moment, idx) => {
            const card = (
              <button
                type="button"
                className="gl-card"
                onClick={() => setActiveMoment(moment)}
                aria-label={`Open ${moment.title}`}
              >
                <span className="gl-dot" />
                <span className="gl-photo">
                  <MomentImage src={moment.src} title={moment.title} />
                </span>
                <span className="gl-copy">
                  <span className="gl-year">{moment.year}</span>
                  <span className="gl-stage">{moment.stage}</span>
                </span>
              </button>
            );

            return (
              <div className={`gl-slot gl-slot-${idx}`} key={moment.id} role="listitem">
                {card}
              </div>
            );
          })}
        </div>
      </div>

      {activeMoment && (
        <div className="gl-modal-backdrop" role="presentation" onClick={() => setActiveMoment(null)}>
          <section
            className="gl-modal"
            role="dialog"
            aria-modal="true"
            aria-label={activeMoment.title}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="gl-close" type="button" onClick={() => setActiveMoment(null)} aria-label="Close">
              ×
            </button>

            <div className="gl-modal-media">
              <MomentImage src={activeMoment.src} title={activeMoment.title} />
            </div>

            <div className="gl-modal-body">
              <div className="gl-modal-eyebrow">
                {activeMoment.year} · {activeMoment.stage}
              </div>
              <h2>{activeMoment.title}</h2>
              <p>{activeMoment.caption}</p>

              <div className="gl-modal-meta">
                <span>By {activeMoment.contributor || "YAT?STATS"}</span>
                <span>{activeMoment.reactionCount || 0} remember this</span>
                <span>{activeMoment.commentCount || 0} comments</span>
              </div>

              <div className="gl-comment-box">
                <strong>Fan memory prompt</strong>
                <span>“I remember this because…”</span>
              </div>

              <div className="gl-modal-actions">
                {activeMoment.href ? (
                  <a href={activeMoment.href}>{activeMoment.cta || "Open"}</a>
                ) : (
                  <button type="button">{activeMoment.cta || "Add a memory"}</button>
                )}
                <button type="button">Upload Photo</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .golden-line-strip {
          position: relative;
          height: 100%;
          min-height: 100px;
          overflow: hidden;
          isolation: isolate;
          background:
            radial-gradient(circle at 20% 15%, rgba(255, 196, 72, .16), transparent 25%),
            linear-gradient(180deg, rgba(16,16,16,.96), rgba(6,6,6,.98));
          border-top: 1px solid rgba(255,255,255,.08);
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .golden-line-strip::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .22;
          background-image:
            linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
        }

        .gl-header {
          position: absolute;
          z-index: 3;
          left: 12px;
          top: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fff;
          text-transform: uppercase;
          pointer-events: none;
        }

        .gl-kicker,
        .gl-title {
          display: block;
          white-space: nowrap;
        }

        .gl-kicker {
          font: 800 10px/1 Oswald, sans-serif;
          letter-spacing: .16em;
          color: #f5c85a;
          text-shadow: 0 0 10px rgba(255,197,67,.55);
        }

        .gl-title {
          margin-top: 3px;
          font: 800 15px/1 "Bebas Neue", Oswald, sans-serif;
          letter-spacing: .08em;
        }

        .gl-add {
          pointer-events: auto;
          border: 1px solid rgba(245,200,90,.72);
          border-radius: 999px;
          padding: 5px 8px 4px;
          background: rgba(0,0,0,.58);
          color: #f5c85a;
          font: 800 9px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 0 14px rgba(255,197,67,.16);
        }

        .gl-track-wrap {
          position: relative;
          height: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          padding-left: 132px;
          padding-right: 20px;
        }

        .gl-track-wrap::-webkit-scrollbar { display: none; }

        .gl-line {
          position: absolute;
          left: 90px;
          top: 5px;
          width: max(820px, calc(100% - 95px));
          height: 88px;
          z-index: 0;
          pointer-events: none;
        }

        .gl-line-shadow,
        .gl-line-main {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .gl-line-shadow {
          stroke: rgba(255, 196, 72, .22);
          stroke-width: 8;
          filter: url(#goldenLineGlow);
        }

        .gl-line-main {
          stroke: #f5c85a;
          stroke-width: 2.3;
          stroke-dasharray: 1020;
          stroke-dashoffset: 1020;
          animation: gl-draw 1.4s ease-out .18s forwards;
          filter: url(#goldenLineGlow);
        }

        .gl-track {
          position: relative;
          z-index: 2;
          height: 100%;
          min-width: 760px;
          display: grid;
          grid-template-columns: repeat(4, 132px);
          align-items: center;
          gap: 30px;
        }

        .gl-slot {
          transform: translateY(0) rotate(-2deg);
        }

        .gl-slot-1 { transform: translateY(13px) rotate(2.2deg); }
        .gl-slot-2 { transform: translateY(-5px) rotate(-1.5deg); }
        .gl-slot-3 { transform: translateY(10px) rotate(2deg); }

        .gl-card {
          position: relative;
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr);
          align-items: center;
          width: 132px;
          height: 70px;
          padding: 7px;
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(29,29,29,.98), rgba(7,7,7,.92));
          color: #fff;
          text-align: left;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0,0,0,.4);
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }

        .gl-card:hover,
        .gl-card:focus-visible {
          transform: translateY(-5px) scale(1.04);
          border-color: rgba(245,200,90,.94);
          box-shadow: 0 0 20px rgba(245,200,90,.24), 0 10px 28px rgba(0,0,0,.55);
          outline: none;
        }

        .gl-dot {
          position: absolute;
          left: 20px;
          top: -9px;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: #f5c85a;
          border: 2px solid #151515;
          box-shadow: 0 0 18px rgba(245,200,90,.8);
        }

        .gl-photo {
          display: block;
          width: 44px;
          height: 56px;
          overflow: hidden;
          border: 1px solid rgba(245,200,90,.5);
          border-radius: 6px;
          background: #111;
        }

        .gl-photo img,
        .gl-modal-media img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
        }

        .gl-image-fallback {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: rgba(245,200,90,.8);
          background:
            radial-gradient(circle at center, rgba(245,200,90,.16), transparent 55%),
            linear-gradient(135deg, #272727, #0e0e0e);
          font-size: 22px;
        }

        .gl-copy {
          min-width: 0;
          padding-left: 7px;
        }

        .gl-year,
        .gl-stage {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-transform: uppercase;
        }

        .gl-year {
          color: #f5c85a;
          font: 800 10px/1 Oswald, sans-serif;
          letter-spacing: .12em;
        }

        .gl-stage {
          margin-top: 5px;
          color: rgba(255,255,255,.86);
          font: 800 13px/1 "Bebas Neue", Oswald, sans-serif;
          letter-spacing: .05em;
        }

        .gl-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(0,0,0,.78);
          backdrop-filter: blur(6px);
        }

        .gl-modal {
          position: relative;
          width: min(860px, 96vw);
          max-height: min(680px, 92vh);
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(220px, 42%) minmax(0, 1fr);
          border: 1px solid rgba(245,200,90,.48);
          border-radius: 18px;
          background:
            radial-gradient(circle at 0 0, rgba(245,200,90,.18), transparent 34%),
            linear-gradient(135deg, #191919, #070707);
          color: #f4f4f4;
          box-shadow: 0 24px 80px rgba(0,0,0,.72), 0 0 38px rgba(245,200,90,.18);
        }

        .gl-close {
          position: absolute;
          top: 10px;
          right: 12px;
          z-index: 2;
          width: 34px;
          height: 34px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 999px;
          background: rgba(0,0,0,.58);
          color: #fff;
          font: 300 28px/1 Arial, sans-serif;
          cursor: pointer;
        }

        .gl-modal-media {
          min-height: 340px;
          background: #111;
        }

        .gl-modal-body {
          padding: 30px 28px 26px;
        }

        .gl-modal-eyebrow {
          color: #f5c85a;
          font: 800 12px/1 Oswald, sans-serif;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .gl-modal h2 {
          margin: 10px 0 12px;
          font: 800 clamp(28px, 5vw, 52px)/.92 "Bebas Neue", Oswald, sans-serif;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .gl-modal p {
          margin: 0;
          color: rgba(255,255,255,.82);
          font: 400 15px/1.5 system-ui, sans-serif;
        }

        .gl-modal-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 18px 0;
        }

        .gl-modal-meta span {
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 999px;
          padding: 7px 10px;
          color: rgba(255,255,255,.78);
          background: rgba(255,255,255,.05);
          font: 700 11px/1 Oswald, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .gl-comment-box {
          display: grid;
          gap: 5px;
          margin: 16px 0 18px;
          padding: 14px;
          border-left: 3px solid #f5c85a;
          background: rgba(255,255,255,.06);
        }

        .gl-comment-box strong {
          font: 800 12px/1 Oswald, sans-serif;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: #fff;
        }

        .gl-comment-box span {
          color: rgba(255,255,255,.7);
          font: 400 14px/1.35 system-ui, sans-serif;
        }

        .gl-modal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .gl-modal-actions a,
        .gl-modal-actions button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid rgba(245,200,90,.75);
          border-radius: 999px;
          background: rgba(245,200,90,.12);
          color: #f5c85a;
          font: 800 12px/1 Oswald, sans-serif;
          letter-spacing: .1em;
          text-decoration: none;
          text-transform: uppercase;
          cursor: pointer;
        }

        @keyframes gl-draw {
          to { stroke-dashoffset: 0; }
        }

        @media (max-width: 760px) {
          .gl-header { left: 9px; top: 7px; }
          .gl-title { font-size: 13px; }
          .gl-add { padding-inline: 7px; }
          .gl-track-wrap { padding-left: 110px; }
          .gl-track { grid-template-columns: repeat(4, 118px); gap: 22px; min-width: 640px; }
          .gl-card { width: 118px; grid-template-columns: 44px minmax(0, 1fr); }
          .gl-photo { width: 38px; height: 54px; }
          .gl-modal { grid-template-columns: 1fr; overflow-y: auto; }
          .gl-modal-media { min-height: 230px; max-height: 38vh; }
          .gl-modal-body { padding: 24px 20px 22px; }
        }
      `}</style>
    </div>
  );
}
