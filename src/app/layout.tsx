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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The card-name font (Indigo), fetched right away instead of when
            the browser first reaches a card -- with font-display:block in
            YatStyles, names wait for it (14KB) rather than drawing in the
            fallback font and then visibly swapping. */}
        <script dangerouslySetInnerHTML={{ __html: GA_BOOTSTRAP }} />
        <link rel="preload" href="/fonts/Indigo.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://yatstats-assets.s3.us-west-2.amazonaws.com" />
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;700&family=Bebas+Neue&family=Caveat:wght@500;700&family=Newsreader:opsz,wght@6..72,400;6..72,700&display=swap"
          rel="stylesheet"
        />
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
