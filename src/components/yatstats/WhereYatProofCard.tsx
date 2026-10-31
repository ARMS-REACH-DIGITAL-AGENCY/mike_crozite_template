'use client';

import PlayerCardBackHero from './PlayerCardBackHero';
import { toSlugFromDisplay } from '@/lib/slug';
import { normalizeWhereYatLink, type WhereYatLinkField } from '@/lib/whereYatLinks';

// The same content is used in the contributor proof, the real flip-card tab,
// and the authenticated saved proof. Only the full proof adds the existing
// player hero and a visual replica of the existing six-tab footer.
export type WhereYatProof = {
  displayName: string;
  playerId?: string;
  hsid?: string;
  position?: string;
  city?: string;
  state?: string;
  occupation?: string;
  company?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  x?: string;
  story?: string;
  photoUrl?: string | null;
  logoUrl?: string | null;
  businessPublic?: boolean;
  businesses?: Array<{name:string;website:string;logoUrl?:string}>;
  businessHeadshotUrl?:string|null;
};

type Social = { key: WhereYatLinkField; icon: string; label: string; className: string };
const socialItems: Social[] = [
  { key: 'facebook', icon: 'ri-facebook-fill', label: 'Facebook', className: 'wyn-facebook' },
  { key: 'instagram', icon: 'ri-instagram-line', label: 'Instagram', className: 'wyn-instagram' },
  { key: 'x', icon: 'ri-twitter-x-line', label: 'X', className: 'wyn-x' },
  { key: 'linkedin', icon: 'ri-linkedin-fill', label: 'LinkedIn', className: 'wyn-linkedin' },
];
const footerTabs = [
  ['ri-calendar-line', 'YAT?'],
  ['ri-bar-chart-2-line', 'STATS'],
  ['ri-newspaper-line', 'NEWS'],
  ['ri-share-line', 'SOCIAL'],
  ['ri-group-line', 'CONNECT'],
  ['ri-upload-cloud-line', 'STORIES'],
] as const;

