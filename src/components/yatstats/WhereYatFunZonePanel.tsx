'use client';

// These two approved artwork files live in /public; use them directly rather
// than reconstructing the designer's lettering, colors and CTA with CSS.
// This is ONLY the content pane of the back of the flip card: the real player
// hero above and the six working FunZone tabs below remain untouched.
import WhereYatProofCard, { type WhereYatProof } from './WhereYatProofCard';
import {openContribute} from '@/lib/contribute';

export type WhereYatFunZoneState = 'unclaimed' | 'pending' | 'approved';

const LOGO = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png';
const CLAIM_PROFILE_ART = '/img/where-yat-now/claim-profile.png';
const WAITING_APPROVAL_ART = '/img/where-yat-now/waiting-approval.png';

export default function WhereYatFunZonePanel({
  state, firstName, profileHref, proof, playerId, hsid, schoolName, displayName,
}: {
  state: WhereYatFunZoneState;
  firstName: string;
  profileHref: string;
  proof?: WhereYatProof | null;
  playerId?:string;hsid?:string;schoolName?:string;displayName?:string;
}) {
  const art = state === 'unclaimed'
    ? { src: CLAIM_PROFILE_ART, alt: 'Where YAT Now? Life after baseball is part of the story. Claim your profile.', link: 'Claim your retired alumni profile and complete the questionnaire' }
    : { src: WAITING_APPROVAL_ART, alt: 'Where YAT Now? Your questionnaire was received and is waiting for approval.', link: 'View the status of your retired alumni questionnaire' };

  return (
    <section className={`wyn-fz wyn-fz-${state}`} aria-label="Where YAT Now? alumni card">
      {state !== 'approved' ? (
        // Both source graphics already contain their copy and call to action.
        // Make the whole graphic one usable link; no duplicate styled CTA or
        // transparent text placed on top of the artwork.
        <a href={profileHref} className="wyn-fz-graphic" aria-label={art.link} onClick={e=>{if(state==='unclaimed'&&playerId&&hsid){e.preventDefault();openContribute({tab:'retired_card',player:{playerId,displayName:displayName||firstName,schoolId:hsid,schoolName:schoolName||''}})}}}>
          <img src={art.src} alt={art.alt} decoding="async" loading="eager" />
        </a>
      ) : proof ? (
        <>
          <div className="wyn-fz-brand">
            <img src={LOGO} alt="YAT?STATS" loading="lazy" />
            <span>WHERE YAT NOW?</span>
          </div>
          <div className="wyn-fz-approved-content">
            <WhereYatProofCard variant="content" showName={false} proof={proof} />
          </div>
          <a className="wyn-fz-action" href={profileHref}>
            READ MORE ABOUT {firstName.toUpperCase()}’S LIFE AFTER HIGH SCHOOL
            <i className="ri-arrow-right-s-line" aria-hidden="true" />
          </a>
        </>
      ) : null}

      <style>{`
        .wyn-fz {
          display:flex; flex-direction:column; width:100%; height:100%; min-height:0;
          box-sizing:border-box; overflow:hidden; position:relative; isolation:isolate;
          padding:clamp(5px,2.3cqi,13px) clamp(6px,2.5cqi,14px);
          background-color:#dfd5c3;
          background-image:repeating-linear-gradient(170deg,transparent 0,transparent 5px,rgba(97,66,41,.045) 5px,rgba(97,66,41,.045) 6px),linear-gradient(135deg,#faf2df 0%,#ddd0ba 100%);
          color:#151d2c; container-type:inline-size;
        }
        .wyn-fz-unclaimed,.wyn-fz-pending {
          padding:0; background:#f1e8d8; background-image:none;
        }
        .wyn-fz-graphic {
          display:flex; align-items:stretch; justify-content:center;
          flex:1; min-height:0; min-width:0; width:100%; height:100%;
          overflow:hidden; text-decoration:none; background:#f1e8d8;
        }
        .wyn-fz-graphic img {
          display:block; width:100%; height:100%;
          object-fit:contain; object-position:center center;
        }
        .wyn-fz-graphic:focus-visible {
          outline:3px solid #d6a725; outline-offset:-4px;
        }
        .wyn-fz-brand {
          display:flex; justify-content:space-between; align-items:center;
          min-height:0; flex:0 0 auto; padding:0 1%; gap:6px;
          border-bottom:clamp(1px,.4cqi,2px) solid rgba(30,22,14,.35);
        }
        .wyn-fz-brand img {
          display:block; width:auto; height:clamp(12px,6cqi,26px);
          max-width:75%; object-fit:contain;
        }
        .wyn-fz-brand span {
          color:#30261d; font:700 clamp(8px,3cqi,14px)/1 Oswald,sans-serif;
          letter-spacing:.02em; white-space:nowrap;
        }
        .wyn-fz-approved .wyn-fz-brand {margin-bottom:clamp(4px,1.4cqi,9px);}
        .wyn-fz-approved-content {
          display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;
        }
        .wyn-fz-approved-content .wyn-embedded {
          display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;
        }
        .wyn-fz-approved-content .wyn-body {
          height:100%; min-height:0; overflow:hidden; padding:0;
          gap:clamp(2px,.7cqi,5px);
        }
        .wyn-fz-approved-content .wyn-heading {display:block;color:#201a13;font:900 clamp(12px,4cqi,21px)/1.05 Oswald,'Arial Narrow',sans-serif;letter-spacing:.015em;text-shadow:1px 1px 0 #fff,-1px -1px 0 #fff;border-bottom:1px solid rgba(65,46,28,.35);}
        .wyn-fz-approved-content .wyn-identity {flex-shrink:0;}
        .wyn-fz-approved-content .wyn-identity p {font-size:clamp(7px,2.3cqi,12px);}
        .wyn-fz-approved-content .wyn-story {flex:1;min-height:0;font-size:clamp(8px,2.5cqi,13px);line-height:1.28;}
        .wyn-fz-approved-content .wyn-socials {padding-top:clamp(2px,.6cqi,5px);}
        .wyn-fz-action {
          display:flex; align-items:center; justify-content:center;
          box-sizing:border-box; width:100%; flex:none; min-width:0;
          text-align:center; text-decoration:none!important;
          margin:clamp(4px,1.2cqi,8px) auto 0;
          background:linear-gradient(#ffe360 0%,#ffcd21 45%,#e9a519 100%);
          border:clamp(1px,.5cqi,3px) solid #694510;
          border-radius:clamp(3px,1.4cqi,8px);
          box-shadow:0 2px 2px #1b110c88,inset 0 1px 0 #fff5a7;
          color:#08213a!important; text-transform:uppercase;
          font:900 clamp(9px,2.8cqi,14px)/1.05 Oswald,sans-serif;
          padding:clamp(5px,1.3cqi,9px) clamp(3px,1cqi,7px);
          gap:clamp(2px,1cqi,6px);
        }
        .wyn-fz-action i {font-size:1.45em;line-height:.8;flex:none;}
        @media(prefers-reduced-motion:reduce){.wyn-fz *{transition:none!important;}}
      `}</style>
    </section>
  );
}
