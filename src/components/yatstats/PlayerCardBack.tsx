// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card: HEADSHOT image, CTA bubble, player identity, nav row, stats grid, fun zone

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /**
   * Explicitly designated HEADSHOT image URL from player_photos (image_role='HEADSHOT').
   * Pass null when no designated HEADSHOT exists — the silhouette will be shown.
   * Do NOT pass the legacy players/now/{id}.jpg path here.
   */
  headshotUrl: string | null;
  /** When true, shows "CAREER STATS" label instead of the season year */
  isAllTime?: boolean;
}

export default function PlayerCardBack({
  player: p,
  resolvedHsid,
  headshotUrl,
  isAllTime,
}: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const imageId = String(p.playerid || "");
  const slug = String(p.slug || "");
  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;

  const displayName = String(p.display_name || `${p.firstname} ${p.lastname}`).trim();
  const firstName = String(p.firstname || displayName.split(" ")[0] || "this player");
  const photoSrc = headshotUrl;
  const nowSilhouetteUrl = getNowSilhouetteUrl(isPitcher);

  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}${isPitcher ? "SEASON STATS" : "SEASON STATS"}`;

  const bats = p.bats ? String(p.bats) : null;
  const throwsHand = p.throws ? String(p.throws) : null;
  const position = p.position ? String(p.position).replace(/-/g, "/") : null;
  const team = p.current_team ? String(p.current_team) : null;
  const level = p.level ? String(p.level) : null;
  const status = p.status ? String(p.status) : null;
  const height = p.height ? String(p.height) : null;
  const weight = p.weight ? String(p.weight) : null;

  const detailLine1 = [team, level, status].filter(Boolean).join(" | ");
  const detailLine2 = [
    position,
    height ? `H: ${height}` : null,
    weight ? `W: ${weight}` : null,
    bats && throwsHand ? `B/T: ${bats}/${throwsHand}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const draftLine = draft ? `Drafted: ${draft}` : null;
  const collegeLine = p.college ? `College: ${String(p.college)}` : "College: N/A";

  const batterStats = [
    { k: "AVG", v: p.avg },
    { k: "OBP", v: p.obp },
    { k: "SLG", v: p.slg },
    { k: "OPS", v: p.ops },
    { k: "H", v: p.h },
    { k: "R", v: p.r },
    { k: "HR", v: p.hr },
    { k: "RBI", v: p.rbi },
    { k: "AB", v: p.ab },
    { k: "2B", v: p["2b"] },
    { k: "3B", v: p["3b"] },
    { k: "SB", v: p.sb },
  ];

  const pitcherStats = [
    { k: "ERA", v: p.era },
    { k: "WHIP", v: p.whip },
    { k: "IP", v: p.ip },
    { k: "W-L", v: p.w !== null && p.l !== null ? `${p.w}-${p.l}` : "--" },
    { k: "K", v: p.ko },
    { k: "BB", v: isAllTime ? (p.pbb ?? p.bb) : p.pbb },
    { k: "K/9", v: p.k9 },
    { k: "K/BB", v: p.kbb },
    { k: "H/9", v: p.h9 },
    { k: "BB/9", v: p.bb9 },
    { k: "SV", v: p.saves },
    { k: "G", v: p.pg },
  ];

  const stats = isPitcher ? pitcherStats : batterStats;

  return (
    <div className="yat-face yat-back">
      <div className="yat-back-content">
        <div className="yat-back-top">
          <div className="yat-back-top-left">
            <div className="yat-back-name-banner">{displayName}</div>

            <a
              href={profileHref}
              className="yat-back-headshot-link"
              aria-label={`Open ${displayName}'s player profile page`}
            >
              <div className="yat-back-headshot-frame">
                <SafeImage
                  src={photoSrc}
                  alt={displayName}
                  className="yat-back-headshot"
                  placeholderSrc={nowSilhouetteUrl}
                />
              </div>
            </a>

            <div className="yat-back-bio">
              {detailLine1 && <div className="yat-back-bio-line">{detailLine1}</div>}
              {detailLine2 && <div className="yat-back-bio-line">{detailLine2}</div>}
              {draftLine && <div className="yat-back-bio-line yat-back-bio-line-strong">{draftLine}</div>}
              <div className="yat-back-bio-line">{collegeLine}</div>
            </div>
          </div>

          <div className="yat-back-top-right">
            <a
              href={profileHref}
              className="yat-profile-cta"
              aria-label={`Go to ${displayName}'s profile page`}
            >
              <span className="yat-profile-cta-text">
                CONNECT WITH {firstName.toUpperCase()} ON HIS
                <br />
                PLAYER PROFILE PAGE
                <br />
                AND SHARE YOUR MEMORIES!
              </span>
            </a>

            <div className="yat-yachty-wrap" aria-hidden="true">
              <img
                src="/images/yachty/yachty-card-guide.png"
                alt=""
                className="yat-yachty-img"
              />
            </div>
          </div>
        </div>

        <div className="yat-back-nav" aria-hidden="true">
          <div className="yat-back-nav-item">Schedule</div>
          <div className="yat-back-nav-item is-active">Stats</div>
          <div className="yat-back-nav-item">News</div>
          <div className="yat-back-nav-item">Social</div>
          <div className="yat-back-nav-item">Connect</div>
          <div className="yat-back-nav-item">Upload</div>
        </div>

        <div className="yat-back-stats">
          <div className="yat-stats-bar yat-stats-bar-large">{statBarLabel}</div>

          <div className={`yat-stats-grid ${isPitcher ? "yat-stats-grid-3" : "yat-stats-grid-4"}`}>
            {stats.map(({ k, v }) => (
              <div key={k} className="yat-stat yat-stat-large">
                <div className="yat-stat-label yat-stat-label-large">{k}</div>
                <div className="yat-stat-val yat-stat-val-large">{fmt(k, v)}</div>
              </div>
            ))}
          </div>
        </div>

        <FunZone />
      </div>
    </div>
  );
}
