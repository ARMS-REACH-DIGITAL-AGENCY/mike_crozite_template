// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite (gallery sub-type)
// The global header, drawers, and interactivity are provided by [hsid]/layout.tsx.
// This page renders only: gallery-specific secondary icons + flip-card grid + sections.

import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
  getSchoolBySubdomainParts,
} from "@/lib/db";
import { parseSubdomainSlugState } from "@/lib/subdomainUtils";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { getCanonicalBaseUrl } from "@/lib/canonicalUrl";
import { gradClass, formatSchoolName } from "@/lib/playerUtils";

import HeroHeader from "@/components/yatstats/HeroHeader";
import FiltersDrawer from "@/components/yatstats/FiltersDrawer";
import PlayerCard from "@/components/yatstats/PlayerCard";
import SafeImage from "@/components/SafeImage";
import { resolveHeadshotUrl } from "@/lib/headshot";
import {
  SPONSOR_BANNER_IMG_URL,
  SPONSOR_FOOTER_HREF,
  SPONSOR_FOOTER_NAME,
  SPONSOR_BANNER_ERROR_SCRIPT,
} from "@/lib/sponsorBanner";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  try {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  let school = host ? await getSchoolByUrl(`https://${host}`) : null;
  // Fallback 1: numeric hsid direct lookup
  if (!school) school = await getSchoolByHsid(hsid);
  // Fallback 2: {slug}.{state}.yatstats.com subdomain naming protocol
  if (!school && host) {
    const parts = parseSubdomainSlugState(host, process.env.ROOT_DOMAIN);
    if (parts) school = await getSchoolBySubdomainParts(parts.slug, parts.state);
  }
  const name = (school as Record<string, unknown>)?.hsname as string || "Your School";
  const loc = (school as Record<string, unknown>)?.hslocation as string || "";
  const locParts = loc.split(",").map((s: string) => s.trim());
  const stateAbbr = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase() : "";
  const titleParts = [name.toUpperCase(), stateAbbr, "YAT?STATS - Where They YAT?"].filter(Boolean);
  const schoolHsid = (school as Record<string, unknown>)?.hsid as string || hsid;
  const crestUrl = getSchoolCrestUrl(schoolHsid);
  const canonicalUrl = getCanonicalBaseUrl(school as Record<string, unknown> | null, schoolHsid);
  return {
    title: titleParts.join(" | "),
    description: `Track active and all-time baseball alumni from ${name} (${loc}).`,
    alternates: { canonical: canonicalUrl },
    icons: {
      icon: [
        { url: crestUrl, type: "image/png" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ],
      apple: crestUrl,
    },
  };
  } catch {
    return {
      title: "YAT?STATS - Where They YAT?",
      description: "Track active and all-time baseball alumni on YAT?STATS.",
    };
  }
}

