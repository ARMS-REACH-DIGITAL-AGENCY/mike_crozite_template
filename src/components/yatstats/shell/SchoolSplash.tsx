// The opening splash, top to bottom: the stadium lights; one lockup in a
// soft glow - the school's crest, its name, the YAT?STATS logo and "Alumni
// Baseball Online Community", the two lines of words set to the logo's
// width; and lower down "compliments of", a space for the title partner's
// logo, optional partner name, and the school's city. Server-rendered so it is the very first
// paint; whether it shows at all, and when it leaves, is SPLASH_BOOTSTRAP's
// call (app/layout.tsx).
//
// The stadium lights across the top are the Fantasy Bracket's night-game
// light towers (BallparkScene), steady, fading to black below.
//
// First visit (full): the logo and its line slide in fast from the right
// while the crest and the school's name come in from the left; once the
// logo settles it glints, a light sweeps across it, and it keeps a soft
// glow. Returning visitors do not see this opener during normal navigation.
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
/* Reuse the exact bottom artwork from Pete's supplied reference, with
   the gold timeline swoosh and faint YAT?STATS crest already in the image.
   No dark right-side overlay and no separate, recreated crest. */
#yatSplash .yat-splash-field{
  position:absolute;left:0;right:0;bottom:0;
  height:clamp(160px,20vh,320px);overflow:hidden;
  pointer-events:none;
  background:#000 url("/img/splash-field-reference.webp") center bottom/100% 100% no-repeat;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.22) 8%,rgba(0,0,0,.8) 22%,#000 36%);
  mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.22) 8%,rgba(0,0,0,.8) 22%,#000 36%);
}

