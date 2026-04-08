// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
//
// Layout (matches the Jake Gorrel sample):
//   • Strip has a FIXED height (200 px on mobile, 240 px on wider screens).
//   • Each image renders at that height; its width scales with its natural ratio.
//     → portrait (5:7)  → narrow slot
//     → landscape (7:5) → wide slot
//   • Images are flush edge-to-edge with no gaps.
//   • If combined widths exceed the viewport the strip scrolls horizontally.
//   • Any slot whose S3 image 404s/403s is hidden via onError.
//
// Folder order (left → right): then/ → back/ → now/
"use client";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function CareerSlot({ src }: { src: string }) {
  return (
    <div
      className="career-slot"
      style={{ flexShrink: 0, lineHeight: 0 }}
    >
      <img
        src={src}
        alt=""
        // height:100% fills the strip height; width:auto preserves aspect ratio
        style={{ height: "100%", width: "auto", display: "block" }}
        onError={(e) => {
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
    <div
      id="playerCareerStrip"
      className="gallery-strip"
      style={{
        width: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        // Hide scrollbar track but keep scrolling functional
        scrollbarWidth: "none",
      } as React.CSSProperties}
    >
      <div
        className="gallery-strip-inner"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          // Fixed strip height — images scale their widths to match
          height: "200px",
          gap: 0,
        }}
      >
        {slots.map((src, idx) => (
          <CareerSlot key={idx} src={src} />
        ))}
      </div>
    </div>
  );
}
