import type { Metadata } from "next";
import "./globals.css";
import StyledJsxRegistry from "./registry";
import { AnalyticsPageViews } from "@/components/analytics/Analytics";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

// Google Analytics, on the live yatstats.com sites only (not Vercel
// previews or localhost). Page views are sent by AnalyticsPageViews so each
// carries the school, player and tab, so GA's own automatic one is off.
const GA_BOOTSTRAP = `(function(){var h=location.hostname.toLowerCase();if(h!=='yatstats.com'&&!/\\.yatstats\\.com$/.test(h))return;try{var q=new URLSearchParams(location.search),flag=q.get('yat_internal');if(flag==='1'){document.cookie='yat_ga_internal=1;path=/;max-age=31536000;SameSite=Lax;Secure;domain=.yatstats.com';}else if(flag==='0'){document.cookie='yat_ga_internal=;path=/;max-age=0;SameSite=Lax;Secure;domain=.yatstats.com';}if(flag==='1'||flag==='0'){q.delete('yat_internal');var qs=q.toString();history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);}}catch(e){}if(/(?:^|;\\s*)yat_ga_internal=1(?:;|$)/.test(document.cookie))return;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';document.head.appendChild(s);})();`;

export const metadata: Metadata = {
  title: {
    default: "YAT?STATS",
    template: "%s | YAT?STATS",
  },
  description: "YAT?STATS school microsites — Track active and all-time baseball alumni.",
  manifest: "/manifest.webmanifest",
};

const BOOTSTRAP_SECTIONS = ['news', 'alltime', 'current', 'fantasy', 'mentor', 'partner'];

// The deep-linked section must stay pinned until SharedShell hydrates and
// confirms the visible section. A load/elapsed-time cleanup could expose the
// server's default Active gallery while slower school queries were still
// streaming, making All-Time flash and then jump back to the home gallery.

const SECTION_BOOTSTRAP =
  "try{var d=document.documentElement,m=(location.hash||'').match(/^#sec-([a-z]+)/);" +
  "if(/[?&]team=\\d{4}(?:&|$)/.test(location.search))m=[0,'alltime'];" +
  "if(m&&" + JSON.stringify(BOOTSTRAP_SECTIONS) + ".indexOf(m[1])!==-1){" +
  "d.setAttribute('data-yat-sec',m[1]);}}catch(e){}";

