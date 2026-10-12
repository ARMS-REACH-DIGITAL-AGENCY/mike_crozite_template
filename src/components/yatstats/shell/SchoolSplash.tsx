// The opening splash: the YAT?STATS logo, then the school's crest (and its
// title partner, side by side, when it has one), then a zoom through the
// logo's "?" into the school's hub - the way the Fox One app flies through
// its O. Server-rendered so it is the very first paint; whether it shows at
// all, and when it leaves, is SPLASH_BOOTSTRAP's call (app/layout.tsx).
//
// First visit (full): the logo zooms in with its lights off, the stadium
// lights flicker on, the crest rises in. Back within 30 days (quick): all of
// it already lit, and only if the page is still loading after 0.3s.
//
// The exit: the logo scales up from its "?" dot (a transform, so the GPU
// does it) while a hole opens in the black, centred on that dot (a mask on a
// screen-sized layer; SPLASH_BOOTSTRAP measures where the dot is). The dot
// stays put as everything grows around it, so the hub shows through the "?".
import type { TitlePartner } from '@/lib/titlePartners';

const YAT_LOGO = '/img/yatstats-logo-v2.webp';
// The "?" dot's centre in the logo image (900x458).
const DOT_X = '73.7%';
const DOT_Y = '43.7%';

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;opacity:1;transition:opacity .25s ease-out}
#yatSplash .yat-splash-stage{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(44px,11vh,104px)}
#yatSplash .yat-splash-zoom{position:relative;line-height:0;transform-origin:${DOT_X} ${DOT_Y};will-change:transform}
#yatSplash .yat-splash-black{position:absolute;inset:0;background:#000;--yat-iris:0px;-webkit-mask:radial-gradient(circle at var(--yat-dot-x,50%) var(--yat-dot-y,50%),transparent var(--yat-iris),#000 calc(var(--yat-iris) + 1px));mask:radial-gradient(circle at var(--yat-dot-x,50%) var(--yat-dot-y,50%),transparent var(--yat-iris),#000 calc(var(--yat-iris) + 1px))}
@property --yat-iris{syntax:'<length>';inherits:false;initial-value:0px}
#yatSplash .yat-splash-logo{position:relative;animation:yatSplashLogoIn .6s cubic-bezier(.2,.8,.2,1) both}
#yatSplash .yat-splash-logo img{display:block;width:clamp(240px,74vw,460px);height:auto;animation:yatSplashLightsOn .55s linear .65s both,yatSplashGlow 2.4s ease-in-out 1.5s infinite}
#yatSplash .yat-splash-logo::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.8) 50%,transparent 58%) 90% 0/300% 100% no-repeat;-webkit-mask:url(${YAT_LOGO}) center/100% 100% no-repeat;mask:url(${YAT_LOGO}) center/100% 100% no-repeat;animation:yatSplashShine 1s ease-in-out 1.25s both}
#yatSplash .yat-splash-beams{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;background:radial-gradient(ellipse 70% 50% at 0 0,rgba(255,255,255,.2),transparent 70%),radial-gradient(ellipse 70% 50% at 100% 0,rgba(255,255,255,.2),transparent 70%);animation:yatSplashBeams .55s linear .65s both}
#yatSplash .yat-splash-brands{position:relative;display:flex;align-items:center;justify-content:center;gap:clamp(18px,6vw,36px)}
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
@keyframes yatSplashZoomThrough{to{transform:scale(18)}}
@keyframes yatSplashIris{to{--yat-iris:150vmax}}
@keyframes yatSplashFadeOut{to{opacity:0}}
@media (prefers-reduced-motion:reduce){#yatSplash *,#yatSplash *::after{animation:none!important}#yatSplash .yat-splash-beams{opacity:1}}
`;

export default function SchoolSplash({ crestUrl, schoolName, partner = null }: {
  crestUrl: string; schoolName: string; partner?: TitlePartner | null;
}) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <div className="yat-splash-black" />
      <div className="yat-splash-stage">
        <div className="yat-splash-zoom">
          <div className="yat-splash-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={YAT_LOGO} alt="" fetchPriority="high" />
          </div>
        </div>
        <div className={`yat-splash-brands${partner ? ' has-partner' : ''}`}>
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
      </div>
      <div className="yat-splash-beams" />
    </div>
  );
}
