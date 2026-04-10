// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// Uses the shared gallery-strip / gallery-strip-inner container (same fixed
// height and constrained max-width as the gallery page strip), but uses the
// career-slot class so each image renders at its natural aspect ratio rather
// than the fixed 72px width used for headshot thumbnails on the gallery page.
//
// Image loading strategy:
//   Each slot uses a direct <img src> tag. If the image fails to load (403 or 404),
//   the slot is hidden. This matches the original behaviour before the silhouette patch.
//
//   NOTE: Some players/then/{id}.jpg objects in S3 have a private ACL and return 403.
//   The correct fix for those players is to set public-read ACL on the S3 objects.
//   Silhouette substitution was reverted — it made the S3 ACL problem visible on the
//   profile page when it was previously invisible on the gallery page.
//
// LINK BEHAVIOUR:
//   The first slot (HS "then" image) links back to the player's flip card on the
//   active alumni gallery page — /{hsid}#player-{playerId} — identical to clicking
//   a headshot thumbnail in the gallery strip on the gallery page.
//   The back and now slots are plain (no link) unless specified otherwise.
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
        // Hide the parent slot entirely when the image 404s/403s
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
  const hsid = schoolData?.hsid ?? "";

  // Link the HS "then" image back to the player's flip card on the gallery page.
  // The gallery page is /{hsid} and each flip card has id="player-{playerId}".
  const flipCardHref = hsid ? `/${hsid}#player-${playerId}` : undefined;

  const slots = [
    { src: `${S3_BASE}/players/then/${playerId}.jpg`, href: flipCardHref },
    { src: `${S3_BASE}/players/back/${playerId}.jpg` },
    { src: `${S3_BASE}/players/now/${playerId}.jpg` },
  ];

  return (
    <div className="gallery-strip" id="playerCareerStrip">
      <div className="gallery-strip-inner">
        {slots.map(({ src, href }, idx) => (
          <CareerSlot key={idx} src={src} href={href} />
        ))}
      </div>
    </div>
  );
}