// The school splash (SchoolSplash, sent by the school layout before any
// roster loads). Two modes, decided per person before the first paint:
// - full, for someone new to YAT?STATS: the logo slides in from the right,
//   the crest from the left, then they shine; sponsor enters 2.2s after the splash mounts;\n//   allow at least 5.5s for the brand-and-sponsor sequence;
// - no splash for returning visitors to the SAME school within 30 days.
//   Host-only school cookies prevent visits to one school from hiding another's.
//   Direct /{hsid} previews use a school-keyed cookie on the preview hostname.
//   Normal navigation waits for the destination without a takeover overlay.
// On exit the splash slides right, revealing the already-loaded school
// home page underneath. A short transition sound plays
// when the browser allows it - usually only once the visitor has tapped.
// ?splash=... in the address forces the full one (to show it off, or test).
// Ready = 'yat:page-ready' (the gallery strip) or, on pages without a
// gallery, the load event; fallback readiness at 8s, finish by 9s\n// after the splash is mounted if the sponsor is slow. The splash is driven
// through one <style> in <head> (React leaves those alone), never by
// touching the element; its rules start with "html " to outrank the
// splash's own.
const SPLASH_BOOTSTRAP = `try{(function(){
if(location.pathname==='/embed/sponsor-card/preview'||location.pathname==='/embed/sponsor-card/preview/')return;
var d=document,pathParts=location.pathname.split('/').filter(Boolean),replayId=pathParts.length===2&&pathParts[0]==='replay'&&/^[1-9][0-9]*$/.test(pathParts[1])?pathParts[1]:'',replayRoute=location.pathname==='/splash'||!!replayId,forced=replayRoute||/[?&]splash=/.test(location.search),joining=/[?&]join=1(?:&|$)/.test(location.search);
// Every school subdomain has its own host-only 30-day visit cookie.
// On a shared preview domain, /5004 and /5005 get separate keyed cookies.
// The permanent yatstats.com landing page is not a timed school splash.
var hostname=location.hostname.toLowerCase(),liveSchool=hostname.endsWith('.yatstats.com')&&hostname!=='www.yatstats.com';
var seg=location.pathname.split('/')[1]||'',schoolPath=!liveSchool&&/^[1-9][0-9]*$/.test(seg)?seg:'';
var splashCookie=(replayId&&!liveSchool?replayId:schoolPath)?'yat_splash_seen_'+(replayId&&!liveSchool?replayId:schoolPath):'yat_splash_seen';
var seen=!forced&&(joining||d.cookie.split(';').some(function(value){return value.trim()===splashCookie+'=1';}));
// Forced QA previews and JOIN deep links do not consume the first-visit intro.
// Do not write a splash cookie on the static platform landing page.
if(!forced&&!joining&&(liveSchool||schoolPath))d.cookie=splashCookie+'=1;path=/;max-age=2592000;SameSite=Lax';
var st=d.createElement('style');st.id='yat-splash-state';d.head.appendChild(st);
var set=function(css){st.textContent=css;};
var P='html #yatSplash';
var QUICK=P+' *,'+P+' *::after{animation:none!important}'+P+' .yat-splash-logo img{animation:yatSplashGlow 2.4s ease-in-out infinite!important}';
var RM=false;try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
var EXIT=RM?P+'{opacity:0!important;pointer-events:none!important}':P+'{pointer-events:none!important;animation:yatSplashSlideAway .55s cubic-bezier(.3,.75,.2,1) forwards!important}';
var OFF=P+'{display:none!important}';
var FLIP='::view-transition{background:#000}::view-transition-old(root){animation:yatSplashExitRight .55s cubic-bezier(.3,.75,.2,1) both}::view-transition-new(root){animation:none}@keyframes yatSplashExitRight{to{transform:translateX(105%)}}';
var sound=function(){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;var c=new A();if(c.state!=='running'){c.close();return;}
var n=c.sampleRate*.16|0,b=c.createBuffer(1,n,c.sampleRate),x=b.getChannelData(0);for(var i=0;i<n;i++)x[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
var s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(900,c.currentTime);f.frequency.exponentialRampToValueAtTime(3800,c.currentTime+.14);g.gain.value=.35;
s.connect(f);f.connect(g);g.connect(c.destination);s.start();setTimeout(function(){c.close();},500);}catch(e){}};
var flip=function(){
if(!RM&&d.startViewTransition){sound();var v=d.createElement('style');v.textContent=FLIP;d.head.appendChild(v);
try{d.startViewTransition(function(){set(OFF);}).finished.then(function(){v.remove();},function(){v.remove();});}catch(e){set(OFF);v.remove();}return;}
if(!RM)sound();set((seen?QUICK:'')+EXIT);setTimeout(function(){set(OFF);},600);};
var t0=Date.now(),ready=false,shown=!seen,leaving=false;
// Returning visitors must never re-show the opener as a loading overlay.
if(seen){set(OFF);return;}
// Measure the minimum display from the splash's first paint, NOT from
// head/bootstrap execution: school data can stream in after the head.
var tryExit=function(){
 if(leaving)return;
 var splash=d.getElementById('yatSplash'),now=Date.now();
 if(!splash){
  if(now-t0<12000){setTimeout(tryExit,250);return;}
  set(OFF);return;
 }
 var mounted=Number(splash.getAttribute('data-yat-mounted-at'))||t0;
 var sponsorAt=Number(splash.getAttribute('data-yat-sponsor-at'))||0;
 // No sponsor assigned? After the YAT logo and player-name flashes,
 // there is no paid message to hold. Keep the longer hold for a sponsor,
 // and never block beyond 9s after mount if its image is slow.
 var noSponsor=splash.getAttribute('data-yat-sponsor-state')==='none';
 var minimumHold=noSponsor?3600:5500;
 var earliest=Math.max(mounted+minimumHold,sponsorAt?sponsorAt+2200:0);
 var leaveAt=Math.min(earliest,mounted+9000);
 if(now<leaveAt){setTimeout(tryExit,Math.min(350,leaveAt-now));return;}
 leaving=true;flip();
};
var lift=function(){if(forced||ready)return;ready=true;
 if(!shown){set(OFF);return;}
 tryExit();
};
if(forced){addEventListener('click',function(e){var el=e.target;if(!leaving&&el&&el.closest&&el.closest('#yatSplash .yat-splash-continue')){leaving=true;if(replayRoute){d.cookie=splashCookie+'=1;path=/;max-age=2592000;SameSite=Lax';location.replace(replayId&&!liveSchool?'/'+replayId:'/');}else flip();}});return;}
addEventListener('yat:page-ready',lift);
// On player profiles, DOMContentLoaded is sufficient: waiting for every
// third-party player photo on window.load makes a ready page feel stuck.
// Galleries keep their own explicit yat:page-ready signal and fallback.
if(location.pathname.indexOf('/player/')!==-1){
  addEventListener('DOMContentLoaded',function(){setTimeout(lift,250);});
}
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
