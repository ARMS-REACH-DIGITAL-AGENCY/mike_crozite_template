// First-visit-only school introduction: stadium lights, school crest and
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
// After the first visit the splash is suppressed before paint by the root bootstrap.
// The first-visit exit (SPLASH_BOOTSTRAP): the screen flips over
// the way the flip cards do, with the school's hub on the back.
import type { CSSProperties } from 'react';
import { BallparkLights } from '@/components/bracket/BallparkScene';
import type { TitlePartner } from '@/lib/titlePartners';

// The YAT?STATS wordmark on a transparent background (the same file as the
// yatstats.com splash), so the glow behind it shows around the letters.
const YAT_LOGO = '/img/yatstats-wordmark-white.png';
// Illustrative brands, not contracted or represented as YAT?STATS school partners.
// All nine logo images live in one small sprite, avoiding multiple network requests.
const SPONSOR_SHOWCASE = [
  'Benefit Buddies',
  'No Ragrets Tattoo Removal',
  'ARMS REACH',
  'Reach Golf Media',
  'ShipSticks',
  'H2Yo!',
  'Travel Protection Club',
  'American Solutions for Business',
  'On-Site Fleet & Auto Care',
] as const;

const SPLASH_CSS = `
#yatSplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#000;opacity:1;transition:opacity .25s ease-out;--yat-splash-w:min(50vw,400px);color:#fff;font-family:var(--yat-font-ui,'Archivo'),'Montserrat',Arial,Helvetica,sans-serif}
#yatSplash .yat-splash-place{position:absolute;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center}
#yatSplash .yat-splash-place-lockup{top:28%;width:var(--yat-splash-w)}
#yatSplash .yat-splash-place-credit{top:71%;width:min(94vw,560px);z-index:2}
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
#yatSplash .yat-splash-partner-slot{position:relative;display:flex;align-items:center;justify-content:center;width:min(82vw,330px);height:auto;aspect-ratio:330/104;margin:clamp(5px,1vh,12px) auto;isolation:isolate}
#yatSplash .yat-splash-partner{display:block;max-height:100%;max-width:100%;width:auto}
#yatSplash .yat-splash-partner-name{font-weight:600;text-transform:uppercase}
#yatSplash .yat-splash-compliments{min-height:1em}
#yatSplash .yat-splash-examples{font-size:clamp(9px,2.1vw,12px);letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.72)}
#yatSplash .yat-splash-showcase-frame{position:absolute;inset:0;border:1px solid rgba(255,255,255,.24);border-radius:11px;overflow:hidden;background:#fdfdfd;box-shadow:0 8px 22px rgba(0,0,0,.5)}
#yatSplash .yat-splash-sponsor-sample{position:absolute;inset:0;background:url('/img/splash-sponsor-showcase.webp') center 0/100% 900% no-repeat;opacity:0;animation:yatSplashSponsorFrame .44s linear both}
#yatSplash .yat-splash-partner-cta{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;padding:8px 13px;text-align:center;text-decoration:none;color:#fff;background:linear-gradient(135deg,#141414,#252525 55%,#111);border:1px solid rgba(255,190,57,.75);border-radius:11px;box-shadow:0 0 22px rgba(255,178,28,.16);opacity:0;visibility:hidden;animation:yatSplashSponsorCta .35s ease-out 4.81s both;pointer-events:none}
#yatSplash .yat-splash-partner-cta span{font-size:clamp(9px,2.2vw,11px);letter-spacing:.12em;line-height:1.2}
#yatSplash .yat-splash-partner-cta strong{font-size:clamp(12px,3.1vw,17px);font-weight:800;line-height:1.14;letter-spacing:.02em;text-transform:uppercase}
#yatSplash .yat-splash-partner-cta .yat-splash-cta-inquire{color:#ffba31;font-weight:800;letter-spacing:.08em}
#yatSplash .yat-splash-partner-cta:focus-visible{outline:2px solid #ffba31;outline-offset:3px}
#yatSplash .yat-splash-gold{position:absolute;left:50%;top:71%;width:min(96vw,680px);height:auto;transform:translate(-50%,-50%);pointer-events:none;z-index:1;overflow:visible;filter:drop-shadow(0 0 6px rgba(255,178,28,.6))}
#yatSplash .yat-splash-gold-path{fill:none;stroke:url(#yatSplashGold);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1700;stroke-dashoffset:1700;animation:yatSplashGoldTrace 1.7s cubic-bezier(.2,.72,.22,1) .85s both}
#yatSplash .yat-splash-city{font-weight:500}
#yatSplash .yat-splash-lights{position:absolute;left:50%;top:0;width:min(100%,760px);height:clamp(150px,30vh,280px);transform:translateX(-50%);-webkit-mask:linear-gradient(#000 35%,transparent),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in;mask:linear-gradient(#000 35%,transparent),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect;animation:yatSplashFadeIn .4s ease-out both}
@media (max-width:760px){#yatSplash .yat-splash-lights{-webkit-mask:linear-gradient(#000 35%,transparent);mask:linear-gradient(#000 35%,transparent)}}
#yatSplash .yat-splash-shine{position:relative;display:block;line-height:0}
#yatSplash .yat-splash-shine::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.85) 50%,transparent 58%) 90% 0/300% 100% no-repeat;-webkit-mask:var(--yat-shine-mask) center/100% 100% no-repeat;mask:var(--yat-shine-mask) center/100% 100% no-repeat;animation:yatSplashShine .8s ease-in-out var(--yat-shine-delay,.65s) both}
@keyframes yatSplashSponsorFrame{0%{opacity:0}12%,82%{opacity:1}100%{opacity:0}}
@keyframes yatSplashSponsorCta{0%{opacity:0;visibility:visible;pointer-events:none;transform:scale(.97)}100%{opacity:1;visibility:visible;pointer-events:auto;transform:scale(1)}}
@keyframes yatSplashGoldTrace{to{stroke-dashoffset:0}}
@keyframes yatSplashFadeIn{from{opacity:0}}
@keyframes yatSplashInRight{from{transform:translateX(100vw)}to{transform:none}}
@keyframes yatSplashInLeft{from{transform:translateX(-100vw)}to{transform:none}}
@keyframes yatSplashGlint{0%{filter:brightness(1)}35%{filter:brightness(1.35) drop-shadow(0 0 20px rgba(255,255,255,.65))}100%{filter:brightness(1) drop-shadow(0 0 12px rgba(255,255,255,.25))}}
@keyframes yatSplashGlow{0%,100%{filter:drop-shadow(0 0 12px rgba(255,255,255,.25))}50%{filter:drop-shadow(0 0 24px rgba(255,255,255,.42))}}
@keyframes yatSplashShine{to{background-position:10% 0}}
@keyframes yatSplashFlipAway{to{transform:perspective(1400px) rotateY(90deg)}}
@media (prefers-reduced-motion:reduce){#yatSplash *,#yatSplash *::after{animation:none!important}#yatSplash .yat-splash-sponsor-sample{opacity:0!important}#yatSplash .yat-splash-partner-cta{opacity:1!important;visibility:visible!important;pointer-events:auto!important}#yatSplash .yat-splash-gold-path{stroke-dashoffset:0!important}}
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
    <div id="yatSplash" data-yat-showcase={partner ? "0" : "1"} suppressHydrationWarning>
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
      <svg className="yat-splash-gold" viewBox="0 0 620 280" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="yatSplashGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d68d10" />
            <stop offset="38%" stopColor="#ffbe32" />
            <stop offset="73%" stopColor="#ffad18" />
            <stop offset="100%" stopColor="#ffcf58" />
          </linearGradient>
        </defs>
        <path className="yat-splash-gold-path" d="M -25 239 C 35 238 52 208 58 157 C 64 76 170 45 309 48 C 467 50 548 90 559 165 C 569 252 458 273 312 263 C 174 256 97 216 99 162 C 105 101 194 88 312 97 C 461 109 520 203 650 214" />
      </svg>
      <div className="yat-splash-place yat-splash-place-credit yat-splash-credit">
        <p className={partner ? "yat-splash-compliments" : "yat-splash-examples"}>
          {partner ? 'compliments of' : 'Imagine your brand here'}
        </p>
        <div className="yat-splash-partner-slot">
          {partner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="yat-splash-partner" src={partner.logoUrl} alt={partner.name} fetchPriority="high" />
          ) : (
            <>
              <div className="yat-splash-showcase-frame" aria-hidden="true">
                {SPONSOR_SHOWCASE.map((name, index) => (
                  <span
                    key={name}
                    className="yat-splash-sponsor-sample"
                    title={name}
                    style={{
                      backgroundPosition: `center ${(index / (SPONSOR_SHOWCASE.length - 1)) * 100}%`,
                      animationDelay: `${0.75 + index * 0.44}s`,
                    }}
                  />
                ))}
              </div>
              <a className="yat-splash-partner-cta" href="https://yatstats.com/partners/" aria-label={`Inquire about becoming a ${schoolName} YAT?STATS partner`}>
                <span>YOUR BRAND. YOUR SCHOOL.</span>
                <strong>Become a {schoolName} YAT?STATS Partner</strong>
                <span className="yat-splash-cta-inquire">INQUIRE ABOUT PARTNERSHIP &rarr;</span>
              </a>
            </>
          )}
        </div>
        {partner ? <p className="yat-splash-partner-name">{partner.name}</p> : <p className="yat-splash-examples">Concept showcase &middot; Partners not yet confirmed</p>}
        {location ? <p className="yat-splash-city">{location}</p> : null}
      </div>
      <script dangerouslySetInnerHTML={{ __html: FIT_WORDS }} />
    </div>
  );
}
