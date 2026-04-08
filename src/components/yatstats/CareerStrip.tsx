// src/components/yatstats/CareerStrip.tsx
// Career-path timeline strip (Block 3) on player profile pages.
//
// Layout rules:
//   • NO fixed height on the strip or the images.
//   • Each image renders at its full natural size (width:auto, height:auto).
//   • The strip height is whatever the tallest image naturally is.
//   • All images in the row share that height (align-items:stretch on the flex row,
//     and each slot is height:100% so it fills the row).
//   • The image inside each slot is height:100%, width:auto — so it fills the slot
//     height and its width scales with its natural aspect ratio.
//   • Landscape images are wider; portrait images are narrower. Both are the same height.
//   • If combined widths exceed the viewport the outer wrapper scrolls horizontally.
//   • Any slot whose S3 image 404s/403s is hidden via onError.
//
// Folder order (left → right): then/ → back/ → now/
"use client";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

function CareerSlot({ src }: { src: string }) {
  return (
    <div
      className="career-slot"
      style={{
        flexShrink: 0,
        // height:100% fills whatever height the flex row settles at
        height: "100%",
        lineHeight: 0,
        overflow: "hidden",
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          // height:100% fills the slot; width:auto preserves aspect ratio
          display: "block",
          height: "100%",
          width: "auto",
          maxWidth: "none",
        }}
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
    // Outer wrapper scrolls horizontally when images are wider than viewport
    <div
      id="playerCareerStrip"
      className="gallery-strip"
      style={{
        width: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
      } as React.CSSProperties}
    >
      {/* Inner flex row — height is driven by the tallest image */}
      <div
        className="gallery-strip-inner"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          gap: 0,
          // width:max-content lets the row be as wide as all images combined
          width: "max-content",
          minWidth: "100%",
        }}
      >
        {slots.map((src, idx) => (
          <CareerSlot key={idx} src={src} />
        ))}
      </div>
    </div>
  );
}
