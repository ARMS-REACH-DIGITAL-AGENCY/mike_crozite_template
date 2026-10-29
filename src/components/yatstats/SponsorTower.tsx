type SponsorTowerProps = {
  placement: "school-news" | "player-news" | "player-stories";
  className?: string;
};

/**
 * The one shared 300x600 desktop sponsor slot.
 * Mobile in-feed sponsor cards are intentionally separate placements.
 */
export default function SponsorTower({ placement, className = "" }: SponsorTowerProps) {
  const school = placement === "school-news";
  return (
    <aside
      className={["yat-desktop-sponsor-tower", className].filter(Boolean).join(" ")}
      data-yat-sponsor-slot="300x600"
      data-yat-sponsor-placement={placement}
      aria-label={school ? "Alumni News title sponsor tower" : "Player Profile Partner sponsor tower"}
    >
      <small>{school ? "TITLE SPONSOR · ACTIVE ALUMNI NEWS" : "PLAYER PROFILE PARTNER"}</small>
      <strong>{school ? <>ADVERTISING<br />TOWER</> : <>ADVERTISER<br />PLACEMENT</>}</strong>
      <span>300 × 600 DESKTOP TOWER</span>
    </aside>
  );
}
