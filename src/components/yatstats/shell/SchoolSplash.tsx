// The opening splash: the YAT?STATS logo a third of the way down, the
// school's crest (and its title partner, side by side, when it has one) at
// about 70%. Server-rendered so it is the very first paint; whether it shows
// at all, and when it leaves, is SPLASH_BOOTSTRAP's call (app/layout.tsx).
//
// First visit (full): the logo zooms in with its lights off, the stadium
// lights flicker on, a light sweeps the letters, the crest rises in. Back
// within 30 days (quick): all of it already lit, and only if the page is
// still loading after 0.3s.
//
// The exit, every time (SPLASH_BOOTSTRAP adds it): the logo zooms in fast
// through its "?" to full black, then the black slides off to the right,
// revealing the school's hub.
import type { TitlePartner } from '@/lib/titlePartners';

const YAT_LOGO = '/img/yatstats-logo.png';
// The "?" dot's centre in the logo image (753x109).
const DOT = '38.8% 80.9%';

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#000;opacity:1;transition:opacity .25s ease-out}
#yatSplash .yat-splash-place{position:absolute;left:50%;transform:translate(-50%,-50%)}
#yatSplash .yat-splash-place-logo{top:35%;z-index:1}
#yatSplash .yat-splash-place-brands{top:71%;z-index:1}
#yatSplash .yat-splash-zoom{line-height:0;transform-origin:${DOT};will-change:transform}
#yatSplash .yat-splash-logo{position:relative;animation:yatSplashLogoIn .6s cubic-bezier(.2,.8,.2,1) both}
#yatSplash .yat-splash-logo img{display:block;width:min(78vw,560px);height:auto;animation:yatSplashLightsOn .55s linear .65s both,yatSplashGlow 2.4s ease-in-out 1.5s infinite}
#yatSplash .yat-splash-logo::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.8) 50%,transparent 58%) 90% 0/300% 100% no-repeat;-webkit-mask:url(${YAT_LOGO}) center/100% 100% no-repeat;mask:url(${YAT_LOGO}) center/100% 100% no-repeat;animation:yatSplashShine 1s ease-in-out 1.25s both}
#yatSplash .yat-splash-beams{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;background:radial-gradient(ellipse 70% 40% at 0 0,rgba(255,255,255,.18),transparent 70%),radial-gradient(ellipse 70% 40% at 100% 0,rgba(255,255,255,.18),transparent 70%);animation:yatSplashBeams .55s linear .65s both}
#yatSplash .yat-splash-brands{display:flex;align-items:center;justify-content:center;gap:clamp(18px,6vw,36px)}
#yatSplash .yat-splash-crest{height:clamp(56px,16vw,84px);width:auto;animation:yatSplashRise .6s cubic-bezier(.2,.8,.2,1) 1.05s both}
#yatSplash .yat-splash-partner{max-height:clamp(48px,14vw,76px);max-width:38vw;width:auto;animation:yatSplashFromRight .6s cubic-bezier(.2,.8,.2,1) 1.05s both}
#yatSplash .yat-splash-divider{width:2px;align-self:stretch;background:linear-gradient(transparent,rgba(255,255,255,.7),transparent);animation:yatSplashGrow .5s ease-out 1.2s both}
#yatSplash .has-partner .yat-splash-crest{animation-name:yatSplashFromLeft}
@keyframes yatSplashLogoIn{from{opacity:0;transform:scale(2.3);filter:blur(12px)}to{opacity:1;transform:none;filter:none}}
@keyframes yatSplashLightsOn{0%{filter:brightness(.2)}25%{filter:brightness(1.15) drop-shadow(0 0 22px rgba(255,255,255,.6))}40%{filter:brightness(.35)}60%{filter:brightness(1.1) drop-shadow(0 0 18px rgba(255,255,255,.5))}100%{filter:brightness(1) drop-shadow(0 0 14px rgba(255,255,255,.28))}}
@keyframes yatSplashGlow{0%,100%{filter:brightness(1) drop-shadow(0 0 14px rgba(255,255,255,.28))}50%{filter:brightness(1) drop-shadow(0 0 26px rgba(255,255,255,.45))}}
@keyframes yatSplashBeams{0%{opacity:0}25%{opacity:1}40%{opacity:.2}60%,100%{opacity:1}}
@keyframes yatSplashShine{to{background-position:10% 0}}
@keyframes yatSplashRise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes yatSplashFromLeft{from{opacity:0;transform:translateX(-48px)}to{opacity:1;transform:none}}
@keyframes yatSplashFromRight{from{opacity:0;transform:translateX(48px)}to{opacity:1;transform:none}}
@keyframes yatSplashGrow{from{transform:scaleY(0)}to{transform:none}}
@keyframes yatSplashZoomIn{to{transform:scale(30)}}
@keyframes yatSplashFadeOut{to{opacity:0}}
@keyframes yatSplashSlideRight{to{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){#yatSplash *,#yatSplash *::after{animation:none!important}#yatSplash .yat-splash-beams{opacity:1}}
`;

export default function SchoolSplash({ crestUrl, schoolName, partner = null }: {
  crestUrl: string; schoolName: string; partner?: TitlePartner | null;
}) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <div className="yat-splash-place yat-splash-place-logo">
        <div className="yat-splash-zoom">
          <div className="yat-splash-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={YAT_LOGO} alt="" fetchPriority="high" />
          </div>
        </div>
      </div>
      <div className={`yat-splash-place yat-splash-place-brands yat-splash-brands${partner ? ' has-partner' : ''}`}>
        {crestUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="yat-splash-crest" src={crestUrl} alt={schoolName ? `${schoolName} crest` : ''} fetchPriority="high" />
        ) : null}
        {partner ? (
          <>
            <span className="yat-splash-divider" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="yat-splash-partner" src={partner.logoUrl} alt={partner.name} fetchPriority="high" />
          </>
        ) : null}
      </div>
      <div className="yat-splash-beams" />
    </div>
  );
}