/* Keep the cutout above the single field artwork; do not duplicate or clip the field background. */
#yatSplash .yat-splash-player{position:absolute;z-index:1;left:26%;bottom:clamp(24px,4vh,64px);transform:translateX(-50%);width:min(34vw,265px);height:clamp(125px,21vh,265px);opacity:0;transition:opacity .35s ease;pointer-events:none}
#yatSplash .yat-splash-player.is-visible{opacity:1}
#yatSplash .yat-splash-player-caption{position:absolute;right:-20%;bottom:0;text-align:right;color:rgba(255,255,255,.83);font-size:clamp(8px,.8vw,10px);font-weight:500;letter-spacing:.015em;line-height:1.2;text-shadow:0 1px 4px #000;max-width:150px}
#yatSplash .yat-splash-player-caption span{display:block}
#yatSplash .yat-splash-player img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}
@media(max-width:600px){#yatSplash .yat-splash-player{left:22%;bottom:clamp(20px,3vh,44px);width:min(34vw,170px);height:clamp(115px,18vh,205px)}#yatSplash .yat-splash-player-caption{right:-32%;font-size:8px}}
#yatSplash .yat-splash-continue{position:absolute;z-index:5;left:50%;bottom:clamp(20px,5vh,52px);transform:translateX(-50%);background:rgba(24,24,24,.85);border:1px solid rgba(255,255,255,.65);border-radius:4px;padding:11px 24px;color:#fff;font:700 13px/1 var(--yat-font-ui,Arial,sans-serif);letter-spacing:.09em;cursor:pointer;text-transform:uppercase;white-space:nowrap}
#yatSplash .yat-splash-continue:hover{background:#303030}
#yatSplash .yat-splash-place{position:absolute;z-index:1;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center}
#yatSplash .yat-splash-place-lockup{top:28%;width:var(--yat-splash-w)}
#yatSplash .yat-splash-place-credit{top:63%;width:min(92vw,560px)}
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
#yatSplash .yat-splash-credit{opacity:0;transition:opacity .5s ease}
#yatSplash.yat-sponsor-reveal .yat-splash-credit{opacity:1}
#yatSplash .yat-splash-credit{font-size:clamp(11px,2.6vw,15px);line-height:1.35}
#yatSplash .yat-splash-compliments{font-weight:500}
#yatSplash .yat-splash-partner-slot{display:flex;align-items:center;justify-content:center;height:clamp(42px,7vh,80px);margin:clamp(4px,1vh,10px) 0}
#yatSplash .yat-splash-partner{display:block;max-height:100%;max-width:min(58vw,340px);width:auto;object-fit:contain}
#yatSplash .yat-splash-partner-name{font-weight:600;text-transform:uppercase}
#yatSplash .yat-splash-city{margin-top:2px!important;font-size:clamp(9px,1.3vw,11px);font-weight:400;line-height:1.2;letter-spacing:.02em;color:rgba(255,255,255,.8)}
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
@keyframes yatSplashSlideAway{to{transform:translate3d(105%,0,0)}}
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

// Uses IDs from the school's already loaded roster. No extra DB requests.
// Pick one active alumnus per splash, reusing the already-fetched roster; no timers.
const ROTATE_SPLASH_PLAYERS = "(function(){\n  var splash=document.getElementById('yatSplash');\n  var holder=document.getElementById('yatSplashPlayer');\n  if(!splash||!holder)return;\n  var picture=holder.querySelector('img');\n  var base='https://yatstats-assets.s3.us-west-2.amazonaws.com/players/';\n  var started=false;\n  var key='yat_splash_last_player_'+(holder.getAttribute('data-school')||'default');\n  function visible(){return getComputedStyle(splash).display!=='none';}\n  function shuffle(items){\n    for(var i=items.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),x=items[i];items[i]=items[j];items[j]=x;}\n    return items;\n  }\n  function filterIds(items){\n    if(!Array.isArray(items))return [];\n    return Array.from(new Set(items.filter(function(id){return typeof id==='string'&&/^(?:\\d+|YAT\\d+)$/i.test(id);})));\n  }\n  document.addEventListener('yat:splash-players',function(event){\n    if(started||!visible())return;\n    started=true;\n    var payload=event.detail||{};\n    var playerDetails=payload.details||{};\n    var activeIds=filterIds(payload.active);\n    var activeSet=new Set(activeIds);\n    var otherIds=filterIds(payload.other).filter(function(id){return !activeSet.has(id);});\n    var previous='';\n    try{previous=localStorage.getItem(key)||'';}catch(e){}\n    function ordered(list){\n      var choices=shuffle(list.slice());\n      if(choices.length>1&&previous){choices=choices.filter(function(id){return id!==previous;}).concat(choices.filter(function(id){return id===previous;}));}\n      return choices;\n    }\n    function tryPool(pool,limit,onExhausted){\n      var choices=ordered(pool),index=0,attempts=0;\n      function next(){\n        if(!visible())return;\n        if(index>=choices.length||attempts>=limit){onExhausted();return;}\n        attempts++;\n        var id=choices[index++];\n        var sources=[base+'then-web/'+id+'.webp',base+'then-cutouts/'+id+'.png'];\n        function probe(n){\n          if(!visible())return;\n          if(n>=sources.length){next();return;}\n          var img=new Image();\n          img.onload=function(){\n            if(!visible())return;\n            picture.src=sources[n];\n            var meta=playerDetails[id]||{};\n            var caption=holder.querySelector('.yat-splash-player-caption');\n            if(caption){caption.textContent='';if(meta.name){var nm=document.createElement('span');nm.textContent=String(meta.name);caption.appendChild(nm);}if(meta.team){var tm=document.createElement('span');tm.textContent=String(meta.team);caption.appendChild(tm);}}\n            holder.classList.add('is-visible');\n            try{localStorage.setItem(key,id);}catch(e){}\n            // Exactly one successful image for this splash. No interval or swap.\n          };\n          img.onerror=function(){probe(n+1);};\n          img.src=sources[n];\n        }\n        probe(0);\n      }\n      next();\n    }\n    tryPool(activeIds,12,function(){\n      // Fallback only when this school has no usable active-alumni cutout.\n      tryPool(otherIds,6,function(){});\n    });\n  },{once:true});\n})();";

const SPONSOR_LOOKUP = `(function(){
 var splash=document.getElementById('yatSplash'),sponsor=document.getElementById('yatSplashSponsor');
 if(!splash||!sponsor)return;
 var started=Date.now();splash.setAttribute('data-yat-mounted-at',String(started));
 var slot=sponsor.querySelector('.yat-splash-partner-slot');
 if(!slot)return;
 function revealWhenReady(){
  if(!splash.isConnected)return;
  var elapsed=Date.now()-started;
  if(elapsed<2200){setTimeout(revealWhenReady,2200-elapsed);return;}
  var logo=slot.querySelector('img.yat-splash-partner');
  if(!logo||!logo.complete||!logo.naturalWidth)return;
  if(splash.classList.contains('yat-sponsor-reveal'))return;
  splash.setAttribute('data-yat-sponsor-at',String(Date.now()));
  splash.classList.add('yat-sponsor-reveal');
 }
 setTimeout(revealWhenReady,2200);
 var preset=slot.querySelector('img');
 if(preset&&!preset.complete)preset.addEventListener('load',revealWhenReady,{once:true});
 var id=sponsor.getAttribute('data-school');
 if(!/^[0-9]+$/.test(id||''))return;
 // A paid assignment is resolved from indexed Neon tables. Existing static
 // legacy previews are left intact when there is no DB assignment.
 fetch('/api/splash-sponsor/'+encodeURIComponent(id),{credentials:'same-origin'})
 .then(function(r){return r.ok?r.json():null;}).then(function(data){
  var s=data&&data.sponsor;if(!s||!s.logoUrl)return;
  var name=sponsor.querySelector('.yat-splash-partner-name');
  var img=new Image();img.className='yat-splash-partner';img.alt=s.name||'Sponsor';
  img.onload=function(){
   if(!splash.isConnected)return;
   slot.replaceChildren(img);
   if(name)name.textContent=s.name||'';
   revealWhenReady();
  };
  img.src=s.logoUrl;
 }).catch(function(){});
})();`;

// A light sweep across one image, masked to its shape.
function shine(src: string, delay: string): CSSProperties {
  return { ['--yat-shine-mask' as string]: `url("${src}")`, ['--yat-shine-delay' as string]: delay } as CSSProperties;
}

export default function SchoolSplash({ crestUrl, schoolName, location = '', partner = null, previewMode = false, schoolId = '' }: {
  crestUrl: string; schoolName: string; location?: string; partner?: TitlePartner | null; previewMode?: boolean; schoolId?: string;
}) {
  return (
    <div id="yatSplash" aria-hidden="true" suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      {/* Reuse the player-profile field, blending its top edge into black. */}
      <div className="yat-splash-field" />
      <div className="yat-splash-player" id="yatSplashPlayer" data-school={schoolId} aria-hidden="true"><img alt="" /><div className="yat-splash-player-caption" /></div>
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
          {location ? <p className="yat-splash-city">{location}</p> : null}
        </div>
      </div>
      <div className="yat-splash-place yat-splash-place-credit yat-splash-credit" id="yatSplashSponsor" data-school={schoolId}>
        <p className="yat-splash-compliments">compliments of</p>
        <div className="yat-splash-partner-slot">
          {partner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="yat-splash-partner" src={partner.logoUrl} alt={partner.name} fetchPriority="high" />
          ) : null}
        </div>
        <p className="yat-splash-partner-name">{partner?.name || ''}</p>
      </div>
      {previewMode && <button type="button" className="yat-splash-continue">Enter YAT?STATS →</button>}
      <script dangerouslySetInnerHTML={{ __html: FIT_WORDS }} />
      <script dangerouslySetInnerHTML={{ __html: ROTATE_SPLASH_PLAYERS }} />
      <script dangerouslySetInnerHTML={{ __html: SPONSOR_LOOKUP }} />
    </div>
  );
}