export default async function SchoolPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  let school: Record<string, unknown> | null = null;
  try {
    school = (host ? await getSchoolByUrl(`https://${host}`) : null) as Record<string, unknown> | null;
    // Fallback 1: numeric hsid direct lookup
    if (!school) school = await getSchoolByHsid(hsid) as Record<string, unknown> | null;
    // Fallback 2: {slug}.{state}.yatstats.com subdomain naming protocol
    if (!school && host) {
      const parts = parseSubdomainSlugState(host, process.env.ROOT_DOMAIN);
      if (parts) school = await getSchoolBySubdomainParts(parts.slug, parts.state) as Record<string, unknown> | null;
    }
  } catch {
    notFound();
  }
  if (!school) notFound();

  // Redirect numeric hsid paths to the school's custom domain (skip on preview deployments)
  const micrositeUrl = (school as Record<string, unknown>).microsite_url as string | undefined;
  const isNumericHsid = /^\d+$/.test(hsid);
  const isPreview = host.includes("vercel.app") || host.includes("localhost");
  if (micrositeUrl && isNumericHsid && !isPreview) {
    permanentRedirect(micrositeUrl.replace(/\/$/, ""));
  }

  const resolvedHsid = String(school.hsid ?? hsid);
  const [activeRoster, allTimeRoster] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
  ]);

  const schoolName = formatSchoolName(String(school.hsname || ""));
  const location = (String(school.hslocation || "")).toUpperCase();
  const canonicalBase = getCanonicalBaseUrl(school, resolvedHsid);
  const photoDefaultUrl = `${canonicalBase}/assets/img/now_players/default.jpg`;

  const gradClasses = Array.from(new Set(
    [...(activeRoster as Record<string, unknown>[]), ...(allTimeRoster as Record<string, unknown>[])].map((p) => gradClass(p)).filter(Boolean)
  )).sort().reverse();

  return (
    <>
      {/* Gallery secondary icons injected into layout's #topbarSecondaryIcons slot */}
      <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var slot=document.getElementById('topbarSecondaryIcons');
  if(!slot)return;
  var btnFilter=document.createElement('button');
  btnFilter.className='yat-icon-btn';
  btnFilter.id='openFilters';
  btnFilter.type='button';
  btnFilter.setAttribute('aria-label','Open filters');
  btnFilter.innerHTML='<i class="ri-filter-3-line"></i>';
  var btnReset=document.createElement('button');
  btnReset.className='yat-icon-btn';
  btnReset.id='filtersReset2';
  btnReset.type='button';
  btnReset.setAttribute('aria-label','Reset filters');
  btnReset.innerHTML='<i class="ri-restart-line"></i>';
  slot.appendChild(btnFilter);
  slot.appendChild(btnReset);
})();
` }} />

      {/* GALLERY THUMBNAIL RAIL (flip_link_photo_strip) — square 1:1 official headshots, sticky row 3.
          Sits immediately below the header (rows 1+2). HeroHeader taglines appear BELOW in row 4.
          Sources in priority order:
          1) MLB/MiLB CDN  (player_source_map mlb_api row)
          2) College URL   (player_headshots.headshot_url — SideArm/Presto)
          3) S3 mugs/      (legacy fallback)  */}
      <section className="gallery-strip" aria-label="Player thumbnail rail">
        <button className="gallery-strip-arrow left hidden" id="stripArrowLeft" type="button" aria-label="Scroll left">
          <i className="ri-arrow-left-s-line" />
        </button>
        <div className="gallery-strip-inner" id="galleryStripInner">
          {(activeRoster as Record<string, unknown>[]).map((p) => {
            const pid = String(p.playerid);
            const headshotUrl = resolveHeadshotUrl(p) ?? `/img/player-silhouette.png`;
            const name = String(p.display_name || p.last_name || pid);
            return (
              <a key={pid} className="gallery-slot" href={`#player-${pid}`} aria-label={name} title={name}>
                <SafeImage
                  className="gallery-slot-img"
                  src={headshotUrl}
                  alt={name}
                  fallbackSrc="/img/player-silhouette.png"
                />
              </a>
            );
          })}
        </div>
        <button className="gallery-strip-arrow right" id="stripArrowRight" type="button" aria-label="Scroll right">
          <i className="ri-arrow-right-s-line" />
        </button>
      </section>

      {/* Wire sticky header offset and scroll arrows for the gallery strip */}
      <script dangerouslySetInnerHTML={{ __html: `
(function(){
  function wireGalleryStrip(){
    var header=document.getElementById('site-header');
    var inner=document.getElementById('galleryStripInner');
    var btnL=document.getElementById('stripArrowLeft');
    var btnR=document.getElementById('stripArrowRight');
    if(!inner||!btnL||!btnR)return;
    function syncHeaderH(){
      if(header){document.documentElement.style.setProperty('--header-h',header.offsetHeight+'px');}
    }
    syncHeaderH();
    if(typeof ResizeObserver!=='undefined'&&header){new ResizeObserver(syncHeaderH).observe(header);}
    btnL.addEventListener('click',function(){inner.scrollBy({left:-(Math.round(inner.clientWidth*0.7)||300),behavior:'smooth'});});
    btnR.addEventListener('click',function(){inner.scrollBy({left:Math.round(inner.clientWidth*0.7)||300,behavior:'smooth'});/* scroll ~70% of visible width */});
    function updateArrows(){
      var atLeft=inner.scrollLeft<=1;
      var atRight=inner.scrollLeft+inner.clientWidth>=inner.scrollWidth-1;
      btnL.classList.toggle('hidden',atLeft);
      btnR.classList.toggle('hidden',atRight);
    }
    inner.addEventListener('scroll',updateArrows,{passive:true});
    updateArrows();
  }
  if(document.readyState==='loading'){addEventListener('DOMContentLoaded',wireGalleryStrip);}else{wireGalleryStrip();}
})();
` }} />

      {/* ROW 4 — TAGLINE (non-sticky, scrolls with page).
          "FLIP FOR STATS!" / "WHERE THEY YAT?" sit here, below the sticky strip.
          This aligns row 3 (the strip) identically with the player profile's career-strip. */}
      <HeroHeader />

      {/* RIGHT DRAWER — gallery-only filters panel */}
      <FiltersDrawer gradClasses={gradClasses} />

      {/* MAIN CONTENT */}
      <main id="main-content">

        {/* ACTIVE ALUMNI */}
        <section id="sec-active" className="yat-section visible">
          <div className="yat-grid" id="active-grid">
            {(activeRoster as Record<string, unknown>[]).length === 0 ? (
              <div className="yat-empty">
                <div className="yat-empty-icon">⚾</div>
                <div className="yat-empty-title">No active players found</div>
                <div className="yat-empty-sub">Check back once the 2026 season begins</div>
              </div>
            ) : (activeRoster as Record<string, unknown>[]).map((p) => (
              <PlayerCard
                key={String(p.playerid)}
                player={p}
                resolvedHsid={resolvedHsid}
                photoDefaultUrl={photoDefaultUrl}
                schoolName={schoolName}
                location={location}
              />
            ))}
          </div>
        </section>

        {/* ALL-TIME LIST */}
        <section id="sec-alltime" className="yat-section">
          <div className="yat-grid" id="alltime-grid">
            {(allTimeRoster as Record<string, unknown>[]).length === 0 ? (
              <div className="yat-empty">
                <div className="yat-empty-icon">⚾</div>
                <div className="yat-empty-title">No alumni found</div>
                <div className="yat-empty-sub">Check back as we continue building the database</div>
              </div>
            ) : (allTimeRoster as Record<string, unknown>[]).map((p) => (
              <PlayerCard
                key={String(p.playerid)}
                player={p}
                resolvedHsid={resolvedHsid}
                photoDefaultUrl={photoDefaultUrl}
                schoolName={schoolName}
                location={location}
                isAllTime
              />
            ))}
          </div>
        </section>

        {/* NEWS */}
        <section id="sec-news" className="yat-section">
          <div className="yat-news-wrap">
            <div className="yat-news-header">
              <div>
                <div className="yat-news-title">ACTIVE ALUMNI NEWS</div>
                <div className="yat-news-sub">Latest news mentions for {schoolName} baseball alumni</div>
              </div>
            </div>
            {/* News filter bar — populated/wired by YatInteractivity */}
            <div className="yat-news-filters" id="newsFilters">
              <input id="newsFilterName" className="yat-news-filter-input" type="search" placeholder="Filter by player name…" />
              <span className="yat-news-filter-label">Level:</span>
              <div className="yat-news-filter-chips" id="newsFilterLevels" />
              <span className="yat-news-filter-label">Class:</span>
              <div className="yat-news-filter-chips" id="newsFilterGradClass" />
              <button id="newsFilterActive" className="yat-news-chip" type="button">Active Only</button>
              <button id="newsFilterReset" className="yat-news-filter-reset" type="button">Reset</button>
            </div>
            <div className="yat-news-grid" id="news-grid">
              {/* Populated client-side via /api/news/:hsid */}
              <div className="yat-news-loading">
                <div className="yat-news-loading-spinner" />
                <div className="yat-news-loading-text">LOADING ALUMNI NEWS&hellip;</div>
              </div>
            </div>
          </div>
        </section>

        {/* CURRENT TEAM */}
        <section id="sec-team" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🏟️</div>
            <div className="yat-placeholder-title">Current Team Roster</div>
            <div className="yat-placeholder-body">
              The current {schoolName} varsity roster will appear here once the season begins.
            </div>
          </div>
        </section>

        {/* MENTOR */}
        <section id="sec-mentor" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">Mentorship Marketplace</div>
            <div className="yat-placeholder-body">
              Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.
            </div>
          </div>
        </section>

        {/* PARTNER */}
        <section id="sec-partner" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">PCD Action Partner Program</div>
            <div className="yat-placeholder-body">
              Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
              <br /><br />
              <a
                href="mailto:sponsor@yatstats.com"
                style={{
                  display: "inline-block",
                  background: "#00e676",
                  color: "#000",
                  fontFamily: '"Bebas Neue",Oswald,sans-serif',
                  fontSize: "14px",
                  letterSpacing: ".1em",
                  padding: "10px 24px",
                  borderRadius: "4px",
                }}
              >
                Get In Touch
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sec-faq" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">❓</div>
            <div className="yat-placeholder-title">FAQ&apos;s</div>
            <div className="yat-placeholder-body">
              Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon.
            </div>
          </div>
        </section>

      </main>

      {/* SPONSOR FOOTER — banner image loaded from S3 (sponsors/footer-banner.png),
          falls back to text via inline error handler script below.
          To upload: yatstats-assets bucket / sponsors/footer-banner.png (recommended: 800×120 px PNG) */}
      <footer className="yat-footer">
        <a href={SPONSOR_FOOTER_HREF} target="_blank" rel="noopener noreferrer" id="sponsorFooterLink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="sponsorBannerImg"
            src={SPONSOR_BANNER_IMG_URL}
            alt={`${SPONSOR_FOOTER_NAME} — Presented by`}
            className="sponsor-banner-img"
          />
          <noscript>
            <span className="sponsor-text">Presented by</span>
            <span className="sponsor-name">{SPONSOR_FOOTER_NAME}</span>
          </noscript>
        </a>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: SPONSOR_BANNER_ERROR_SCRIPT }} />

      {/* Hash-anchor navigation: when returning from player profile via #player-{pid}, make the
          correct section visible and scroll smoothly to the card, then briefly highlight it. */}
      <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var hash=window.location.hash;
  if(!hash||hash.indexOf('player-')!==1)return;
  var el=document.getElementById(hash.slice(1));
  if(!el)return;
  var section=el.closest('.yat-section');
  if(section&&!section.classList.contains('visible')){
    document.querySelectorAll('.yat-section').forEach(function(s){s.classList.remove('visible');});
    section.classList.add('visible');
    /* Update breadcrumb label */
    var sectionLabel=document.getElementById('yatSectionLabel');
    if(sectionLabel){
      var idMap={active:'ACTIVE BASEBALL ALUMNI',alltime:'NEXT-LEVEL ALL-TIME LIST'};
      sectionLabel.textContent=idMap[section.id.replace('sec-','')]||section.id.replace('sec-','').toUpperCase();
    }
  }
  setTimeout(function(){
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.add('is-highlighted');
    setTimeout(function(){el.classList.remove('is-highlighted');},1800);
  },120);
})();
      `}} />

      {/* Article detail overlay + modal drawer */}
      <div className="yat-article-overlay" id="articleOverlay" />
      <aside className="yat-article-modal" id="articleModal" role="dialog" aria-modal="true" aria-label="Article detail">
        <div className="yat-article-modal-top">
          <span className="yat-article-modal-label">ALUMNI NEWS</span>
          <button className="yat-article-modal-close" id="articleModalClose" aria-label="Close">
            <i className="ri-close-line" />
          </button>
        </div>
        {/* Image populated by JS */}
        <div id="articleModalImg" />
        <div className="yat-article-modal-body" id="articleModalBody">
          {/* Populated by JS when a card is clicked */}
        </div>
      </aside>
    </>
  );
}
