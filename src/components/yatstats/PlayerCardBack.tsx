// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card: HEADSHOT image, CTA, icon nav, stats grid, fun zone

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";
import { getNowSilhouetteUrl } from "@/lib/playerImage";

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  headshotUrl: string | null;
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

  const displayName = String(p.display_name || `${p.firstname} ${p.lastname}`);
  const firstName = String(p.firstname || displayName.split(" ")[0] || "PLAYER").toUpperCase();
  const nowSilhouetteUrl = getNowSilhouetteUrl(isPitcher);

  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}SEASON STATS`;

  const team = String(
    p.current_team ||
      p.team_name ||
      p.org_name ||
      p.team ||
      p.school_name ||
      ""
  ).trim();

  const level = String(p.level || "").trim().toUpperCase();

  const status = isAllTime
    ? !!p.is_active_2025
      ? "ACTIVE 2025"
      : p.draft_info
        ? "RETIRED-DRAFTED"
        : "RETIRED"
    : "ACTIVE 2025";

  const position = String(p.position || "").trim();
  const height = String(p.height || "").trim();
  const weight = String(p.weight || "").trim();
  const bats = String(p.bats || "").trim();
  const throwsHand = String(p.throws || "").trim();
  const college = String(p.college || "").trim() || "N/A";

  const line1Parts = [
    team || null,
    level && level !== team.toUpperCase() ? level : null,
    status,
  ].filter(Boolean);

  const line1 = line1Parts.join(" - ");

  const line2 = [
    position || null,
    height ? `H: ${height}` : null,
    weight ? `W: ${weight}` : null,
    bats && throwsHand ? `B/T: ${bats}/${throwsHand}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const draftLine = draft ? `Draft: ${draft}` : null;
  const collegeLine = `Colleges: ${college}`;

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
        <div className="yat-back-panel">
          <div className="yat-back-top">
            <div className="yat-back-left">
              <div className="yat-back-name-banner">{displayName}</div>

              <a
                href={profileHref}
                className="yat-back-headshot-link"
                aria-label={`Open ${displayName}'s player profile page`}
              >
                <div className="yat-back-headshot-wrap">
                  <SafeImage
                    src={headshotUrl}
                    alt={displayName}
                    className="yat-back-headshot"
                    placeholderSrc={nowSilhouetteUrl}
                  />
                </div>
              </a>

              <div className="yat-back-bio">
                {line1 && <div className="yat-back-bio-line">{line1}</div>}
                {line2 && <div className="yat-back-bio-line">{line2}</div>}
                {draftLine && <div className="yat-back-bio-line">{draftLine}</div>}
                <div className="yat-back-bio-line">{collegeLine}</div>
              </div>
            </div>

            <a
              href={profileHref}
              className="yat-back-cta"
              aria-label={`Connect with ${displayName} on his player profile page`}
            >
              <span>
                CONNECT WITH {firstName}
                <br />
                ON HIS PLAYER PROFILE PAGE
                <br />
                AND SHARE YOUR MEMORIES!
              </span>
            </a>
          </div>

          <div className="yat-back-iconnav" aria-hidden="true">
            <div className="yat-back-iconnav-item">
              <i className="ri-calendar-event-line" />
              <span>Schedule</span>
            </div>
            <div className="yat-back-iconnav-item is-active">
              <i className="ri-bar-chart-box-line" />
              <span>Stats</span>
            </div>
            <div className="yat-back-iconnav-item">
              <i className="ri-newspaper-line" />
              <span>News</span>
            </div>
            <div className="yat-back-iconnav-item">
              <i className="ri-share-line" />
              <span>Social</span>
            </div>
            <div className="yat-back-iconnav-item">
              <i className="ri-team-line" />
              <span>Connect</span>
            </div>
            <div className="yat-back-iconnav-item">
              <i className="ri-image-add-line" />
              <span>Upload</span>
            </div>
          </div>

          <div className="yat-back-stats">
            <div className="yat-stats-bar yat-stats-bar-target">{statBarLabel}</div>

            <div className={`yat-stats-grid ${isPitcher ? "yat-stats-grid-3" : "yat-stats-grid-4"}`}>
              {stats.map(({ k, v }) => (
                <div key={k} className="yat-stat yat-stat-target">
                  <div className="yat-stat-label yat-stat-label-target">{k}</div>
                  <div className="yat-stat-val yat-stat-val-target">{fmt(k, v)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <FunZone />
      </div>
    </div>
  );
}
