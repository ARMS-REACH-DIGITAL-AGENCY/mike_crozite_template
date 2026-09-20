// Replaces /img/flip-card-return-icon.png, a raster PNG baked onto a solid
// black background that showed as an ugly black box on anything but a
// matching dark surface. This is a plain currentColor stroke on a
// transparent background, so it inherits whatever text color the theme
// (light or dark) already applies to its container - no separate light/dark
// asset needed.
export default function FlipCardIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M4.2 10.8c-2.3 1.6-2.3 3.9.3 5.1 2.6 1.2 6.7 1.5 10.7.4" />
      <path d="M16 13.6l3.4 2.9-3.6 2" />
    </svg>
  );
}
