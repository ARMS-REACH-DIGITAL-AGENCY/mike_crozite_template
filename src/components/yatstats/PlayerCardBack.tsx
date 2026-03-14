// src/components/yatstats/PlayerCardBack.tsx
// Back face of the flip card: header (mug + identity + CTA), meta row,
// 6-tab action bar (Schedule / Stats / News / Social / Connect / Upload),
// and per-tab content panels.  Schedule + News are lazy-loaded via JS.

import SafeImage from "@/components/SafeImage";
import FunZone from "@/components/yatstats/FunZone";
import { fmt, parseDraft, levelLabel, formatSchoolName } from "@/lib/playerUtils";
import { resolveHeadshotUrl } from "@/lib/headshot";

interface PlayerCardBackProps {
  player: Record<string, unknown>;
  resolvedHsid: string;
  /** Formatted school name, e.g. "HAMILTON HIGH SCHOOL". */
  schoolName?: string;
  /** School location string, e.g. "CHANDLER, AZ". */
  location?: string;
  /** When true, shows "CAREER STATS" label instead of the season year. */
  isAllTime?: boolean;
}

const CARD_TABS = [
  { id: "schedule", icon: "ri-calendar-schedule-line", label: "Schedule" },
  { id: "stats",    icon: "ri-bar-chart-2-line",        label: "Stats"    },
  { id: "news",     icon: "ri-article-line",             label: "News"     },
  { id: "social",   icon: "ri-share-line",               label: "Social"   },
  { id: "connect",  icon: "ri-group-line",               label: "Connect"  },
  { id: "upload",   icon: "ri-upload-2-line",            label: "Upload"   },
] as const;

