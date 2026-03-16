// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card: NOW/current image, name, position, draft info, stats grid, fun zone

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft } from "@/lib/playerUtils";

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /** When true, shows "CAREER STATS" label instead of the season year */
  isAllTime?: boolean;
}

export default function PlayerCardBack({ player: p, resolvedHsid, isAllTime }: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft = parseDraft(p.draft_info as string | null);
  const pid = String(p.playerid || "");
  const slug = String(p.slug || "");
  const photoUrl = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${pid}.jpg`;
  const photoFallback = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${pid}.jpg`;
  const backSilhouetteUrl = isPitcher ? `/img/now-pitcher-silhouette.png` : `/img/now-batter-silhouette.png`;

  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}${isPitcher ? "PITCHING" : "BATTING"}`;

  const batterStats = [
    { k: "AVG", v: p.avg }, { k: "OBP", v: p.obp }, { k: "SLG", v: p.slg }, { k: "OPS", v: p.ops },
    { k: "HR", v: p.hr }, { k: "RBI", v: p.rbi }, { k: "H", v: p.h }, { k: "AB", v: p.ab },
    { k: "R", v: p.r }, { k: "SB", v: p.sb }, { k: "2B", v: p["2b"] }, { k: "BB", v: p.bb },
  ];
  const pitcherStats = [
    { k: "ERA", v: p.era }, { k: "WHIP", v: p.whip }, { k: "IP", v: p.ip },
    { k: "W-L", v: (p.w !== null && p.l !== null) ? `${p.w}-${p.l}` : "--" },
    { k: "K", v: p.ko }, { k: "BB", v: isAllTime ? (p.pbb ?? p.bb) : p.pbb },
    { k: "K/9", v: p.k9 }, { k: "K/BB", v: p.kbb },
    { k: "H/9", v: p.h9 }, { k: "BB/9", v: p.bb9 }, { k: "SV", v: p.saves }, { k: "G", v: p.pg },
  ];
  const stats = isPitcher ? pitcherStats : batterStats;

  return (
    <div className="yat-face yat-back">
      <div className="yat-back-content">
        {/* Hero: NOW image + name/position/draft — entire section links to profile */}
        <a href={`/${resolvedHsid}/player/${pid}/${slug}`} className="yat-back-hero">
          <div className="yat-back-img-wrap">
            <SafeImage
              src={photoUrl}
              alt={String(p.display_name || `${p.firstname} ${p.lastname}`)}
              className="yat-back-img"
              fallbackSrc={photoFallback}
              placeholderSrc={backSilhouetteUrl}
            />
          </div>
          <div className="yat-back-info">
            <div className="yat-back-name">
              {String(p.display_name || `${p.firstname} ${p.lastname}`)}
            </div>
            {/* Spec: show Position and B/T only — height/weight omitted intentionally */}
            <div className="yat-back-details">
              {[p.position, p.bats && p.throws ? `B/T ${p.bats}/${p.throws}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {draft && <div className="yat-back-draft">{draft}</div>}
          </div>
        </a>
        <div className="yat-back-stats">
          <div className="yat-stats-bar">{statBarLabel}</div>
          <div className="yat-stats-grid">
            {stats.map(({ k, v }) => (
              <div key={k} className="yat-stat">
                <div className="yat-stat-label">{k}</div>
                <div className="yat-stat-val">{fmt(k, v)}</div>
              </div>
            ))}
          </div>
        </div>
        <FunZone />
      </div>
    </div>
  );
}
