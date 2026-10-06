import type { Metadata } from "next";
import "./globals.css";
import StyledJsxRegistry from "./registry";
import { AnalyticsPageViews } from "@/components/analytics/Analytics";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

// Google Analytics, on the live yatstats.com sites only (not Vercel
// previews or localhost). Page views are sent by AnalyticsPageViews so each
// carries the school, player and tab, so GA's own automatic one is off.
const GA_BOOTSTRAP = `(function(){var h=location.hostname.toLowerCase();if(h!=='yatstats.com'&&!/\\.yatstats\\.com$/.test(h))return;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';document.head.appendChild(s);})();`;

export const metadata: Metadata = {
  title: {
    default: "YAT?STATS",
    template: "%s | YAT?STATS",
  },
  description: "YAT?STATS school microsites — Track active and all-time baseball alumni.",
  manifest: "/manifest.webmanifest",
};

const BOOTSTRAP_SECTIONS = ['news', 'alltime', 'current', 'fantasy', 'mentor', 'partner', 'about', 'faq'];

const SECTION_BOOTSTRAP =
  "try{var m=(location.hash||'').match(/^#sec-([a-z]+)/);" +
  "if(m&&" + JSON.stringify(BOOTSTRAP_SECTIONS) + ".indexOf(m[1])!==-1){" +
  "var d=document.documentElement,x=function(){d.removeAttribute('data-yat-sec');};d.setAttribute('data-yat-sec',m[1]);" +
  "addEventListener('load',function(){setTimeout(x,4000);});setTimeout(x,20000);}}catch(e){}";

const SECTION_BOOTSTRAP_CSS =
  "html[data-yat-sec] .yat-section{display:none!important}" +
  BOOTSTRAP_SECTIONS.map((s) => `html[data-yat-sec="${s}"] #sec-${s}{display:block!important}`).join('') +
  "html[data-yat-sec] .yat-row3-shell,html[data-yat-sec] .yat-row4-shell{visibility:hidden}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ESPN-inspired preview: Archivo for UI/headlines, Barlow Condensed
            for compact sports data, Source Serif 4 for editorial reading. */}
        <script dangerouslySetInnerHTML={{ __html: GA_BOOTSTRAP }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://yatstats-assets.s3.us-west-2.amazonaws.com" />
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@500;600;700;800&family=Caveat:wght@500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Oswald:wght@300;400;500;700&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
        {/* Opening a school page on a section (/<school>#sec-news from a
            profile, the portal, a shared link) painted the Active gallery
            first - the server always renders it - and only switched once
            the shell's JS ran: a flash of the home page between pages.
            Mark the requested section before the first paint and show only
            it; SharedShell clears the mark once it has switched. The
            fallback (in case the shell never runs) counts from the page's
            load, not its first byte: a fixed 3s from the first byte ran out
            before a slow school page hydrated and flashed the gallery
            anyway. Rows 3-4 wait too, since they render for the gallery
            until the shell knows the section. */}
        <script dangerouslySetInnerHTML={{ __html: SECTION_BOOTSTRAP }} />
        <style dangerouslySetInnerHTML={{ __html: SECTION_BOOTSTRAP_CSS }} />
      </head>
      <body suppressHydrationWarning>
        {/* Applies a saved light theme before the first paint. Without it
            the page painted dark and flipped to light a moment later, once
            the drawer script read localStorage. Same key and classes as
            DrawerRailController. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('yat-theme')==='light'){document.documentElement.classList.add('light-theme');document.body.classList.add('light-theme');}}catch(e){}",
          }}
        />
        <StyledJsxRegistry>{children}</StyledJsxRegistry>
        <AnalyticsPageViews />
      </body>
    </html>
  );
}
