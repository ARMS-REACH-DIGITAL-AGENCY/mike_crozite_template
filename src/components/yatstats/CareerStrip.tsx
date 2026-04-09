// src/components/yatstats/CareerStrip.tsx
// Client component for the player career timeline strip (Block 3).
// Renders all three S3 image slots (then / back / now) and hides any
// that fail to load via onError — no server-side HEAD probing required.
"use client";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

const IMG_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100px",
  objectFit: "cover",
  objectPosition: "top center",
  display: "block",
  borderRadius: 0,
  border: "none",
  outline: "none",
};

const SLOT_STYLE: React.CSSProperties = {
  flex: "1 1 0",
  minWidth: "80px",
  height: "100px",
  position: "relative",
  overflow: "hidden",
};

function CareerSlot({ src }: { src: string }) {
  return (
    <div
      className="gallery-slot"
      style={SLOT_STYLE}
    >
      <img
        src={src}
        alt=""
        style={IMG_STYLE}
        onError={(e) => {
          // Hide the parent slot entirely when the image 404s/403s
          const slot = (e.currentTarget as HTMLImageElement).parentElement;
          if (slot) slot.style.display = "none";
        }}
      />
    </div>
  );
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const slots = [
    `${S3_BASE}/players/then/${playerId}.jpg`,
    `${S3_BASE}/players/back/${playerId}.jpg`,
    `${S3_BASE}/players/now/${playerId}.jpg`,
  ];

  return (
    <div className="gallery-strip" id="playerCareerStrip">
      <div className="gallery-strip-inner">
        {slots.map((src, idx) => (
          <CareerSlot key={idx} src={src} />
        ))}
      </div>
    </div>
  );
}
