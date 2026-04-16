// src/app/school-not-live/page.tsx

import type { Metadata } from "next";
import { CREST_FALLBACK_PATH } from "@/lib/schoolAssets";

type SearchParams = {
  school?: string;
  city?: string;
  state?: string;
  reason?: string;
  hsid?: string;
  active?: string;
  mlb?: string;
  natRank?: string;
  stateRank?: string;
  allTime?: string;
  draftedRatio?: string;
};

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function fmtValue(v?: string) {
  if (!v || String(v).trim() === "") return "—";
  return String(v).trim();
}

function toUpperSafe(v?: string) {
  return (v || "").trim().toUpperCase();
}

function buildHomeHref() {
  return "https://home.yatstats.com";
}

/**
 * Replace this with your real GHL / lead capture URL when ready.
 * Keeping it centralized makes the swap easy.
 */
function buildLeadHref(sp: SearchParams) {
  const qs = new URLSearchParams();
  if (sp.school) qs.set("school", sp.school);
  if (sp.city) qs.set("city", sp.city);
  if (sp.state) qs.set("state", sp.state);
  if (sp.reason) qs.set("reason", sp.reason);
  if (sp.hsid) qs.set("hsid", sp.hsid);
  return `${buildHomeHref()}?${qs.toString()}`;
}

export const metadata: Metadata = {
  title: "School Status · YAT?STATS",
  description: "School status page for schools without a live YAT?STATS microsite.",
};

function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        background: "var(--panel)",
        borderRadius: "16px",
        padding: "14px 14px 12px",
        minHeight: "88px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontFamily: '"Bebas Neue", Oswald, sans-serif',
          fontSize: "30px",
          lineHeight: 1,
          letterSpacing: ".03em",
          color: highlight ? "var(--gold)" : "var(--fg)",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "Oswald, sans-serif",
          fontSize: "11px",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function StoryTile({
  title,
  sub,
  icon,
  href,
}: {
  title: string;
  sub: string;
  icon: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        border: "1px solid var(--line)",
        borderRadius: "16px",
        overflow: "hidden",
        background:
          "linear-gradient(180deg, rgba(255,193,7,.07) 0%, rgba(255,255,255,.02) 100%)",
        minHeight: "122px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "14px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,.12)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,.03)",
        }}
      >
        <i className={icon} style={{ fontSize: "20px", color: "var(--gold)" }} />
      </div>

      <div>
        <div
          style={{
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: "20px",
            letterSpacing: ".04em",
            marginBottom: "4px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "Oswald, sans-serif",
            fontSize: "12px",
            lineHeight: 1.45,
            color: "rgba(255,255,255,.74)",
          }}
        >
          {sub}
        </div>
      </div>
    </a>
  );
}

function ActionCard({
  title,
  body,
  href,
  icon,
  primary = false,
}: {
  title: string;
  body: string;
  href: string;
  icon: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
        borderRadius: "16px",
        padding: "18px",
        border: primary ? "1px solid rgba(255,193,7,.4)" : "1px solid var(--line)",
        background: primary
          ? "linear-gradient(180deg, rgba(255,193,7,.12), rgba(255,255,255,.03))"
          : "var(--panel)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "12px",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.03)",
        }}
      >
        <i className={icon} style={{ fontSize: "21px", color: primary ? "var(--gold)" : "var(--fg)" }} />
      </div>

      <div>
        <div
          style={{
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: "22px",
            letterSpacing: ".04em",
            marginBottom: "4px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "Oswald, sans-serif",
            fontSize: "13px",
            lineHeight: 1.55,
            color: "rgba(255,255,255,.76)",
          }}
        >
          {body}
        </div>
      </div>
    </a>
  );
}

