// The opening splash, top to bottom: the stadium lights; one lockup in a
// soft glow - the school's crest, its name, the YAT?STATS logo and "Alumni
// Baseball Online Community", the two lines of words set to the logo's
// width; and lower down "compliments of", a space for the title partner's
// logo, the partner's name ("(Participating Partner Needed)" until there is
// one) and the school's city. Server-rendered so it is the very first
// paint; whether it shows at all, and when it leaves, is SPLASH_BOOTSTRAP's
// call (app/layout.tsx).
//
// The stadium lights across the top are the Fantasy Bracket's night-game
// light towers (BallparkScene), steady, fading to black below.
//
// First visit (full): the logo and its line slide in fast from the right
// while the crest and the school's name come in from the left; once the
// logo settles it glints, a light sweeps across it, and it keeps a soft
// glow. Back within 30 days (quick): the settled screen, and only if the
// page is still loading after 0.3s.
//
// The exit, every time (SPLASH_BOOTSTRAP runs it): the screen flips over
// the way the flip cards do, with the school's hub on the back.
import type { CSSProperties } from 'react';
import { BallparkLights } from '@/components/bracket/BallparkScene';
import type { TitlePartner } from '@/lib/titlePartners';

// The YAT?STATS wordmark on a transparent background (the same file as the
// yatstats.com splash), so the glow behind it shows around the letters.
const YAT_LOGO = '/img/yatstats-wordmark-white.png';

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#000;opacity:1;transition:opacity .25s ease-out;--yat-splash-w:min(50vw,400px);color:#fff;font-family:var(--yat-font-ui,'Archivo'),'Montserrat',Arial,Helvetica,sans-serif}
#yatSplash .yat-splash-place{position:absolute;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center}
#yatSplash .yat-splash-place-lockup{top:28%;width:var(--yat-splash-w)}
#yatSplash .yat-splash-place-credit{top:71%;width:min(92vw,560px)}
#yatSplash p{margin:0}
#yatSplash .yat-splash-glow{position:absolute;left:50%;top:56%;width:calc(var(--yat-splash-w) * 1.9);height:calc(var(--yat-splash-w) * 1.05);transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.17),rgba(255,255,255,.06) 55%,transparent);pointer-events:none;animation:yatSplashFadeIn .6s ease-out .2s both}
#yatSplash .yat-splash-from-left{position:relative;display:flex;flex-direction:column;align-items:center;animation:yatSplashInLeft .5s cubic-bezier(.16,1,.3,1) .1s both}
#yatSplash .yat-splash-from-right{position:relative;display:flex;flex-direction:column;align-items:center;animation:yatSplashInRight .5s cubic-bezier(.16,1,.3,1) .1s both}
#yatSplash .yat-splash-crest{display:block;height:calc(var(--yat-splash-w) * .31);width:auto;max-width:var(--yat-splash-w);object-fit:contain}
#yatSplash .yat-splash-fit{display:block;width:max-content;margin:0 auto;white-space:nowrap;font-weight:800;letter-spacing:.005em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.6);font-size:calc(var(--yat-splash-w) * .045)}
#yatSplash .yat-splash-name{margin-top:calc(var(--yat-splash-w) * .04)}
#yatSplash .yat-splash-logo{margin-top:calc(var(--yat-splash-w) * .05)}
#yatSplash .yat-splash-logo img{display:block;width:var(--yat-splash-w);height:auto;animation:yatSplashGlint .6s ease-out .6s both,yatSplashGlow 2.4s ease-in-out 1.2s infinite}
#yatSplash .yat-splash-tag{margin-top:calc(var(--yat-splash-w) * .02)}
#yatSplash .yat-splash-credit{font-size:clamp(11px,2.6vw,15px);line-height:1.35;animation:yatSplashFadeIn .5s ease-out .5s both}
#yatSplash .yat-splash-compliments{font-weight:500}
#yatSplash .yat-splash-partner-slot{display:flex;align-items:center;justify-content:center;height:clamp(38px,5.5vh,64px);margin:clamp(4px,1vh,10px) 0}
#yatSplash .yat-splash-partner{display:block;max-height:100%;max-width:min(60vw,320px);width:auto}
#yatSplash .yat-splash-partner-name{font-weight:600;text-transform:uppercase}
#yatSplash .yat-splash-city{font-weight:500}
#yatSplash .yat-splash-lights{position:absolute;left:50%;top:0;width:min(100%,760px);height:clamp(150px,30vh,280px);transform:translateX(-50%);-webkit-mask:linear-gradient(#000 35%,transparent),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in;mask:linear-gradient(#000 35%,transparent),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect;animation:yatSplashFadeIn .4s ease-out both}
@media (max-width:760px){#yatSplash .yat-splash-lights{-webkit-mask:linear-gradient(#000 35%,transparent);mask:linear-gradient(#000 35%,transparent)}}
#yatSplash .yat-splash-shine{position:relative;display:block;line-height:0}
#yatSplash .yat-splash-shine::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.85) 50%,transparent 58%) 90% 0/300% 100% no-repeat;-webkit-mask:var(--yat-shine-mask) center/100% 100% no-repeat;mask:var(--yat-shine-mask) center/100% 100% no-repeat;animation:yatSplashShine .8s ease-in-out var(--yat-shine-delay,.65s) both}
@keyframes yatSplashFadeIn{from{opacity:0}}
@keyframes yatSplashInRight{from{transform:translateX(100vw)}to{transform:none}}
@keyframes yatSplashInLeft{from{transform:translateX(-100vw)}to{transform:none}}
@keyframes yatSplashGlint{0%{filter:brightness(1)}35%{filter:brightness(1.35) drop-shadow(0 0 20px rgba(255,255,255,.65))}100%{filter:brightness(1) drop-shadow(0 0 12px rgba(255,255,255,.25))}}
@keyframes yatSplashGlow{0%,100%{filter:drop-shadow(0 0 12px rgba(255,255,255,.25))}50%{filter:drop-shadow(0 0 24px rgba(255,255,255,.42))}}
@keyframes yatSplashShine{to{background-position:10% 0}}
@keyframes yatSplashFlipAway{to{transform:perspective(1400px) rotateY(90deg)}}
@media (prefers-reduced-motion:reduce){#yatSplash *,#yatSplash *::after{animation:none!important}}
`;

// The two lines of words in the lockup are set to the YAT?STATS logo's
// width: "Alumni Baseball Online Community" just inside it, the school's
// name no wider than that and never in bigger type (a long name gets
// smaller). Re-fit once the logo and the font have loaded, and on resize.
const FIT_WORDS = `(function(){var s=document.getElementById('yatSplash');if(!s)return;var logo=s.querySelector('.yat-splash-logo img');if(!logo)return;
function size(el,w){el.style.fontSize='20px';var n=el.getBoundingClientRect().width;return n?20*w/n:0;}
function fit(){var w=logo.getBoundingClientRect().width;if(!w)return;var tag=s.querySelector('.yat-splash-tag .yat-splash-fit'),name=s.querySelector('.yat-splash-name .yat-splash-fit');var t=tag?size(tag,w*.95):0;if(tag&&t)tag.style.fontSize=t.toFixed(2)+'px';if(name){var n=size(name,w*.9);if(t&&n>t)n=t;if(n)name.style.fontSize=n.toFixed(2)+'px';}}
fit();if(!logo.complete)logo.addEventListener('load',fit);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);window.addEventListener('resize',fit);})();`;

// A light sweep across one image, masked to its shape.
function shine(src: string, delay: string): CSSProperties {
  return { ['--yat-shine-mask' as string]: `url("${src}")`, ['--yat-shine-delay' as string]: delay } as CSSProperties;
}

export default function SchoolSplash({ crestUrl, schoolName, location = '', partner = null }: {
  crestUrl: string; schoolName: string; location?: string; partner?: TitlePartner | null;
}) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <BallparkLights className="yat-splash-lights" />
      <div className="yat-splash-place yat-splash-place-lockup">
        <span className="yat-splash-glow" />
        <div className="yat-splash-from-left">
          {crestUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="yat-splash-crest" src={crestUrl} alt={schoolName ? `${schoolName} crest` : ''} fetchPriority="high" />
          ) : null}
          {schoolName ? <p className="yat-splash-name"><span className="yat-splash-fit">{schoolName}</span></p> : null}
        </div>
        <div className="yat-splash-from-right">
          <div className="yat-splash-logo yat-splash-shine" style={shine(YAT_LOGO, '.65s')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={YAT_LOGO} alt="" fetchPriority="high" />
          </div>
          <p className="yat-splash-tag"><span className="yat-splash-fit">Alumni Baseball Online Community</span></p>
        </div>
      </div>
      <div className="yat-splash-place yat-splash-place-credit yat-splash-credit">
        <p className="yat-splash-compliments">compliments of</p>
        <div className="yat-splash-partner-slot">
          {partner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="yat-splash-partner" src={partner.logoUrl} alt={partner.name} fetchPriority="high" />
          ) : null}
        </div>
        <p className="yat-splash-partner-name">{partner ? partner.name : '(Participating Partner Needed)'}</p>
        {location ? <p className="yat-splash-city">{location}</p> : null}
      </div>
      <script dangerouslySetInnerHTML={{ __html: FIT_WORDS }} />
    </div>
  );
}
