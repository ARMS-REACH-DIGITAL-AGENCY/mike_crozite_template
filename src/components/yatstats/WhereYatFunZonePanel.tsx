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
      {state !== "unclaimed" && <div className="wyn-fz-brand">
        <img src={LOGO} alt="YAT?STATS" loading="lazy" />
        {state === 'approved' && <span>WHERE YAT NOW?</span>}
      </div>}

      {state === 'unclaimed' && (
        <div className="wyn-fz-art">
          <div className="wyn-fz-art-logo"><img src={LOGO} alt="YAT?STATS" /></div>
          <div className="wyn-fz-art-title"><span>WHERE YAT</span><strong>NOW?</strong></div>
          <div className="wyn-fz-art-bottom">
            <b>LIFE AFTER BASEBALL IS PART OF THE STORY.</b>
            <p>Update your profile and share where life has taken you since your playing days. Reconnect with teammates.</p>
            <a className="wyn-fz-art-button" href={profileHref}>CLAIM YOUR PROFILE ›</a>
          </div>
        </div>
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
        .wyn-fz-unclaimed{padding:0;background:#eee5d3;}
        .wyn-fz-unclaimed::before{display:none;}
        .wyn-fz-art{height:100%;width:100%;display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden;background:linear-gradient(165deg,#fff9e9,#e8dcca);}
        .wyn-fz-art:before{content:"";position:absolute;inset:0 0 39%;background:radial-gradient(circle at 85% 45%,#2778b6 0%,transparent 43%),linear-gradient(130deg,#06213d,#06518b 58%,#08213c);clip-path:polygon(0 9%,100% 0,100% 90%,0 100%);}
        .wyn-fz-art-logo{position:relative;z-index:1;align-self:flex-start;width:75%;padding:4% 5% 0;filter:drop-shadow(1px 3px 1px #001);}
        .wyn-fz-art-logo img{width:100%;height:auto;max-height:48px;object-fit:contain;object-position:left;}
        .wyn-fz-art-title{z-index:1;position:relative;display:flex;flex-direction:column;align-items:center;transform:rotate(-5deg);width:100%;margin-top:2%;filter:drop-shadow(3px 5px 1px #001b3e);}
        .wyn-fz-art-title span{font:italic 900 clamp(28px,13cqi,72px)/.95 "Bebas Neue",Oswald,sans-serif;color:white;text-shadow:2px 2px #123f6e;}
        .wyn-fz-art-title strong{font:italic 900 clamp(54px,24cqi,132px)/.9 "Bebas Neue",Oswald,sans-serif;color:#ffca1b;-webkit-text-stroke:1px #092847;text-shadow:3px 4px #00152d;}
        .wyn-fz-art-bottom{z-index:1;margin-top:auto;display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;padding:0 5% 4%;box-sizing:border-box;gap:clamp(3px,1cqi,8px);}
        .wyn-fz-art-bottom b{font:900 clamp(11px,4cqi,22px)/1.08 Oswald,sans-serif;}
        .wyn-fz-art-bottom p{font:500 clamp(9px,2.9cqi,15px)/1.3 Archivo,Arial,sans-serif;margin:0;}
        .wyn-fz-art-button{width:96%;box-sizing:border-box;background:linear-gradient(#ffe86c,#ffc821 65%,#e5a012);border:2px solid #78510e;border-radius:9px;box-shadow:0 2px 5px #3a250e99,inset 0 2px #fff7a6;padding:clamp(5px,1.6cqi,11px) 3px;color:#09223b!important;text-decoration:none!important;font:900 clamp(12px,4cqi,23px)/1 Oswald,sans-serif;}

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
        /* Approved profiles use a neutral notebook surface, not the old
           blue brush stroke. Reserve the space for story and business links. */
        .wyn-fz-approved::before{display:none!important;content:none!important;}
        .wyn-fz-approved .wyn-fz-brand {border-color:rgba(30,22,14,.35);}
        .wyn-fz-approved .wyn-fz-brand span{color:#30261d;text-shadow:none;}
        .wyn-fz-approved .wyn-fz-brand img{filter:none;}
        .wyn-fz-approved-content .wyn-story{flex:1;min-height:0;}
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
        /* UNCLAIMED + PENDING: use the same cream notebook design as the
           approved card. The Github artwork was never connected, so remove
           its blue brush/gradient rather than pretending it is installed. */
        .wyn-fz-unclaimed::before,
        .wyn-fz-pending::before,
        .wyn-fz-unclaimed .wyn-fz-art::before {
          content:none!important;
          display:none!important;
          background:none!important;
          filter:none!important;
        }
        .wyn-fz-unclaimed,
        .wyn-fz-pending {
          background:#f2eadc!important;
          background-image:repeating-linear-gradient(0deg,transparent 0,transparent 21px,rgba(70,56,39,.035) 22px)!important;
          color:#27221b;
        }
        .wyn-fz-unclaimed .wyn-fz-art {
          background:transparent!important;
          color:#27221b;
          padding:clamp(5px,2cqi,12px);
          box-sizing:border-box;
        }
        .wyn-fz-unclaimed .wyn-fz-art-logo {
          width:100%;
          padding:0 2%;
          filter:none;
        }
        .wyn-fz-unclaimed .wyn-fz-art-logo img {
          filter:none;
        }
        .wyn-fz-unclaimed .wyn-fz-art-title {
          margin-top:clamp(8px,4cqi,22px);
          transform:none;
          filter:none;
          text-shadow:none;
        }
        .wyn-fz-unclaimed .wyn-fz-art-title span {
          color:#312820;
          text-shadow:none;
          -webkit-text-stroke:0;
        }
        .wyn-fz-unclaimed .wyn-fz-art-title strong {
          color:#9b7023;
          text-shadow:none;
          -webkit-text-stroke:0;
        }
        .wyn-fz-unclaimed .wyn-fz-art-bottom {
          padding-bottom:3%;
          color:#27221b;
        }
        .wyn-fz-unclaimed .wyn-fz-art-bottom b {
          color:#30261e;
        }
        .wyn-fz-unclaimed .wyn-fz-art-button {
          color:#261d11!important;
          background:#eec54b;
          border:1px solid #836524;
          box-shadow:none;
        }
        .wyn-fz-pending .wyn-fz-brand {
          border-bottom-color:rgba(44,34,22,.35);
        }
        .wyn-fz-pending .wyn-fz-brand img {filter:none;}
        .wyn-fz-pending .wyn-fz-headline {
          transform:none;
          text-shadow:none;
          margin-top:clamp(8px,3cqi,18px);
        }
        .wyn-fz-pending .wyn-fz-brush-word {
          color:#30261e;
          font-style:normal;
          -webkit-text-stroke:0;
          text-shadow:none;
        }
        .wyn-fz-pending .wyn-fz-headline strong {
          color:#9b7023;
          font-style:normal;
          filter:none;
          -webkit-text-stroke:0;
          text-shadow:none;
        }
        .wyn-fz-pending .wyn-fz-status {
          color:#282119;
          background:#eec54b;
          transform:none;
          box-shadow:none;
          border-radius:3px;
        }
        .wyn-fz-pending .wyn-fz-pending-copy,
        .wyn-fz-pending .wyn-fz-progress span {
          color:#30261e;
        }
        .wyn-fz-pending .wyn-fz-progress i,
        .wyn-fz-pending .wyn-fz-pending-link {
          color:#594628!important;
        }
        .wyn-fz-pending .wyn-fz-progress {
          border-top-color:rgba(44,34,22,.28);
        }
        @media (prefers-reduced-motion:reduce){.wyn-fz *{transition:none!important;}}
      `}</style>
    </section>
  );
}