const css = `
  .wyn-card { box-sizing:border-box; position:relative; container-type:inline-size; aspect-ratio:5 / 7;
    width:100%; max-width:100%; background-color:#c2b9ae; overflow:hidden;
    background-image:repeating-linear-gradient(168deg,transparent 0px,transparent 3px,rgba(255,255,255,.05) 3px,rgba(255,255,255,.05) 4px),
    repeating-linear-gradient(78deg,transparent 0px,transparent 5px,rgba(0,0,0,.04) 5px,rgba(0,0,0,.04) 6px); }
  .wyn-card-frame { height:calc(100% - 2.2cqi); margin:1.1cqi; display:flex; flex-direction:column;
    border:clamp(1px,.6cqi,3px) solid rgba(30,22,14,.65); border-radius:clamp(2px,.8cqi,5px);
    overflow:hidden; min-height:0; }
  .wyn-card .yat-back-hero { display:block; position:relative; flex:none; height:36cqi; max-height:31%;
    width:100%; overflow:hidden; text-decoration:none; background:#35312c; }
  .wyn-card .yat-back-img {position:absolute; inset:0; height:100%; width:100%; object-fit:cover; object-position:top center; display:block;}
  .wyn-card .yat-back-hero-fallback {position:absolute; inset:0; background:#534c45; z-index:-1;}
  .wyn-card .yat-back-scrim { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.30) 55%,transparent 85%); }
  .wyn-card .yat-back-meta {position:absolute; top:0; left:0; z-index:3; padding:clamp(6px,2.1cqi,13px); }
  .wyn-card .ybm-name {font:800 clamp(16px,5.4cqi,31px)/1 'Bebas Neue',Oswald,sans-serif; color:white; text-transform:uppercase; letter-spacing:.045em; text-shadow:0 1px 4px #000;}
  .wyn-card .ybm-pos {font:600 clamp(8px,2.8cqi,15px)/1.4 Oswald,sans-serif; color:white; letter-spacing:.06em;}
  .wyn-card .ybm-team,.wyn-card .ybm-org,.wyn-card .ybm-bthw {display:none;}
  .wyn-body {box-sizing:border-box; display:flex; flex-direction:column; min-height:0;
    height:100%; flex:1; overflow:hidden; color:#1e160e; font-family:Archivo,Arial,sans-serif;
    padding:clamp(5px,2.2cqi,13px); gap:clamp(3px,1.1cqi,7px);
    background-image:repeating-linear-gradient(0deg,transparent 0,transparent 21px,rgba(70,56,39,.025) 22px); }
  .wyn-heading {font:600 clamp(7px,2.4cqi,13px)/1.25 Oswald,'Arial Narrow',sans-serif;
    letter-spacing:.08em; color:#4f4031; border-bottom:1px solid rgba(30,22,14,.15);
    padding-bottom:clamp(3px,.8cqi,6px); flex:none;}
  .wyn-identity {display:flex; align-items:flex-start; gap:clamp(5px,1.5cqi,12px); flex:none; min-width:0;}
  .wyn-identity-details {min-width:0; flex:1;}
  .wyn-identity p {font:400 clamp(8px,2.5cqi,14px)/1.28 Archivo,Arial,sans-serif;
    margin:0 0 clamp(2px,.7cqi,5px); overflow-wrap:anywhere;}
  .wyn-identity b {font-weight:800;}
  .wyn-small-name {font:700 clamp(9px,2.8cqi,15px)/1.15 Oswald,'Arial Narrow',sans-serif;
    margin:0 0 clamp(3px,1cqi,6px); }
  .wyn-photo {flex:0 0 32%; width:32%; max-height:31cqi; object-fit:contain; border:1px solid rgba(30,22,14,.22);
    background:rgba(255,255,255,.2); box-shadow:0 1px 2px #0002;}
  .wyn-no-photo {flex:0 0 30%; width:30%; min-height:14cqi; display:grid; place-items:center;
    text-align:center; border:1px dashed #83796b; font:600 clamp(7px,1.9cqi,10px) Oswald,sans-serif;}
  .wyn-logo-inline {display:inline-block; max-width:28cqi; max-height:11cqi; width:auto; object-fit:contain;
    vertical-align:middle; padding:2px; background:rgba(255,255,255,.4); margin-left:4px;}
  .wyn-story {min-height:0; flex:1; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere;
    font:400 clamp(8px,2.65cqi,14px)/1.35 Archivo,Arial,sans-serif;
    border-top:1px solid rgba(30,22,14,.17); padding-top:clamp(3px,1.2cqi,9px); margin:0;}
  .wyn-socials {flex:none; border-top:1px solid rgba(30,22,14,.16); margin-top:auto; padding-top:clamp(3px,1.2cqi,8px);
    display:flex; flex-wrap:nowrap; align-items:center; justify-content:space-around;
    gap:clamp(2px,1.1cqi,8px);}
  .wyn-social {display:grid; place-items:center; color:#fff!important; text-decoration:none!important;
    font-size:clamp(10px,5.2cqi,26px); width:clamp(19px,8.6cqi,45px); height:clamp(19px,8.6cqi,45px);
    border-radius:50%; box-shadow:0 1px 2px #0003; flex:none; }
  .wyn-social i {line-height:1;}
  .wyn-facebook {background:#0866ff;} .wyn-instagram {background:linear-gradient(30deg,#f9ce34,#ee2a7b,#6228d7);}
  .wyn-x {background:#070707;} .wyn-linkedin {background:#0a66c2;}
  .wyn-contact {background:#1374cc;}
  .wyn-website {background:#356b40;}
  .wyn-business-links {display:flex;flex-direction:column;align-items:center;gap:clamp(3px,.8cqi,6px);flex:none;border-top:1px solid rgba(30,22,14,.16);padding-top:clamp(3px,.8cqi,6px);}
  .wyn-business-logo {max-width:36cqi;max-height:11cqi;object-fit:contain;background:rgba(255,255,255,.6);border-radius:3px;padding:2px;}
  .wyn-business-name {font:700 clamp(7px,2.2cqi,11px)/1.2 Archivo,Arial,sans-serif;text-align:center;overflow-wrap:anywhere;}
  .wyn-business-links .wyn-socials {border:0;margin:0;padding:0;width:100%;}
  .wyn-embedded .wyn-identity {display:none;}
  .wyn-embedded .wyn-body {background:transparent;}
  .wyn-embedded .wyn-story {border-top:0;padding-top:0;}
  .wyn-footer {flex:none; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); min-height:11cqi;
    border-top:clamp(1px,.5cqi,3px) solid rgba(30,22,14,.35); background:rgba(30,22,14,.06);}
  .wyn-footer-tab {display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0;
    padding:clamp(1px,.5cqi,4px) 0; gap:clamp(1px,.4cqi,3px); border-right:1px solid rgba(30,22,14,.1);
    color:#51483f; text-align:center;}
  .wyn-footer-tab:first-child {color:#14110d; border-top:clamp(1px,.5cqi,3px) solid #14110d;}
  .wyn-footer-tab i {font-size:clamp(10px,4cqi,21px); line-height:1;}
  .wyn-footer-tab span {font:700 clamp(6px,1.9cqi,10px)/1 Oswald,'Arial Narrow',sans-serif;
    white-space:nowrap; text-transform:uppercase;}
  .wyn-embedded {container-type:inline-size; width:100%; max-width:100%; min-height:0;
    background:transparent; padding:0;}
  .wyn-embedded .wyn-body {background:transparent; padding:0; gap:clamp(2px,.8cqi,5px);}
  .wyn-embedded .wyn-heading {font-size:clamp(6px,2.1cqi,10px);}
  .wyn-embedded .wyn-identity p {font-size:clamp(7px,2.1cqi,11px);}
  .wyn-embedded .wyn-story {font-size:clamp(7px,2.25cqi,11px); line-height:1.25;}
  .wyn-story-prompt{font:800 clamp(7px,2.1cqi,11px)/1.2 Oswald,Arial,sans-serif;color:#5a4830;letter-spacing:.03em;}
  .wyn-business-list{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:5px;width:100%;}
  .wyn-business-list a{display:flex;align-items:center;gap:4px;color:#30261e;text-decoration:none;font-size:clamp(7px,2.1cqi,11px);}
  .wyn-business-list img{width:clamp(22px,7cqi,36px);height:clamp(22px,7cqi,36px);object-fit:contain;}
  .wyn-embedded .wyn-photo {max-height:25cqi;}
  .wyn-embedded .wyn-social {width:clamp(18px,7cqi,34px);height:clamp(18px,7cqi,34px);font-size:clamp(10px,4cqi,19px);}
`;

