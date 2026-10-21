'use client';

import { useState } from 'react';

// The image is uploaded separately to public/img/yatstats-guided-tour.png.
// These transparent link areas align with the four tiles in the approved
// 1408 x 1056 (4:3) design. Percent positions scale with the image.
const GUIDED_TOUR_IMAGE = '/img/yatstats-guided-tour.png';

const ROLE_LINKS = [
  { role: 'COACH', href: 'https://yatstats.com/programs/', left: 4.6, top: 50.8, width: 16.0, height: 30.2 },
  { role: 'PLAYER', href: 'https://yatstats.com/players/', left: 21.5, top: 50.8, width: 16.0, height: 30.2 },
  { role: 'PARTNER', href: 'https://yatstats.com/partners/', left: 38.4, top: 50.8, width: 16.0, height: 30.2 },
  { role: 'FAN', href: 'https://yatstats.com/fans/', left: 55.2, top: 50.8, width: 16.0, height: 30.2 },
] as const;

export default function GuidedTourArtwork() {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <section className="yat-approved-tour" aria-label="YAT?STATS guided tour">
      <div className="yat-approved-tour-visual" style={{ display: imageLoaded ? 'block' : 'none' }}>
        <img
          src={GUIDED_TOUR_IMAGE}
          width={1408}
          height={1056}
          alt="Welcome to YAT?STATS! Choose your role in the baseball world: Coach, Player, Partner, or Fan."
          loading="eager"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(false)}
        />
        <nav aria-label="Choose your role to open the YAT?STATS guided tour">
          {ROLE_LINKS.map(({ role, href, left, top, width, height }) => (
            <a
              key={role}
              className="yat-approved-tour-hotspot"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${role} — open in a new tab`}
              title={`Visit the YAT?STATS ${role.toLowerCase()} page (new tab)`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
            >
              <span className="yat-approved-tour-sr-only">{role}</span>
            </a>
          ))}
        </nav>
      </div>

      {/* Preserve four usable links until the image has been uploaded to GitHub. */}
      {!imageLoaded && (
        <div className="yat-approved-tour-fallback">
          <p>Welcome to YAT?STATS! I would love to give you a quick tour of our platform.</p>
          <strong>Select your role in the baseball world.</strong>
          <nav aria-label="Choose your role in the baseball world" className="yat-approved-tour-fallback-links">
            {ROLE_LINKS.map(({ role, href }) => (
              <a key={role} href={href} target="_blank" rel="noopener noreferrer">
                {role}
              </a>
            ))}
          </nav>
        </div>
      )}

      <style jsx>{`
        .yat-approved-tour {
          box-sizing: border-box;
          width: 100%;
          padding: 8px 9px 12px;
          border: 0;
          background: transparent;
        }
        .yat-approved-tour-visual {
          position: relative;
          width: 100%;
          margin: 0 auto;
          line-height: 0;
        }
        .yat-approved-tour-visual > img {
          display: block;
          width: 100% !important;
          height: auto !important;
          max-height: none !important;
          object-fit: contain;
        }
        .yat-approved-tour-hotspot {
          position: absolute;
          z-index: 2;
          display: block;
          border-radius: 12%;
          cursor: pointer;
          background: transparent;
        }
        .yat-approved-tour-hotspot:focus-visible {
          outline: 3px solid #d78200;
          outline-offset: 1px;
          background: rgba(255, 255, 255, .1);
        }
        .yat-approved-tour-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }
        .yat-approved-tour-fallback {
          padding: 11px;
          border-radius: 13px;
          background: #f7f7f7;
          color: #111;
          font: 400 12px/1.45 var(--yat-font-ui, Archivo, Arial, sans-serif);
        }
        .yat-approved-tour-fallback p { margin: 0 0 6px; }
        .yat-approved-tour-fallback strong { display: block; margin-bottom: 9px; }
        .yat-approved-tour-fallback-links {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 5px;
        }
        .yat-approved-tour-fallback-links a {
          display: flex;
          min-height: 50px;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: #e8e8e8;
          color: #111;
          text-decoration: none;
          font: 700 clamp(9px, 2.5vw, 11px)/1 var(--yat-font-ui, Archivo, Arial, sans-serif);
        }
        .yat-approved-tour-fallback-links a:focus-visible {
          outline: 2px solid #111;
          outline-offset: 2px;
        }
      `}</style>
    </section>
  );
}
