// src/components/PlayerCard.tsx
// YAT?STATS — Shared flip-card component for active and all-time player grids

import { fmt, parseDraft, levelLabel, levelClass, gradClass, varsityDots } from "@/lib/playerUtils";
import { toPlayerSlug } from "@/lib/slug";

export interface PlayerCardProps {
  p: Record<string, unknown>;
  resolvedHsid: string;
  photoDefaultUrl: string;
  /** "active" = current roster card; "alltime" = all-time alumni card */
  variant: "active" | "alltime";
}

export default function PlayerCard({ p, resolvedHsid, photoDefaultUrl, variant }: PlayerCardProps) {
  const lvl = levelLabel(String(p.level || ""));
  const lvlCls = levelClass(lvl);
  const isPitcher = p.is_pitcher === true;
  const gc = gradClass(p);
  const dots = varsityDots(p);
  const draft = parseDraft(p.draft_info as string | null);
  const statYear = isPitcher ? p.pitch_year : p.stat_year;
  const pid = String(p.playerid || "");
  const slug = toPlayerSlug(String(p.firstname || ""), String(p.lastname || ""));
  const photoUrl = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${pid}.jpg`;
  const photoFallback = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${pid}.jpg`;
  const silhouetteUrl = `/img/player-silhouette.png`;

  const isActive = !!p.is_active_2025;
  const statusLabel =
    variant === "active"
      ? "ACTIVE 2025"
      : isActive
      ? "ACTIVE 2025"
      : p.draft_info
      ? "RETIRED-DRAFTED"
      : "RETIRED";

  const batterStats = [
    {k:"AVG",v:p.avg},{k:"OBP",v:p.obp},{k:"SLG",v:p.slg},{k:"OPS",v:p.ops},
    {k:"HR",v:p.hr},{k:"RBI",v:p.rbi},{k:"H",v:p.h},{k:"AB",v:p.ab},
    {k:"R",v:p.r},{k:"SB",v:p.sb},{k:"2B",v:p["2b"]},{k:"BB",v:p.bb},
  ];
  const pitcherStats = [
    {k:"ERA",v:p.era},{k:"WHIP",v:p.whip},{k:"IP",v:p.ip},
    {k:"W-L",v:(p.w!==null&&p.l!==null)?`${p.w}-${p.l}`:"--"},
    {k:"K",v:p.ko},{k:"BB",v:variant==="active"?p.pbb:p.pbb||p.bb},{k:"K/9",v:p.k9},{k:"K/BB",v:p.kbb},
    ...(variant === "active"
      ? [{k:"H/9",v:p.h9},{k:"BB/9",v:p.bb9},{k:"SV",v:p.saves},{k:"G",v:p.pg}]
      : [{k:"SV",v:p.saves},{k:"G",v:p.pg}]),
  ];
  const stats = isPitcher ? pitcherStats : batterStats;

  const statsBarLabel =
    variant === "active"
      ? `${statYear ? `${statYear} ` : ""}${isPitcher ? "PITCHING" : "BATTING"}`
      : "CAREER STATS";

  return (
    <article
      className="yat-card"
      data-name={`${p.firstname} ${p.lastname}`.toLowerCase()}
      data-playerid={pid}
      data-level={lvl}
      data-gradclass={gc}
      data-slug={slug}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          {/* FRONT */}
          <div className="yat-face yat-front">
            <div
              className="yat-bg"
              data-src={photoUrl}
              data-fallback={photoFallback}
              data-placeholder={silhouetteUrl}
              style={{backgroundImage:`url('${photoUrl}'), url('${photoDefaultUrl}')`}}
            />
            <div className="yat-shade" />
            <div className="yat-front-content">
              <div className="yat-chips-col">
                {gc && <span className="front-chip">CLASS OF {gc}</span>}
                <span className="front-chip">{statusLabel}</span>
                {lvl && <span className={`front-chip ${lvlCls}`}>{lvl}</span>}
              </div>
              <div className="yat-info-block">
                <div className="yat-name">
                  <span>{String(p.firstname || "")}</span>
                  <span>{String(p.lastname || "")}</span>
                </div>
                <div className="yat-meta">
                  <span>{[p.position, p.bats&&p.throws?`B/T ${p.bats}/${p.throws}`:null].filter(Boolean).join(" · ")}</span>
                </div>
                {dots.length > 0 && (
                  <div className="yat-dots">
                    {dots.map((y, i) => <div key={i} className="yat-dot">{y}</div>)}
                  </div>
                )}
                <div className="yat-game-block">
                  <div className="yat-pill">LAST 3 GAMES</div>
                  <div className="yat-game-text">
                    <span className="yat-log">--</span>
                    {variant === "active" && (
                      <>
                        <span className="yat-log">--</span>
                        <span className="yat-log">--</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div className="yat-face yat-back">
            <div className="yat-bg" style={{backgroundImage:`url('${photoFallback}')`}} />
            <div className="yat-back-content">
              <div className="yat-back-top">
                <div>
                  <div className="yat-back-name">{String(p.display_name || `${p.firstname} ${p.lastname}`)}</div>
                  <div className="yat-back-details">
                    {[p.position,p.height||null,p.weight?`${p.weight} lbs`:null,p.bats&&p.throws?`B/T ${p.bats}/${p.throws}`:null].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <div className="yat-back-nav">
                {variant === "active" ? (
                  <>
                    <button className="yat-back-nav-btn active" data-content="stats">STATS</button>
                    <button className="yat-back-nav-btn" data-content="news">NEWS</button>
                    <button className="yat-back-nav-btn" data-content="social">SOCIAL</button>
                    <button className="yat-back-nav-btn" data-content="mentor">MENTOR</button>
                    <button className="yat-back-nav-btn" data-content="gallery">GALLERY</button>
                  </>
                ) : (
                  <>
                    <button className="yat-back-nav-btn active" data-content="stats">SEASON &amp; CAREER STATISTICS</button>
                    <button className="yat-back-nav-btn" data-content="news">NEWS &amp; VIDEO CLIPS</button>
                    <button className="yat-back-nav-btn" data-content="social">SOCIAL MEDIA</button>
                    <button className="yat-back-nav-btn" data-content="mentor">MENTORSHIP MARKETPLACE</button>
                    <button className="yat-back-nav-btn" data-content="gallery">TIMELINE GALLERY</button>
                  </>
                )}
              </div>
              <div className="yat-fun-zone">
                <div className="yat-stats-bar">{statsBarLabel}</div>
                <div className="yat-stats-grid">
                  {stats.map(({k,v}) => (
                    <div key={k} className="yat-stat">
                      <div className="yat-stat-label">{k}</div>
                      <div className="yat-stat-val">{fmt(k,v)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {draft && <div className="yat-back-draft"><strong>Draft:</strong> {draft}</div>}
              <a href={`/${resolvedHsid}/player/${pid}/${slug}`} className="yat-profile-link">VIEW FULL PROFILE →</a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
