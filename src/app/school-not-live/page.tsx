// src/app/school-not-live/page.tsx
// Fallback page for schools that do not currently have a live YAT?STATS microsite.
// Query params supported:
//   school
//   city
//   state
//   reason       "potential" | "inactive"
//   hsid
//   active
//   mlb
//   natRank
//   stateRank
//   allTime
//   draftedRatio

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "School Status · YAT?STATS",
  description: "School status page for schools that do not currently have a live YAT?STATS microsite.",
};

interface SearchParams {
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
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function fmtVal(v?: string, fallback = "—") {
  return v && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function buildHomeUrl() {
  return "https://yatstats.com";
}

function buildLeadUrl(sp: SearchParams) {
  const params = new URLSearchParams();
  if (sp.school) params.set("school", sp.school);
  if (sp.city) params.set("city", sp.city);
  if (sp.state) params.set("state", sp.state);
  if (sp.reason) params.set("reason", sp.reason);
  if (sp.hsid) params.set("hsid", sp.hsid);
  return "/school-not-live?" + params.toString();
}

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
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: "16px",
        padding: "16px 14px",
        minHeight: "92px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: '"Bebas Neue", Oswald, sans-serif',
          fontSize: "28px",
          lineHeight: 1,
          letterSpacing: ".03em",
          color: highlight ? "var(--gold)" : "var(--fg)",
          marginBottom: "8px",
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

function CtaCard({
  icon,
  title,
  body,
  href,
  subtle,
}: {
  icon: string;
  title: string;
  body: string;
  href: string;
  subtle?: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
        padding: "18px 18px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,.08)",
        background: subtle ? "rgba(255,255,255,.025)" : "linear-gradient(180deg, rgba(255,193,7,.08), rgba(255,255,255,.03))",
        textDecoration: "none",
        color: "inherit",
        transition: "transform .15s ease, border-color .15s ease",
      }}
    >
      <i
        className={icon}
        style={{
          fontSize: "22px",
          color: subtle ? "var(--muted)" : "var(--gold)",
          marginTop: "2px",
          flexShrink: 0,
        }}
      />
      <div>
        <div
          style={{
            fontFamily: '"Bebas Neue", Oswald, sans-serif',
            fontSize: "20px",
            letterSpacing: ".04em",
            color: "var(--fg)",
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
            color: "rgba(255,255,255,.72)",
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

  const schoolName = sp.school?.trim() || "This School";
  const city = sp.city?.trim() || "";
  const state = sp.state?.trim() || "";
  const reason = sp.reason === "inactive" ? "inactive" : "potential";
  const location = [city, state].filter(Boolean).join(", ");

  const isPotential = reason === "potential";
  const homeUrl = buildHomeUrl();

  const active = fmtVal(sp.active);
  const mlb = fmtVal(sp.mlb);
  const natRank = sp.natRank ? `#${sp.natRank}` : "—";
  const stateRank = sp.stateRank ? `#${sp.stateRank}` : "—";
  const allTime = fmtVal(sp.allTime);
  const draftedRatio = fmtVal(sp.draftedRatio);

  const statusLabel = isPotential ? "NOT LIVE YET" : "NOT CURRENTLY TRACKED";
  const statusColor = isPotential ? "#ffc107" : "#9e9e9e";

  const heroBody = isPotential
    ? "This school shows active baseball alumni in our current records, but it was not selected as one of the initial YAT?STATS live microsites. That launch group was shaped around the first 1,024-school competitive field and monetization priorities."
    : "According to our current tracked records, we do not show active college or pro baseball alumni from this school at this time. That does not necessarily mean no alumni exist in the real world. It means they are not currently represented in the tracked YAT?STATS player universe.";

  const explainerTitle = isPotential
    ? "Why this school is not live"
    : "Why this school is not currently active";

  const explainerBody = isPotential
    ? "Some schools have players in college and pro baseball but still were not included in the initial microsite field. The original cutoff served a broader launch purpose, including the 1,024-school structure used for the season-long fantasy bracket tournament. That cutoff was directional, not a permanent judgment on the value of this school."
    : "The current YAT?STATS player universe is tied to the schools that made the initial 1,024-school field. As a result, players from other schools may be missing from the current feed unless they are added into the tracked source universe. If you believe this school has alumni we should be following, we want to hear from you.";

  const ctaPrimary = isPotential
    ? {
        icon: "ri-user-follow-line",
        title: "Request This School",
        body: "Tell us why this school deserves a microsite, and help us measure fan, alumni, booster, and sponsor interest.",
      }
    : {
        icon: "ri-search-eye-line",
        title: "Help Us Verify This School",
        body: "If you know current college or pro players from this school, submit the lead so we can review whether they should be added to the tracked universe.",
      };

  const ctaSecondary = isPotential
    ? {
        icon: "ri-building-line",
        title: "Become a Founding Sponsor",
        body: "A sponsor, booster group, or school partner may help justify a future launch even when a school is outside the first 1,024-site field.",
      }
    : {
        icon: "ri-team-line",
        title: "Know Another School To Follow?",
        body: "Search for another school that may already have a live microsite, or bring us the names of players who should be represented here.",
      };

  const ctaTertiary = {
    icon: "ri-home-4-line",
    title: "Go to YAT?STATS Home",
    body: "Return to the main YAT?STATS experience to explore live microsites, search other schools, and enter the broader fan journey.",
  };

  return (
    <>
      <style>{`
        :root{
          --bg:#050505;
          --bg-soft:#0d0d0d;
          --fg:#f5f5f5;
          --muted:#9d9d9d;
          --line:rgba(255,255,255,.08);
          --line-strong:rgba(255,255,255,.14);
          --gold:#ffc107;
          --card:#121212;
          --card-2:#171717;
          --header:#000;
        }
        *,*::before,*::after{box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{
          margin:0;
          background:linear-gradient(180deg,#000 0%,#050505 100%);
          color:var(--fg);
          font-family:Oswald,system-ui,sans-serif;
          -webkit-font-smoothing:antialiased;
        }
        a{color:inherit;text-decoration:none}
      `}</style>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css" />

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(0,0,0,.92)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <a href={homeUrl} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
              alt="YAT?STATS"
              style={{ height: "30px", width: "auto", filter: "invert(1)" }}
            />
          </a>

          <a
            href={homeUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "rgba(255,255,255,.66)",
              letterSpacing: ".04em",
            }}
          >
            <i className="ri-arrow-left-line" />
            Back to Home
          </a>
        </div>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px 72px" }}>
        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "24px",
            background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
            overflow: "hidden",
            marginBottom: "18px",
          }}
        >
          <div style={{ padding: "24px 24px 12px" }}>
            <div style={{ marginBottom: "16px" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  padding: "5px 11px",
                  borderRadius: "999px",
                  border: `1px solid ${statusColor}`,
                  color: statusColor,
                  background: `${statusColor}18`,
                }}
              >
                {statusLabel}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr .9fr",
                gap: "24px",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: '"Bebas Neue", Oswald, sans-serif',
                    fontSize: "clamp(40px,7vw,86px)",
                    lineHeight: 0.92,
                    letterSpacing: ".03em",
                    marginBottom: "10px",
                  }}
                >
                  {schoolName}
                </div>

                {location ? (
                  <div
                    style={{
                      fontSize: "15px",
                      color: "var(--muted)",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      marginBottom: "24px",
                    }}
                  >
                    {location}
                  </div>
                ) : null}

                <p
                  style={{
                    fontSize: "17px",
                    lineHeight: 1.7,
                    color: "rgba(255,255,255,.82)",
                    maxWidth: "760px",
                    margin: 0,
                  }}
                >
                  {heroBody}
                </p>
              </div>

              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,.025)",
                  padding: "18px",
                  alignSelf: "start",
                }}
              >
                <div
                  style={{
                    fontFamily: '"Bebas Neue", Oswald, sans-serif',
                    fontSize: "22px",
                    letterSpacing: ".04em",
                    marginBottom: "8px",
                  }}
                >
                  What this means
                </div>
                <div style={{ fontSize: "14px", lineHeight: 1.65, color: "rgba(255,255,255,.72)" }}>
                  {isPotential
                    ? "Fans have something here to care about. The school simply was not rolled into the first live microsite network."
                    : "At the moment, our tracked records do not show active baseball alumni to follow from this school. We may need better source coverage or lead submissions."}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr .85fr",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "24px",
              background: "var(--card)",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "28px",
                letterSpacing: ".04em",
                marginBottom: "14px",
              }}
            >
              {explainerTitle}
            </div>

            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,.78)" }}>
              {explainerBody}
            </p>

            <div
              style={{
                marginTop: "18px",
                padding: "16px 18px",
                borderRadius: "16px",
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,.025)",
              }}
            >
              <div
                style={{
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: "19px",
                  letterSpacing: ".04em",
                  marginBottom: "6px",
                }}
              >
                Important context
              </div>
              <div style={{ fontSize: "14px", lineHeight: 1.65, color: "rgba(255,255,255,.72)" }}>
                The original 1,024-school field was also used to support launch structure and fantasy bracket design. It was a strategic selection model, not a permanent verdict on every school outside the network.
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "24px",
              background: "var(--card)",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "28px",
                letterSpacing: ".04em",
                marginBottom: "14px",
              }}
            >
              Next best action
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <CtaCard
                icon={ctaPrimary.icon}
                title={ctaPrimary.title}
                body={ctaPrimary.body}
                href={buildLeadUrl(sp)}
              />
              <CtaCard
                icon={ctaSecondary.icon}
                title={ctaSecondary.title}
                body={ctaSecondary.body}
                href={homeUrl}
                subtle
              />
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "24px",
            background: "var(--card-2)",
            padding: "24px",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "18px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: "30px",
                  letterSpacing: ".04em",
                  marginBottom: "4px",
                }}
              >
                School Success Snapshot
              </div>
              <div style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.6 }}>
                A quick look at the stats currently tied to this school in the search result payload.
              </div>
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,.5)",
                letterSpacing: ".06em",
                textTransform: "uppercase",
              }}
            >
              Block 4 / school stats
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            <StatTile label="Active Alumni" value={active} highlight />
            <StatTile label="MLB" value={mlb} />
            <StatTile label="National Rank" value={natRank} />
            <StatTile label="State Rank" value={stateRank} />
            <StatTile label="All-Time" value={allTime} />
            <StatTile label="Drafted" value={draftedRatio} />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "24px",
              background: "var(--card)",
              padding: "22px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "24px",
                letterSpacing: ".04em",
                marginBottom: "10px",
              }}
            >
              For fans
            </div>
            <div style={{ fontSize: "14px", lineHeight: 1.7, color: "rgba(255,255,255,.72)" }}>
              Register interest, tell us who this school’s next-level alumni are, and help us identify whether demand exists for expansion.
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "24px",
              background: "var(--card)",
              padding: "22px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "24px",
                letterSpacing: ".04em",
                marginBottom: "10px",
              }}
            >
              For schools & boosters
            </div>
            <div style={{ fontSize: "14px", lineHeight: 1.7, color: "rgba(255,255,255,.72)" }}>
              A school, booster club, or sponsor may help justify deeper coverage, especially if there is a strong alumni story and a path to engagement.
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "24px",
              background: "var(--card)",
              padding: "22px",
            }}
          >
            <div
              style={{
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: "24px",
                letterSpacing: ".04em",
                marginBottom: "10px",
              }}
            >
              For YAT?STATS
            </div>
            <div style={{ fontSize: "14px", lineHeight: 1.7, color: "rgba(255,255,255,.72)" }}>
              This page captures intent without dropping the visitor into a dead end, while also creating a future place for real lead-gen forms and conversion paths.
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "24px",
            background: "var(--card)",
            padding: "24px",
          }}
        >
          <div
            style={{
              fontFamily: '"Bebas Neue", Oswald, sans-serif',
              fontSize: "28px",
              letterSpacing: ".04em",
              marginBottom: "14px",
            }}
          >
            Continue the journey
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            <CtaCard
              icon={ctaTertiary.icon}
              title={ctaTertiary.title}
              body={ctaTertiary.body}
              href={homeUrl}
            />
            <CtaCard
              icon="ri-search-line"
              title="Search Other Schools"
              body="Head back into the YAT?STATS experience and explore schools that already have live microsites and active alumni pages."
              href={homeUrl}
              subtle
            />
          </div>

          <div
            style={{
              marginTop: "22px",
              paddingTop: "18px",
              borderTop: "1px solid var(--line)",
              textAlign: "center",
            }}
          >
            <a
              href={homeUrl}
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,.52)",
                letterSpacing: ".06em",
              }}
            >
              ← Back to YAT?STATS Home
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
