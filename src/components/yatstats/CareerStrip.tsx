// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
// Uses the shared gallery-strip / gallery-strip-inner container (same fixed
// height and constrained max-width as the gallery page strip), but uses the
// career-slot class so each image renders at its natural aspect ratio rather
// than the fixed 72px width used for headshot thumbnails on the gallery page.
//
// Slot order:
//   0 — THEN (HS flip card front)   → fallback: /img/then-batter-silhouette.png
//   1 — BACK (flip card back)       → fallback: hidden (back is optional)
//   2 — NOW  (current pro headshot) → fallback: /img/headshot-silhouette.png
"use client";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// Fallback paths for each slot index. null = hide the slot on error.
const SLOT_FALLBACKS: (string | null)[] = [
  "/img/then-batter-silhouette.png", // THEN — always show something in the left slot
  null,                               // BACK — optional; hide if missing
  "/img/headshot-silhouette.png",    // NOW  — always show something in the right slot
];

function CareerSlot({ src, fallback }: { src: string; fallback: string | null }) {
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
          const img = e.currentTarget as HTMLImageElement;
          if (fallback && img.src !== fallback) {
            // Swap to the silhouette placeholder — keeps the slot visible
            img.src = fallback;
          } else {
            // No fallback (BACK slot) or fallback itself failed — hide the slot
            const slot = img.parentElement;
            if (slot) slot.style.display = "none";
          }
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
          <CareerSlot key={idx} src={src} fallback={SLOT_FALLBACKS[idx] ?? null} />
        ))}
      </div>
    </div>
  );
}
