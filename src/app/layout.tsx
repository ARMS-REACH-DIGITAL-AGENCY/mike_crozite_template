import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import StyledJsxRegistry from "./registry";

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
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;700&family=Bebas+Neue&family=Caveat:wght@500;700&display=swap"
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WQHT9SNHLC"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WQHT9SNHLC');
          `}
        </Script>
      </body>
    </html>
  );
}