export default async function SchoolNotLivePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const schoolName = sp.school?.trim() || "THIS SCHOOL";
  const city = sp.city?.trim() || "";
  const state = sp.state?.trim() || "";
  const reason = sp.reason === "inactive" ? "inactive" : "potential";
  const isPotential = reason === "potential";

  const location = [city, state].filter(Boolean).join(", ");
  const hsid = sp.hsid?.trim() || "";

  const crestUrl = hsid
    ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/${hsid}.png`
    : CREST_FALLBACK_PATH;

  const active = fmtValue(sp.active);
  const mlb = fmtValue(sp.mlb);
  const natRank = sp.natRank ? `#${sp.natRank}` : "—";
  const stateRank = sp.stateRank ? `#${sp.stateRank}` : "—";
  const allTime = fmtValue(sp.allTime);
  const draftedRatio = fmtValue(sp.draftedRatio);

  const homeHref = buildHomeHref();
  const leadHref = buildLeadHref(sp);

  const statusBadge = isPotential ? "NOT LIVE YET" : "NOT CURRENTLY TRACKED";

  const heroLine = isPotential
    ? "YAT?STATS tracks active baseball alumni from this school, but a dedicated microsite is not live yet."
    : "YAT?STATS does not currently show active baseball alumni from this school in our tracked records.";

  const primaryTitle = isPotential ? "GET UPDATES FOR THIS SCHOOL" : "TELL US WHO WE SHOULD TRACK";
  const primaryBody = isPotential
    ? "Raise your hand and we’ll let you know when this school gets deeper coverage."
    : "Know a college or pro player from this school? Send us the lead so we can review it.";
  const secondaryTitle = isPotential ? "REQUEST THIS SCHOOL" : "SEARCH ANOTHER SCHOOL";
  const secondaryBody = isPotential
    ? "Show us there is fan, alumni, booster, or sponsor interest here."
    : "Explore another school that may already have a live YAT?STATS microsite.";

  const block5Headline = isPotential
    ? "THIS SCHOOL HAS SOMETHING TO FOLLOW"
    : "WE DON’T CURRENTLY SHOW ANYONE TO FOLLOW";
  const block5Body = isPotential
    ? "We already show active baseball alumni tied to this school in our records. The next step is proving there is enough interest to prioritize a full microsite."
    : "Based on our current records, YAT?STATS does not show active college or pro baseball alumni from this school right now. If we’re missing someone, tell us.";

  return (
    <>
      <style>{`
        :root{
          --bg:#090909;
          --fg:#f3f3f3;
          --muted:#9c9c9c;
          --line:rgba(255,255,255,.08);
          --panel:#141414;
          --panel-2:#111111;
          --gold:#ffc107;
          --header:#000;
          --container:1280px;
        }
        *,*::before,*::after{box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{
          margin:0;
          background:var(--bg);
          color:var(--fg);
          font-family:Oswald,system-ui,sans-serif;
          -webkit-font-smoothing:antialiased;
        }
        a{color:inherit;text-decoration:none}
        .ys-container{max-width:var(--container);margin:0 auto;padding:0 16px}
        .ys-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .ys-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .ys-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        @media (max-width: 1100px){
          .ys-grid-4{grid-template-columns:repeat(2,1fr)}
          .ys-grid-3{grid-template-columns:1fr 1fr}
        }
        @media (max-width: 800px){
          .ys-grid-2,.ys-grid-3,.ys-grid-4{grid-template-columns:1fr}
        }
      `}</style>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css" />

      {/* BLOCK 1 — PLATFORM HEADER */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(0,0,0,.94)",
          borderBottom: "1px solid var(--line)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          className="ys-container"
          style={{
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              aria-label="Menu"
              style={{ background: "none", border: 0, color: "var(--fg)", fontSize: "20px", cursor: "pointer" }}
            >
              <i className="ri-menu-line" />
            </button>
            <button
              type="button"
              aria-label="Settings"
              style={{ background: "none", border: 0, color: "var(--fg)", fontSize: "18px", cursor: "pointer" }}
            >
              <i className="ri-settings-3-line" />
            </button>
          </div>

          <a href={homeHref} style={{ display: "inline-flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
              alt="YAT?STATS"
              style={{ height: "24px", width: "auto", filter: "invert(1)" }}
            />
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <a href={homeHref} style={{ fontSize: "18px", color: "var(--fg)" }} aria-label="Search">
              <i className="ri-search-line" />
            </a>
            <a href={homeHref} style={{ fontSize: "18px", color: "var(--fg)" }} aria-label="Home">
              <i className="ri-home-5-line" />
            </a>
            <a href={homeHref} style={{ fontSize: "18px", color: "var(--fg)" }} aria-label="Account">
              <i className="ri-user-3-line" />
            </a>
          </div>
        </div>
      </header>

      <main className="ys-container" style={{ paddingTop: "16px", paddingBottom: "40px" }}>
        {/* BLOCK 2 — SCHOOL IDENTITY */}
        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "22px",
            overflow: "hidden",
            background: "linear-gradient(180deg, #0d0d0d 0%, #111 100%)",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "16px",
              alignItems: "center",
              padding: "18px",
            }}
          >
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "18px",
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,.02)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={crestUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = CREST_FALLBACK_PATH;
                }}
              />
            </div>

            <div>
              <div style={{ marginBottom: "10px" }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    padding: "5px 10px",
                    borderRadius: "999px",
                    border: `1px solid ${isPotential ? "var(--gold)" : "rgba(255,255,255,.22)"}`,
                    color: isPotential ? "var(--gold)" : "rgba(255,255,255,.7)",
                    background: isPotential ? "rgba(255,193,7,.10)" : "rgba(255,255,255,.03)",
                  }}
                >
                  {statusBadge}
                </span>
              </div>

              <h1
                style={{
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: "clamp(40px,7vw,72px)",
                  lineHeight: 0.95,
                  letterSpacing: ".03em",
                  margin: 0,
                }}
              >
                {toUpperSafe(schoolName)}
              </h1>

              {location ? (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "15px",
                    color: "var(--muted)",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                  }}
                >
                  {toUpperSafe(location)}
                </div>
              ) : null}

              <p
                style={{
                  marginTop: "16px",
                  marginBottom: 0,
                  maxWidth: "820px",
                  fontSize: "16px",
                  lineHeight: 1.65,
                  color: "rgba(255,255,255,.82)",
                }}
              >
                {heroLine}
              </p>
            </div>
          </div>
        </section>

        {/* BLOCK 3 — INTERACTIVE ROW */}
        <section style={{ marginBottom: "16px" }}>
          <div className="ys-grid-4">
            <StoryTile
              icon="ri-baseball-line"
              title={isPotential ? "ACTIVE ALUMNI" : "CURRENT STATUS"}
              sub={isPotential ? "This school has players worth following on YAT?STATS." : "We do not currently show active alumni for this school."}
              href={leadHref}
            />
            <StoryTile
              icon="ri-bar-chart-2-line"
              title="SCHOOL STATS"
              sub="See the success snapshot tied to this school in our records."
              href="#school-stats"
            />
            <StoryTile
              icon="ri-user-heart-line"
              title={isPotential ? "GET UPDATES" : "SUBMIT A PLAYER"}
              sub={isPotential ? "Ask to be notified when this school gets more coverage." : "Know someone we should track? Tell us."}
              href="#primary-action"
            />
            <StoryTile
              icon="ri-arrow-right-up-line"
              title="BACK TO YAT?STATS"
              sub="Explore the main platform and other schools."
              href={homeHref}
            />
          </div>
        </section>

        {/* BLOCK 4 — SCHOOL SUCCESS META */}
        <section
          id="school-stats"
          style={{
            border: "1px solid var(--line)",
            borderRadius: "22px",
            background: "var(--panel-2)",
            padding: "18px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: "34px",
                  letterSpacing: ".04em",
                  lineHeight: 1,
                }}
              >
                SCHOOL SUCCESS SNAPSHOT
              </div>
              <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--muted)" }}>
                The stats currently associated with this school in YAT?STATS search.
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,.45)", letterSpacing: ".08em", textTransform: "uppercase" }}>
              Block 4 / School Stats
            </div>
          </div>

          <div className="ys-grid-3">
            <StatTile label="Active Alumni" value={active} highlight />
            <StatTile label="MLB" value={mlb} />
            <StatTile label="National Rank" value={natRank} />
            <StatTile label="State Rank" value={stateRank} />
            <StatTile label="All-Time" value={allTime} />
            <StatTile label="Drafted" value={draftedRatio} />
          </div>
        </section>

        {/* BLOCK 5 — MAIN CONTENT / SINGLE IMPORTANT CTA */}
        <section className="ys-grid-2" style={{ marginBottom: "16px" }}>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "22px",
              background: "var(--panel)",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "36px",
                letterSpacing: ".04em",
                lineHeight: 1,
                marginBottom: "14px",
              }}
            >
              {block5Headline}
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "15px",
                lineHeight: 1.75,
                color: "rgba(255,255,255,.78)",
              }}
            >
              {block5Body}
            </p>
          </div>

          <div
            id="primary-action"
            style={{
              border: "1px solid var(--line)",
              borderRadius: "22px",
              background: "var(--panel)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "36px",
                letterSpacing: ".04em",
                lineHeight: 1,
              }}
            >
              NEXT STEP
            </div>

            <ActionCard
              primary
              href={leadHref}
              icon={isPotential ? "ri-notification-3-line" : "ri-user-search-line"}
              title={primaryTitle}
              body={primaryBody}
            />

            <ActionCard
              href={isPotential ? leadHref : homeHref}
              icon={isPotential ? "ri-mail-send-line" : "ri-search-line"}
              title={secondaryTitle}
              body={secondaryBody}
            />
          </div>
        </section>

        {/* BLOCK 6 — SPONSORSHIP BANNER */}
        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "22px",
            overflow: "hidden",
            background:
              "linear-gradient(90deg, rgba(255,193,7,.08) 0%, rgba(255,255,255,.02) 100%)",
          }}
        >
          <a
            href={leadHref}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: "16px",
              padding: "18px 20px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: "28px",
                  letterSpacing: ".04em",
                  lineHeight: 1,
                  marginBottom: "6px",
                }}
              >
                PCD ACTION PARTNER OPPORTUNITY
              </div>
              <div style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(255,255,255,.76)" }}>
                Sponsors, schools, and boosters can help bring deeper YAT?STATS coverage to programs fans care about.
              </div>
            </div>

            <div
              style={{
                whiteSpace: "nowrap",
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "20px",
                letterSpacing: ".04em",
                color: "var(--gold)",
              }}
            >
              LEARN MORE →
            </div>
          </a>
        </section>
      </main>
    </>
  );
}
