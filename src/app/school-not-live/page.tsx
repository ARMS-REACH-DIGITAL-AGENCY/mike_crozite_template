// src/app/school-not-live/page.tsx
// Fallback page shown when a user navigates to a school that does not yet
// have a live YAT?STATS microsite. Accepts the following query parameters:
//   school  – school name
//   city    – city name
//   state   – state abbreviation
//   reason  – "potential" | "inactive"
//             potential : school has active alumni but no live site yet
//             inactive  : school has no active alumni / not currently tracked

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "School Not Yet Live · YAT?STATS",
  description: "This school does not currently have an active YAT?STATS microsite.",
};

interface PageProps {
  searchParams: Promise<{ school?: string; city?: string; state?: string; reason?: string }>;
}

export default async function SchoolNotLivePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const schoolName = sp.school?.trim() || "This School";
  const city = sp.city?.trim() || "";
  const state = sp.state?.trim() || "";
  const reason = sp.reason === "inactive" ? "inactive" : "potential";

  const location = [city, state].filter(Boolean).join(", ");

  const isPotential = reason === "potential";

  const statusLabel = isPotential ? "NOT LIVE YET" : "NOT CURRENTLY ACTIVE";
  const statusColor = isPotential ? "#ffc107" : "#9e9e9e";

  const body = isPotential
    ? "This school has alumni active in professional or collegiate baseball, but a dedicated YAT?STATS microsite has not been launched yet. It may be added to the network in the future."
    : "This school does not currently have enough active alumni in professional or collegiate baseball to qualify for a YAT?STATS microsite. Schools are added as their alumni reach the professional and high-level collegiate ranks.";

  const ctaItems = isPotential
    ? [
        { icon: "ri-notification-3-line", label: "Notify Me When It's Live", sub: "Get an alert when this school goes live" },
        { icon: "ri-building-line", label: "Become a Founding Sponsor", sub: "Support this school's launch on YAT?STATS" },
        { icon: "ri-mail-send-line", label: "Request This School", sub: "Let us know you want this school added" },
      ]
    : [
        { icon: "ri-question-line", label: "Learn Why This School Isn't Live", sub: "Understand how schools qualify for YAT?STATS" },
        { icon: "ri-mail-send-line", label: "Request This School", sub: "Nominate this school for future tracking" },
      ];

  return (
    <>
      <style>{`
        :root{--bg:#0c0c0c;--fg:#f2f2f2;--muted:#9e9e9e;--line:rgba(255,255,255,.08);--card-bg:#171717;--header-bg:#000}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
        a{color:inherit;text-decoration:none}
      `}</style>

      {/* Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css" />

      {/* TOP BAR */}
      <header style={{background:"var(--header-bg)",borderBottom:"1px solid var(--line)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="https://home.yatstats.com" style={{display:"flex",alignItems:"center",gap:"8px"}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
            alt="YAT?STATS"
            style={{height:"28px",width:"auto",filter:"invert(1)"}}
          />
        </a>
        <a
          href="https://home.yatstats.com"
          style={{fontSize:"13px",fontFamily:"Oswald,sans-serif",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:"6px"}}
        >
          <i className="ri-arrow-left-line" /> Back
        </a>
      </header>

      {/* MAIN CONTENT */}
      <main style={{flex:"1",maxWidth:"640px",margin:"0 auto",padding:"48px 20px",width:"100%"}}>

        {/* STATUS BADGE */}
        <div style={{marginBottom:"20px"}}>
          <span style={{
            display:"inline-block",
            fontFamily:"Oswald,sans-serif",
            fontSize:"10px",
            fontWeight:700,
            letterSpacing:".12em",
            textTransform:"uppercase",
            padding:"4px 10px",
            borderRadius:"8px",
            border:`1px solid ${statusColor}`,
            color:statusColor,
            background:`${statusColor}18`,
          }}>
            {statusLabel}
          </span>
        </div>

        {/* SCHOOL NAME */}
        <h1 style={{
          fontFamily:'"Bebas Neue",Oswald,sans-serif',
          fontSize:"clamp(32px,7vw,52px)",
          letterSpacing:".03em",
          lineHeight:1,
          marginBottom:"8px",
        }}>
          {schoolName}
        </h1>

        {location && (
          <p style={{fontFamily:"Oswald,sans-serif",fontSize:"14px",fontWeight:300,color:"var(--muted)",marginBottom:"24px",letterSpacing:".06em",textTransform:"uppercase"}}>
            {location}
          </p>
        )}

        {/* EXPLANATION */}
        <p style={{fontFamily:"Oswald,sans-serif",fontSize:"15px",fontWeight:300,lineHeight:1.7,color:"rgba(255,255,255,.75)",marginBottom:"40px"}}>
          {body}
        </p>

        {/* CTAs */}
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"48px"}}>
          {ctaItems.map((cta) => (
            <div
              key={cta.label}
              role="button"
              aria-disabled="true"
              tabIndex={0}
              style={{
                display:"flex",
                alignItems:"center",
                gap:"14px",
                background:"var(--card-bg)",
                border:"1px solid var(--line)",
                borderRadius:"14px",
                padding:"16px 20px",
                cursor:"not-allowed",
                opacity:.65,
                textAlign:"left",
                width:"100%",
                pointerEvents:"none",
              }}
            >
              <i className={cta.icon} style={{fontSize:"22px",color:"var(--muted)",flexShrink:0}} />
              <div>
                <div style={{fontFamily:'"Bebas Neue",Oswald,sans-serif',fontSize:"16px",letterSpacing:".04em",color:"var(--fg)",marginBottom:"2px"}}>
                  {cta.label}
                </div>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:"11px",fontWeight:300,color:"var(--muted)"}}>
                  {cta.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* BACK LINK */}
        <div style={{borderTop:"1px solid var(--line)",paddingTop:"24px",textAlign:"center"}}>
          <a
            href="https://home.yatstats.com"
            style={{
              fontFamily:"Oswald,sans-serif",
              fontSize:"13px",
              fontWeight:400,
              color:"rgba(255,255,255,.5)",
              letterSpacing:".06em",
            }}
          >
            ← Back to YAT?STATS Home
          </a>
        </div>
      </main>
    </>
  );
}
