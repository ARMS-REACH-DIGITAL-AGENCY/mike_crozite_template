// The opening splash: the YAT?STATS logo a third of the way down, the
// school's crest (and its title partner, side by side, when it has one) at
// about 70%. Server-rendered so it is the very first paint; whether it shows
// at all, and when it leaves, is SPLASH_BOOTSTRAP's call (app/layout.tsx).
//
// First visit (full): black, then the logo slides in fast from the right and
// the crest from the left; once they settle, a glint and a light sweep
// across each. Back within 30 days (quick): the settled screen, and only if
// the page is still loading after 0.3s.
//
// The exit, every time (SPLASH_BOOTSTRAP runs it): the screen flips over
// the way the flip cards do, with the school's hub on the back.
import type { CSSProperties } from 'react';
import type { TitlePartner } from '@/lib/titlePartners';

const YAT_LOGO = '/img/yatstats-logo.png';

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#000;opacity:1;transition:opacity .25s ease-out}
#yatSplash .yat-splash-place{position:absolute;left:50%;transform:translate(-50%,-50%)}
#yatSplash .yat-splash-place-logo{top:35%}
#yatSplash .yat-splash-place-brands{top:71%}
#yatSplash .yat-splash-logo{animation:yatSplashInRight .5s cubic-bezier(.16,1,.3,1) .1s both}
#yatSplash .yat-splash-logo img{display:block;width:min(78vw,560px);height:auto;animation:yatSplashGlint .6s ease-out .55s both,yatSplashGlow 2.4s ease-in-out 1.15s infinite}
#yatSplash .yat-splash-brands{display:flex;align-items:center;justify-content:center;gap:clamp(18px,6vw,36px);animation:yatSplashInLeft .5s cubic-bezier(.16,1,.3,1) .1s both}
#yatSplash .yat-splash-crest{display:block;height:clamp(56px,16vw,84px);width:auto;animation:yatSplashGlint .6s ease-out .6s both}
#yatSplash .yat-splash-partner{display:block;max-height:clamp(48px,14vw,76px);max-width:38vw;width:auto}
#yatSplash .yat-splash-divider{width:2px;align-self:stretch;background:linear-gradient(transparent,rgba(255,255,255,.7),transparent)}
#yatSplash .yat-splash-shine{position:relative;display:block;line-height:0}
#yatSplash .yat-splash-shine::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.85) 50%,transparent 58%) 90% 0/300% 100% no-repeat;-webkit-mask:var(--yat-shine-mask) center/100% 100% no-repeat;mask:var(--yat-shine-mask) center/100% 100% no-repeat;animation:yatSplashShine .8s ease-in-out var(--yat-shine-delay,.65s) both}
@keyframes yatSplashInRight{from{transform:translateX(100vw)}to{transform:none}}
@keyframes yatSplashInLeft{from{transform:translateX(-100vw)}to{transform:none}}
@keyframes yatSplashGlint{0%{filter:brightness(1)}35%{filter:brightness(1.35) drop-shadow(0 0 20px rgba(255,255,255,.65))}100%{filter:brightness(1) drop-shadow(0 0 12px rgba(255,255,255,.25))}}
@keyframes yatSplashGlow{0%,100%{filter:drop-shadow(0 0 12px rgba(255,255,255,.25))}50%{filter:drop-shadow(0 0 24px rgba(255,255,255,.42))}}
@keyframes yatSplashShine{to{background-position:10% 0}}
@keyframes yatSplashFlipAway{to{transform:perspective(1400px) rotateY(90deg)}}
@media (prefers-reduced-motion:reduce){#yatSplash *,#yatSplash *::after{animation:none!important}}
`;

// A light sweep across one image, masked to its shape.
function shine(src: string, delay: string): CSSProperties {
  return { ['--yat-shine-mask' as string]: `url("${src}")`, ['--yat-shine-delay' as string]: delay } as CSSProperties;
}

export default function SchoolSplash({ crestUrl, schoolName, partner = null }: {
  crestUrl: string; schoolName: string; partner?: TitlePartner | null;
}) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <div className="yat-splash-place yat-splash-place-logo">
        <div className="yat-splash-logo yat-splash-shine" style={shine(YAT_LOGO, '.65s')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={YAT_LOGO} alt="" fetchPriority="high" />
        </div>
      </div>
      <div className="yat-splash-place yat-splash-place-brands">
        <div className="yat-splash-brands">
          {crestUrl ? (
            <span className="yat-splash-shine" style={shine(crestUrl, '.8s')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="yat-splash-crest" src={crestUrl} alt={schoolName ? `${schoolName} crest` : ''} fetchPriority="high" />
            </span>
          ) : null}
          {partner ? (
            <>
              <span className="yat-splash-divider" />
              <span className="yat-splash-shine" style={shine(partner.logoUrl, '.95s')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="yat-splash-partner" src={partner.logoUrl} alt={partner.name} fetchPriority="high" />
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