export default function WhereYatProofCard({
  proof, showName = false, variant = 'content',
}: { proof: WhereYatProof; showName?: boolean; variant?: 'full' | 'content' }) {
  const location = [proof.city, proof.state].filter(Boolean).join(', ');
  const profileHref = proof.playerId && proof.hsid
    ? `/${proof.hsid}/player/${proof.playerId}/${toSlugFromDisplay(proof.displayName)}`
    : '#sec-alltime';
  const businessHref = normalizeWhereYatLink('website', proof.website || '').url;
  const links = socialItems.map(item => {
    const raw = proof[item.key] || '';
    const normalized = normalizeWhereYatLink(item.key, raw);
    return normalized.url ? { ...item, href: normalized.url } : null;
  }).filter((item): item is Social & { href: string } => !!item);
  const showBusiness = proof.businessPublic !== false;
  const businesses=(proof.businesses||[]).slice(0,4).filter(b=>b.name||b.website||b.logoUrl);
  // A fixed 5:7 card cannot contain an unbounded biography. Render a clearly
  // labeled excerpt rather than silently cutting text at an arbitrary line.
  const storyText=proof.story||'Visit the player profile to learn more about life after baseball.';
  const excerpt=storyText.length>280?storyText.slice(0,277).trimEnd()+'…':storyText;
  const businessLinks = showBusiness ? links : [];
  const body = (
    <div className="wyn-body">
      <div className="wyn-heading">YAT?STATS / WHERE YAT NOW?</div>
      <div className="wyn-identity">
        <div className="wyn-identity-details">
          {showName && <div className="wyn-small-name">{proof.displayName}</div>}
          {location && <p><b>LOCATION:</b> {location}</p>}
          {proof.occupation && <p><b>NOW:</b> {proof.occupation}</p>}
        </div>
        {proof.photoUrl && <img className="wyn-photo" src={proof.photoUrl} alt="Alumnus's recent photo" />}
      </div>
      <div className="wyn-story-prompt">WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?</div>
      <p className="wyn-story">{excerpt}</p>
      {showBusiness && (proof.company || proof.logoUrl || businessHref || businessLinks.length > 0 || businesses.length > 0 || proof.businessHeadshotUrl) && (
        <div className="wyn-business-links" aria-label="Business information and links">
          {businesses.length>0&&<div className="wyn-business-list">{businesses.map((b,i)=>{const href=normalizeWhereYatLink('website',b.website||'').url;return href?<a key={i} href={href} target="_blank" rel="noopener noreferrer">{b.logoUrl&&<img src={b.logoUrl} alt={b.name+' logo'}/>}<span>{b.name}</span></a>:<span key={i}>{b.name}</span>})}</div>}
          {proof.businessHeadshotUrl&&<img className="wyn-business-logo" src={proof.businessHeadshotUrl} alt="Business headshot"/>}
          {proof.logoUrl && (businessHref
            ? <a href={businessHref} target="_blank" rel="noopener noreferrer" aria-label="Visit business website"><img className="wyn-business-logo" src={proof.logoUrl} alt={proof.company ? proof.company + ' logo' : 'Business logo'} /></a>
            : <img className="wyn-business-logo" src={proof.logoUrl} alt={proof.company ? proof.company + ' logo' : 'Business logo'} />)}
          {proof.company && <div className="wyn-business-name">{proof.company}</div>}
          {(businessHref || businessLinks.length > 0) && <div className="wyn-socials">
            {businessHref && <a className="wyn-social wyn-website" href={businessHref} target="_blank" rel="noopener noreferrer" aria-label="Business website"><i className="ri-global-line" aria-hidden="true" /></a>}
            {businessLinks.map(link => <a key={link.key} className={'wyn-social ' + link.className} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}><i className={link.icon} aria-hidden="true" /></a>)}
          </div>}
        </div>
      )}
    </div>
  );

  if (variant === 'content') {
    return <div className="wyn-embedded">{body}<style>{css}</style></div>;
  }

  return (
    <div className="wyn-card" aria-label={'5 by 7 retired alumni card proof for ' + proof.displayName}>
      <div className="wyn-card-frame">
        {proof.playerId
          ? <PlayerCardBackHero playerId={proof.playerId} displayName={proof.displayName}
              profileHref={profileHref} teamName="" orgConf=""
              posLevelStatus={[proof.position, 'RETIRED'].filter(Boolean).join(' - ')} btHw="" />
          : <div className="yat-back-hero"><div className="yat-back-meta"><div className="ybm-name">{proof.displayName}</div>
              <div className="ybm-pos">RETIRED</div></div></div>}
        {body}
        <div className="wyn-footer" aria-label="Visual preview of the flip-card tabs">
          {footerTabs.map(([icon,label]) => <div className="wyn-footer-tab" key={label}>
            <i className={icon} aria-hidden="true" /><span>{label}</span>
          </div>)}
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}
