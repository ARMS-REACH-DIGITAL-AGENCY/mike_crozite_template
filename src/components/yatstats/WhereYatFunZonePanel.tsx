'use client';

// The art is deliberately only the INSIDE of the existing FunZone schedule
// panel. PlayerCardBack keeps the actual action-photo hero, real 5:7 card,
// and FunZone's six live tab buttons (schedule, stats, news, social, connect,
// upload). No footer icons are baked into or covered by this artwork.
import WhereYatProofCard, { type WhereYatProof } from './WhereYatProofCard';

export type WhereYatFunZoneState = 'unclaimed' | 'pending' | 'approved';

const LOGO = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png';

export default function WhereYatFunZonePanel({
  state, firstName, profileHref, proof,
}: {
  state: WhereYatFunZoneState;
  firstName: string;
  profileHref: string;
  proof?: WhereYatProof | null;
}) {
  return (
    <section className={`wyn-fz wyn-fz-${state}`} aria-label="Where YAT Now? alumni card">
      <div className="wyn-fz-brand">
        <img src={LOGO} alt="YAT?STATS" loading="lazy" />
        {state === 'approved' && <span>WHERE YAT NOW?</span>}
      </div>

      {state === 'unclaimed' && (
        <>
          <div className="wyn-fz-headline">
            <span className="wyn-fz-brush-word">WHERE YAT</span>
            <strong>NOW?</strong>
          </div>
          <div className="wyn-fz-copy">
            <b>LIFE AFTER BASEBALL IS PART OF THE STORY.</b>
            <p>Same game. New chapter. Reconnect with teammates and tell your hometown where life has taken you.</p>
          </div>
          <a className="wyn-fz-action" href={profileHref}>CLAIM YOUR PROFILE <i className="ri-arrow-right-s-line" aria-hidden="true" /></a>
        </>
      )}

      {state === 'pending' && (
        <>
          <div className="wyn-fz-headline">
            <span className="wyn-fz-brush-word">UPDATE</span>
            <strong>RECEIVED!</strong>
          </div>
          <div className="wyn-fz-status">WAITING FOR APPROVAL</div>
          <p className="wyn-fz-pending-copy">Your update is in review. After identity verification and approval, your life-after-baseball story will appear here.</p>
          <div className="wyn-fz-progress" aria-label="Submitted; verification in progress; publication after approval">
            <span><i className="ri-checkbox-circle-line" aria-hidden="true" />SUBMITTED</span>
            <span><i className="ri-shield-check-line" aria-hidden="true" />IN REVIEW</span>
            <span><i className="ri-time-line" aria-hidden="true" />PUBLICATION</span>
          </div>
          <a className="wyn-fz-pending-link" href={profileHref}>VIEW PROFILE STATUS <i className="ri-arrow-right-s-line" aria-hidden="true" /></a>
        </>
      )}

      {state === 'approved' && proof && (
        <>
          <div className="wyn-fz-approved-content">
            <WhereYatProofCard variant="content" showName={false} proof={proof} />
          </div>
          <a className="wyn-fz-action" href={profileHref}>
            READ MORE ABOUT {firstName.toUpperCase()}’S LIFE AFTER HIGH SCHOOL
            <i className="ri-arrow-right-s-line" aria-hidden="true" />
          </a>
        </>
      )}

      <style>{`
        .wyn-fz {
          display:flex; flex-direction:column; width:100%; height:100%; min-height:0;
          box-sizing:border-box; overflow:hidden; position:relative; isolation:isolate;
          padding:clamp(5px,2.3cqi,13px) clamp(6px,2.5cqi,14px);
          background-color:#dfd5c3;
          background-image:
            repeating-linear-gradient(170deg,transparent 0,transparent 5px,rgba(97,66,41,.045) 5px,rgba(97,66,41,.045) 6px),
            linear-gradient(135deg,#faf2df 0%,#ddd0ba 100%);
          color:#151d2c;
          container-type:inline-size;
        }
        .wyn-fz::before {
          content:""; position:absolute; z-index:-1; pointer-events:none;
          left:-5%; right:-5%; top:1%; height:58%;
          background:
            repeating-linear-gradient(174deg,transparent 0,transparent 10px,rgba(243,196,39,.27) 11px,transparent 13px),
            linear-gradient(112deg,#06152a 0%,#064680 55%,#0b2b54 100%);
          clip-path:polygon(2% 5%,99% 0,94% 11%,100% 23%,95% 43%,100% 61%,95% 79%,100% 91%,1% 100%,5% 84%,0 69%,4% 46%,0 21%);
          filter:drop-shadow(0 2px 1px #1118);
        }
        .wyn-fz-brand{
          display:flex; justify-content:space-between; align-items:center;
          min-height:0; flex:0 0 auto; padding:0 1%; gap:6px;
          border-bottom:clamp(1px,.4cqi,2px) solid #eec23b;
        }
        .wyn-fz-brand img {
          display:block; width:auto; height:clamp(12px,6cqi,26px); max-width:75%; object-fit:contain;
          filter:drop-shadow(1px 1px 1px #001b39);
        }
        .wyn-fz-brand span{
          color:#fff; font:700 clamp(8px,3cqi,14px)/1 Oswald,sans-serif;
          letter-spacing:.02em; white-space:nowrap; text-shadow:1px 1px 2px #001;
        }
        .wyn-fz-headline{
          display:flex; flex-direction:column; flex:none;
          align-items:center; justify-content:center; text-align:center;
          gap:0; margin:clamp(3px,1.2cqi,7px) 0 0; padding:0 2%;
          transform:skewY(-2deg); text-shadow:1px 3px 0 #001326,2px 4px 3px #001326aa;
        }
        .wyn-fz-brush-word {
          font:900 clamp(22px,10.2cqi,57px)/.96 "Bebas Neue",Oswald,sans-serif;
          font-style:italic; color:white; letter-spacing:.012em;
          -webkit-text-stroke:.3px #123b6e;
        }
        .wyn-fz-headline strong {
          font:900 clamp(31px,14.5cqi,76px)/.91 "Bebas Neue",Oswald,sans-serif;
          font-style:italic; letter-spacing:.01em;
          color:#ffd12f; -webkit-text-stroke:clamp(.5px,.4cqi,2px) #001d40;
          filter:drop-shadow(1px 2px 0 #022653);
        }
        .wyn-fz-copy {text-align:center; padding:clamp(2px,1cqi,7px) 1%; margin-top:auto;}
        .wyn-fz-copy b{font:800 clamp(10px,3.4cqi,16px)/1.2 Oswald,sans-serif;}
        .wyn-fz-copy p{font:500 clamp(9px,2.9cqi,14px)/1.32 Archivo,Arial,sans-serif;margin:clamp(3px,.9cqi,6px) 0 0;}
        .wyn-fz-action{
          display:flex; align-items:center; justify-content:center;
          box-sizing:border-box; width:100%; flex:none; min-width:0;
          text-align:center; text-decoration:none!important; margin:clamp(4px,1.2cqi,8px) auto 0;
          background:linear-gradient(#ffe360 0%,#ffcd21 45%,#e9a519 100%);
          border:clamp(1px,.5cqi,3px) solid #694510; border-radius:clamp(3px,1.4cqi,8px);
          box-shadow:0 2px 2px #1b110c88,inset 0 1px 0 #fff5a7;
          color:#08213a!important; text-transform:uppercase;
          font:900 clamp(10px,3.5cqi,18px)/1.05 Oswald,sans-serif;
          padding:clamp(5px,1.3cqi,9px) clamp(3px,1cqi,7px); gap:clamp(2px,1cqi,6px);
        }
        .wyn-fz-action i{font-size:1.45em;line-height:.8;flex:none;}
        .wyn-fz-status{
          margin:clamp(5px,2cqi,11px) 0 0; padding:clamp(4px,1.3cqi,8px) 2px;
          background:#facc26; color:#111a2b; text-align:center;
          transform:skewY(-2deg);
          font:900 clamp(11px,4.2cqi,23px)/1 Oswald,sans-serif;
          box-shadow:1px 2px 0 #9f6e0a;
        }
        .wyn-fz-pending-copy{
          font:500 clamp(9px,2.8cqi,14px)/1.35 Archivo,Arial,sans-serif;
          text-align:center; margin:clamp(5px,1.8cqi,10px) auto 0; max-width:94%;
        }
        .wyn-fz-progress{
          margin-top:auto; display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
          gap:2px; border-top:1px solid #ae8c40; padding-top:clamp(4px,1.5cqi,9px);
        }
        .wyn-fz-progress span{
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          text-align:center; gap:clamp(2px,.8cqi,4px); min-width:0;
          color:#18233b; font:700 clamp(7px,2.2cqi,11px)/1.05 Oswald,sans-serif;
        }
        .wyn-fz-progress i{color:#15396b;font-size:clamp(12px,5cqi,25px);}
        .wyn-fz-pending-link{
          color:#0b2f54!important; text-align:center; text-decoration:underline;
          font:700 clamp(8px,2.5cqi,12px) Oswald,sans-serif; margin-top:clamp(5px,1.4cqi,9px);
        }
        .wyn-fz-approved::before{top:0;height:27%;clip-path:polygon(0 5%,100% 0,97% 85%,0 100%);}
        .wyn-fz-approved .wyn-fz-brand{margin-bottom:clamp(4px,1.4cqi,9px);}
        .wyn-fz-approved-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
        .wyn-fz-approved-content .wyn-embedded{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
        .wyn-fz-approved-content .wyn-body{height:100%;min-height:0;overflow:hidden;padding:0;gap:clamp(2px,.7cqi,5px);}
        .wyn-fz-approved-content .wyn-heading{display:none;}
        .wyn-fz-approved-content .wyn-identity{flex-shrink:0;}
        .wyn-fz-approved-content .wyn-identity p{font-size:clamp(7px,2.3cqi,12px);}
        .wyn-fz-approved-content .wyn-story{font-size:clamp(8px,2.5cqi,13px);line-height:1.28;}
        .wyn-fz-approved-content .wyn-socials{padding-top:clamp(2px,.6cqi,5px);}
        .wyn-fz-approved .wyn-fz-action{font-size:clamp(9px,2.8cqi,14px);margin-top:clamp(2px,.7cqi,4px);}
        @media (prefers-reduced-motion:reduce){.wyn-fz *{transition:none!important;}}
      `}</style>
    </section>
  );
}
