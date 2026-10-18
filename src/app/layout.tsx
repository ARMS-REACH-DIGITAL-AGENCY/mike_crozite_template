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

const BOOTSTRAP_SECTIONS = ['news', 'alltime', 'current', 'fantasy', 'mentor', 'partner'];

const SECTION_BOOTSTRAP =
  "try{var d=document.documentElement,m=(location.hash||'').match(/^#sec-([a-z]+)/);" +
  "if(/[?&]team=\\d{4}(?:&|$)/.test(location.search))m=[0,'alltime'];" +
  "if(m&&" + JSON.stringify(BOOTSTRAP_SECTIONS) + ".indexOf(m[1])!==-1){" +
  "var x=function(){d.removeAttribute('data-yat-sec');};d.setAttribute('data-yat-sec',m[1]);" +
  "addEventListener('load',function(){setTimeout(x,4000);});setTimeout(x,20000);}}catch(e){}";

// The school splash (SchoolSplash, sent by the school layout before any
// roster loads). Two modes, decided per person before the first paint:
// - full, for someone new to YAT?STATS: the logo slides in from the right,
//   the crest from the left, then they shine; at least 1.6s;
// - quick, for anyone back within 30 days (a yat_seen cookie shared by every
//   school subdomain - a superfan hopping between favorites' schools): the
//   same screen already lit, no minimum, and only if the page is still
//   loading after 0.3s.
// Either way it leaves with a flip, like a flip card: the splash on the
// front, the school's hub on the back (a view transition between the two;
// browsers without one flip the splash away). A short card-flip sound plays
// when the browser allows it - usually only once the visitor has tapped.
// ?splash=... in the address forces the full one (to show it off, or test).
// Ready = 'yat:page-ready' (the gallery strip) or, on pages without a
// gallery, the load event; never longer than 8s. The splash is driven
// through one <style> in <head> (React leaves those alone), never by
// touching the element; its rules start with "html " to outrank the
// splash's own.
const SPLASH_BOOTSTRAP = `try{(function(){
var d=document,h=location.hostname,seen=!/[?&]splash=/.test(location.search)&&/(?:^|;\\s*)yat_seen=1/.test(d.cookie);
var dom=(h==='yatstats.com'||/\\.yatstats\\.com$/.test(h))?';domain=.yatstats.com':'';
d.cookie='yat_seen=1;path=/;max-age=2592000;SameSite=Lax'+dom;
var st=d.createElement('style');st.id='yat-splash-state';d.head.appendChild(st);
var set=function(css){st.textContent=css;};
var P='html #yatSplash';
var QUICK=P+' *,'+P+' *::after{animation:none!important}'+P+' .yat-splash-logo img{animation:yatSplashGlow 2.4s ease-in-out infinite!important}';
var RM=false;try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
var EXIT=RM?P+'{opacity:0!important;pointer-events:none!important}':P+'{pointer-events:none!important;animation:yatSplashFlipAway .3s cubic-bezier(.55,0,1,.45) forwards!important}';
var OFF=P+'{display:none!important}';
var FLIP='::view-transition{background:#000}::view-transition-group(root){animation-duration:.62s}::view-transition-old(root){animation:yatFlipOut .3s cubic-bezier(.55,0,1,.45) both}::view-transition-new(root){animation:yatFlipIn .32s cubic-bezier(0,.55,.45,1) .3s both}@keyframes yatFlipOut{to{transform:perspective(1400px) rotateY(90deg)}}@keyframes yatFlipIn{from{transform:perspective(1400px) rotateY(-90deg)}}';
var sound=function(){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;var c=new A();if(c.state!=='running'){c.close();return;}
var n=c.sampleRate*.16|0,b=c.createBuffer(1,n,c.sampleRate),x=b.getChannelData(0);for(var i=0;i<n;i++)x[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
var s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(900,c.currentTime);f.frequency.exponentialRampToValueAtTime(3800,c.currentTime+.14);g.gain.value=.35;
s.connect(f);f.connect(g);g.connect(c.destination);s.start();setTimeout(function(){c.close();},500);}catch(e){}};
var flip=function(){
if(!RM&&d.startViewTransition){sound();var v=d.createElement('style');v.textContent=FLIP;d.head.appendChild(v);
try{d.startViewTransition(function(){set(OFF);}).finished.then(function(){v.remove();},function(){v.remove();});}catch(e){set(OFF);v.remove();}return;}
if(!RM)sound();set((seen?QUICK:'')+EXIT);setTimeout(function(){set(OFF);},350);};
var t0=Date.now(),ready=false,shown=!seen;
if(seen){set(QUICK+P+'{opacity:0!important;pointer-events:none!important}');
setTimeout(function(){if(!ready){shown=true;set(QUICK);}},300);}
var lift=function(){if(ready)return;ready=true;
if(!shown){set(OFF);return;}
setTimeout(flip,seen?0:Math.max(0,1600-(Date.now()-t0)));};
addEventListener('yat:page-ready',lift);
addEventListener('load',function(){if(!d.getElementById('alltime-grid'))setTimeout(lift,250);});
setTimeout(lift,8000);
})();}catch(e){}`;

const SECTION_BOOTSTRAP_CSS =
  "html[data-yat-sec] .yat-section{display:none!important}" +
  BOOTSTRAP_SECTIONS.map((s) => `html[data-yat-sec="${s}"] #sec-${s}{display:block!important}`).join('') +
  "html[data-yat-sec] .yat-row3-shell,html[data-yat-sec] .yat-row4-shell{visibility:hidden}" +
  "html[data-yat-switching] .yat-row3-shell,html[data-yat-switching] .yat-row4-shell{visibility:hidden}";

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
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOTSTRAP }} />
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
