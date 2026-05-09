// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// Uses the shared gallery-strip / gallery-strip-inner container (same fixed
// height and constrained max-width as the gallery page strip), but uses the
// career-slot class so each image renders at its natural aspect ratio rather
// than the fixed 72px width used for headshot thumbnails on the gallery page.
//
// LINK BEHAVIOUR:
//   The first slot (HS "then" image) links back to the player's canonical
//   high-school microsite flip card using the player profile context URL.
//   Example: https://mount-lebanon.pa.yatstats.com/2705?view=active&player=173395#player-173395
"use client";

import { useContext } from "react";
import { SchoolContext } from "@/context/SchoolContext";
import { usePlayerProfile } from "@/context/PlayerProfileContext";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

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

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = usePlayerProfile();

  const hsid = String(playerProfile?.playerHsid || schoolData?.hsid || "").trim();
  const href = flipCardHref(playerProfile?.playerSchoolUrl, hsid, playerId);

  const slots = [
    { src: `${S3_BASE}/players/then/${playerId}.jpg`, href },
    { src: `${S3_BASE}/players/back/${playerId}.jpg` },
    { src: `${S3_BASE}/players/now/${playerId}.jpg` },
  ];

  return (
    <div className="gallery-strip" id="playerCareerStrip">
      <div className="gallery-strip-inner">
        {slots.map(({ src, href: slotHref }, idx) => (
          <CareerSlot key={idx} src={src} href={slotHref} />
        ))}
      </div>
    </div>
  );
}
