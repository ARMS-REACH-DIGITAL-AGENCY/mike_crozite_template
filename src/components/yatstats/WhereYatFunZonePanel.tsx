'use client';

// These two approved artwork files live in /public; use them directly rather
// than reconstructing the designer's lettering, colors and CTA with CSS.
// This is ONLY the content pane of the back of the flip card: the real player
// hero above and the six working FunZone tabs below remain untouched.
import WhereYatProofCard, { type WhereYatProof } from './WhereYatProofCard';
import {openContribute} from '@/lib/contribute';

export type WhereYatFunZoneState = 'unclaimed' | 'pending' | 'approved';

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
          <div className="wyn-fz-approved-content">
            <WhereYatProofCard variant="content" showName={false} proof={proof} />
          </div>
          <a className="wyn-proof-cta" href={profileHref}>
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
        .wyn-fz-approved {padding:0;background:#f0e9dd;background-image:none;}
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
        .wyn-fz-approved-content {
          display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;
        }
        .wyn-fz-approved-content .wyn-embedded {
          display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;
        }
        @media(prefers-reduced-motion:reduce){.wyn-fz *{transition:none!important;}}
      `}</style>
    </section>
  );
}
