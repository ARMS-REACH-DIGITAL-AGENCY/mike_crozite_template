// The opening splash, after hamilton_mvp's (and the MLB / ESPN / Fox app
// openers): the YAT?STATS logo glowing on black, then the school's crest.
// Server-rendered so it is the very first paint; whether it shows at all, and
// when it fades, is SPLASH_BOOTSTRAP's call (app/layout.tsx) - first page of
// a visit and shared team links, at least 1.2s, until the page is ready.
const YAT_LOGO = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png';

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(56px,14vh,120px);opacity:1;transition:opacity .6s ease-out}
#yatSplash .yat-splash-logo{position:relative;overflow:hidden;line-height:0}
#yatSplash .yat-splash-logo img{width:clamp(240px,70vw,440px);height:auto;filter:drop-shadow(0 0 15px rgba(255,255,255,.2));animation:yatSplashGlow 2.4s ease-in-out infinite}
#yatSplash .yat-splash-logo::after{content:'';position:absolute;top:0;left:-150%;width:70%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.22),rgba(255,255,255,0));transform:skewX(-25deg);animation:yatSplashShine 2.2s ease-in-out .3s infinite}
#yatSplash .yat-splash-crest{height:clamp(56px,16vw,84px);width:auto;opacity:0;animation:yatSplashIn .7s ease-out .45s forwards}
@keyframes yatSplashGlow{50%{filter:drop-shadow(0 0 26px rgba(255,255,255,.42))}}
@keyframes yatSplashShine{60%,100%{left:150%}}
@keyframes yatSplashIn{to{opacity:1}}
@media (prefers-reduced-motion:reduce){#yatSplash *{animation:none!important}#yatSplash .yat-splash-crest{opacity:1}}
`;

export default function SchoolSplash({ crestUrl, schoolName }: { crestUrl: string; schoolName: string }) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <div className="yat-splash-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={YAT_LOGO} alt="" fetchPriority="high" />
      </div>
      {crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="yat-splash-crest" src={crestUrl} alt={schoolName ? `${schoolName} crest` : ''} fetchPriority="high" />
      ) : null}
    </div>
  );
}