export default function PlayerCardBack({
  player: p,
  resolvedHsid,
  schoolName,
  location,
  isAllTime,
}: PlayerCardBackProps) {
  const isPitcher = p.is_pitcher === true;
  const draft     = parseDraft(p.draft_info as string | null);
  const pid       = String(p.playerid || "");
  const slug      = String(p.slug || "");
  const firstName = String(p.firstname || "").trim();
  const displayName = String(p.display_name || `${firstName} ${p.lastname || ""}`).trim();

  const S3_BASE     = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
  const thenUrl     = `${S3_BASE}/players/then/${pid}.jpg`;
  const silhouette  = isPitcher ? `/img/then-pitcher-silhouette.png` : `/img/then-batter-silhouette.png`;
  // Resolve the official headshot (MLB CDN → S3 mugs → fallback chain handled by SafeImage)
  const mugUrl      = resolveHeadshotUrl(p) ?? `${S3_BASE}/players/mugs/${pid}.jpg`;
  const profileUrl  = `/${resolvedHsid}/player/${pid}/${slug}`;

  const displaySchoolName = schoolName || (p.hsname ? formatSchoolName(String(p.hsname)) : "");
  const displayLocation   = location   || String(p.hslocation || "").toUpperCase();

  const lvl      = levelLabel(String(p.level || ""));
  const teamName = String(p.team_name || "");
  const pos      = String(p.position  || "");
  const ht       = String(p.height    || "");
  const wt       = String(p.weight    || "");
  const bt       = `${p.bats  || "–"}/${p.throws || "–"}`;

  const statYear     = isPitcher ? p.pitch_year : p.stat_year;
  const statBarLabel = isAllTime
    ? "CAREER STATS"
    : `${statYear ? `${statYear} ` : ""}SEASON STATS`;

  const batterStats = [
    { k: "AVG", v: p.avg }, { k: "HR",  v: p.hr  }, { k: "RBI", v: p.rbi  },
    { k: "R",   v: p.r   }, { k: "SB",  v: p.sb  }, { k: "OPS", v: p.ops  },
    { k: "H",   v: p.h   }, { k: "BB",  v: p.bb  }, { k: "AB",  v: p.ab   },
    { k: "2B",  v: p["2b"] }, { k: "3B", v: p["3b"] }, { k: "G", v: p.g   },
  ];
  const pitcherStats = [
    { k: "ERA",  v: p.era  }, { k: "WHIP", v: p.whip }, { k: "IP",   v: p.ip   },
    { k: "W-L",  v: (p.w !== null && p.l !== null) ? `${p.w}-${p.l}` : "--" },
    { k: "K",    v: p.ko   }, { k: "BB",   v: isAllTime ? (p.pbb ?? p.bb) : p.pbb },
    { k: "K/9",  v: p.k9   }, { k: "K/BB", v: p.kbb  },
    { k: "H/9",  v: p.h9   }, { k: "BB/9", v: p.bb9  }, { k: "SV", v: p.saves }, { k: "G", v: p.pg },
  ];
  const stats = isPitcher ? pitcherStats : batterStats;

  // Pre-encode share text for social buttons
  const shareText  = encodeURIComponent(`@yat_stats #YATABOY ${displayName}!`);
  const shareUrl   = encodeURIComponent(`https://yatstats.com${profileUrl}`);
  const tweetHref  = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const fbHref     = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`;

  return (
    <div className="yat-face yat-back">
      <div className="yat-back-content">

        {/* ── Header: mug | identity | CTA ── */}
        <div className="yat-back-header">
          <div className="yat-back-mug">
            <SafeImage
              src={mugUrl}
              fallbackSrc={thenUrl}
              alt={displayName}
              className="yat-back-mug-img"
              placeholderSrc={silhouette}
            />
          </div>
          <div className="yat-back-identity">
            {displayLocation   && <div className="yat-back-location">{displayLocation}</div>}
            {displaySchoolName && <div className="yat-back-school">{displaySchoolName}</div>}
            <div className="yat-back-name">{displayName}</div>
          </div>
          <a href={profileUrl} className="yat-back-cta">
            CONNECT WITH {firstName || "THIS PLAYER"} ON {firstName ? "HIS" : "THEIR"}{" "}
            YAT?STATS PROFILE PAGE
          </a>
        </div>

        {/* ── Meta row ── */}
        <div className="yat-back-meta">
          <div className="yat-back-meta-left">
            {[teamName, pos].filter(Boolean).join(" | ")}
            {lvl && <span className="yat-back-status">{lvl}</span>}
          </div>
          <div className="yat-back-meta-right">
            {["B/T " + bt, ht, wt ? wt + " LB" : "", draft ? "DRAFTED: " + draft : ""]
              .filter(Boolean).join(" | ")}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="yat-back-action-bar" role="tablist">
          {CARD_TABS.map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`yat-back-action-btn${id === "stats" ? " active" : ""}`}
              data-card-tab={id}
              aria-label={label}
              aria-selected={id === "stats"}
            >
              <i className={icon} />
              <span className="yat-back-action-label">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab panels ── */}

        {/* SCHEDULE — lazy-loaded */}
        <div className="yat-back-tab-panel" data-tab-panel="schedule" hidden>
          <div className="yat-back-lazy" data-lazy-tab="schedule">
            <div className="yat-back-spinner"><i className="ri-loader-4-line" /></div>
          </div>
        </div>

        {/* STATS — server-rendered, shown by default */}
        <div className="yat-back-tab-panel" data-tab-panel="stats">
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

        {/* NEWS — lazy-loaded */}
        <div className="yat-back-tab-panel" data-tab-panel="news" hidden>
          <div className="yat-back-lazy" data-lazy-tab="news">
            <div className="yat-back-spinner"><i className="ri-loader-4-line" /></div>
          </div>
        </div>

        {/* SOCIAL — static share buttons */}
        <div className="yat-back-tab-panel" data-tab-panel="social" hidden>
          <div className="yat-back-social">
            <div className="yat-back-social-hint">
              Share a <strong>#YATABOY</strong> post with your followers and tag{" "}
              <strong>@yat_stats</strong>!
            </div>
            <div className="yat-back-social-grid">
              {/* X / Twitter — web share intent */}
              <a href={tweetHref} target="_blank" rel="noopener noreferrer"
                 className="yat-back-share-btn yat-share-x">
                <i className="ri-twitter-x-line" />
                <span>Post on X</span>
              </a>
              {/* Facebook */}
              <a href={fbHref} target="_blank" rel="noopener noreferrer"
                 className="yat-back-share-btn yat-share-fb">
                <i className="ri-facebook-fill" />
                <span>Share on FB</span>
              </a>
              {/* Instagram — no web share intent; copy the link */}
              <button type="button" className="yat-back-share-btn yat-share-ig"
                data-copy-share={`@yat_stats #YATABOY ${displayName}! https://yatstats.com${profileUrl}`}>
                <i className="ri-instagram-line" />
                <span>Copy for IG</span>
              </button>
              {/* TikTok */}
              <button type="button" className="yat-back-share-btn yat-share-tt"
                data-copy-share={`@yat_stats #YATABOY ${displayName}! https://yatstats.com${profileUrl}`}>
                <i className="ri-tiktok-line" />
                <span>Copy for TT</span>
              </button>
            </div>
          </div>
        </div>

        {/* CONNECT — Mentorship CTA */}
        <div className="yat-back-tab-panel" data-tab-panel="connect" hidden>
          <div className="yat-back-cta-panel">
            <i className="ri-group-line yat-back-cta-icon" />
            <div className="yat-back-cta-title">MENTORSHIP MARKETPLACE</div>
            <div className="yat-back-cta-body">
              Send {firstName || "this player"} a video message and receive a personal reply.
              Transactions handled securely via Stripe.
            </div>
            <a href={`${profileUrl}#tab-mentor`} className="yat-back-cta-btn">
              CONNECT WITH {firstName || "THIS PLAYER"}
            </a>
          </div>
        </div>

        {/* UPLOAD — Photo gallery CTA */}
        <div className="yat-back-tab-panel" data-tab-panel="upload" hidden>
          <div className="yat-back-cta-panel">
            <i className="ri-upload-2-line yat-back-cta-icon" />
            <div className="yat-back-cta-title">UPLOAD A PHOTO</div>
            <div className="yat-back-cta-body">
              Got a great shot of {firstName || "this player"}? Upload it to their Chronological Career Path Photo Gallery.
              Approved photos appear on the timeline.
            </div>
            <a href={`${profileUrl}#tab-gallery`} className="yat-back-cta-btn">
              UPLOAD A PHOTO
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
