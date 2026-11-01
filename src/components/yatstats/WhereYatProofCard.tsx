'use client';

import PlayerCardBackHero from './PlayerCardBackHero';
import type { Crop } from '@/lib/contribute';
import type { CSSProperties } from 'react';
import { WHERE_YAT_MEMORY_MAX_CHARS } from '@/lib/whereYatPrompts';
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
  storyPrompt?:string;
  photoUrl?: string | null;
  logoUrl?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessPublic?: boolean;
  businesses?: Array<{name:string;website:string;logoUrl?:string}>;
  businessHeadshotUrl?:string|null;
  /** Unpublished image selected in the single retired-card drawer. */
  heroPreviewUrl?: string | null;
  heroCrop?: Crop | null;
  businessHeadshotCrop?: Crop | null;
  memoryPhotoCrop?: Crop | null;
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

const css = "\n  .wyn-card {box-sizing:border-box;position:relative;container-type:inline-size;aspect-ratio:5 / 7;width:100%;max-width:100%;overflow:hidden;background-color:#cfc6b8;background-image:repeating-linear-gradient(0deg,transparent 0,transparent 19px,rgba(75,55,35,.055) 20px),repeating-linear-gradient(90deg,transparent 0,transparent 19px,rgba(75,55,35,.045) 20px);}\n  .wyn-card-frame {height:calc(100% - 2.2cqi);margin:1.1cqi;display:flex;flex-direction:column;border:clamp(1px,.6cqi,3px) solid rgba(34,27,19,.72);border-radius:3px;overflow:hidden;min-height:0;}\n  .wyn-card .yat-back-hero{display:block;position:relative;flex:none;height:36cqi;max-height:31%;width:100%;overflow:hidden;text-decoration:none;background:#35312c;}\n  .wyn-card .yat-back-img{position:absolute;inset:0;height:100%;width:100%;object-fit:cover;object-position:top center;display:block;}\n  .wyn-card .yat-back-hero-fallback{position:absolute;inset:0;background:#534c45;z-index:-1;}\n  .wyn-card .yat-back-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.3) 55%,transparent 85%);}\n  .wyn-card .yat-back-meta{position:absolute;top:0;left:0;z-index:3;padding:clamp(6px,2.1cqi,13px);}\n  .wyn-card .ybm-name{font:800 clamp(16px,5.4cqi,31px)/1 'Bebas Neue',Oswald,sans-serif;color:white;text-transform:uppercase;letter-spacing:.045em;text-shadow:0 1px 4px #000;}\n  .wyn-card .ybm-pos{font:600 clamp(8px,2.8cqi,15px)/1.4 Oswald,sans-serif;color:white;letter-spacing:.06em;}\n  .wyn-card .ybm-team,.wyn-card .ybm-org,.wyn-card .ybm-bthw{display:none;}\n  .wyn-body{box-sizing:border-box;display:flex;flex-direction:column;flex:1;height:100%;min-height:0;min-width:0;overflow:hidden;color:#221a12;font-family:Archivo,Arial,sans-serif;background-color:#f0e9dd;background-image:repeating-linear-gradient(0deg,transparent 0,transparent 19px,rgba(81,64,44,.045) 20px),repeating-linear-gradient(90deg,transparent 0,transparent 19px,rgba(81,64,44,.035) 20px);}\n  .wyn-top-half,.wyn-bottom-half{box-sizing:border-box;flex:1 1 50%;min-height:0;min-width:0;position:relative;overflow:hidden;}\n  .wyn-top-half{flex:0 0 43%;display:flex;flex-direction:column;gap:clamp(2px,.8cqi,5px);padding:clamp(5px,1.8cqi,11px);border-bottom:clamp(1px,.5cqi,3px) solid #6a5a49;}\n  .wyn-heading{position:relative;z-index:1;flex:none;color:#403225;font:800 clamp(8px,2.65cqi,15px)/1.1 Oswald,'Arial Narrow',sans-serif;letter-spacing:.055em;border-bottom:1px solid rgba(65,46,28,.35);padding-bottom:clamp(2px,.6cqi,4px);white-space:nowrap;}\n  .wyn-identity{position:relative;z-index:1;flex:none;max-width:100%;min-width:0;}\n  .wyn-identity-has-headshot{padding-right:32%;}\n  .wyn-identity-details p{font:400 clamp(8px,2.55cqi,14px)/1.3 Archivo,Arial,sans-serif;margin:0 0 clamp(1px,.5cqi,4px);overflow-wrap:anywhere;}\n  .wyn-identity-details b{font-weight:800;}\n  .wyn-small-name{font:700 clamp(9px,2.6cqi,15px)/1.15 Oswald,sans-serif;margin:0 0 3px;}\n  .wyn-business-names{position:relative;z-index:1;flex:none;max-width:100%;box-sizing:border-box;color:#241b13;background:rgba(117,102,85,.16);padding:clamp(2px,.7cqi,5px);font:600 clamp(7px,2.1cqi,12px)/1.15 Archivo,Arial,sans-serif;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}\n  .wyn-headshot{position:absolute;right:0;top:clamp(20px,7cqi,40px);bottom:0;width:31%;max-width:31%;height:calc(100% - clamp(20px,7cqi,40px));object-fit:contain;object-position:center bottom;z-index:1;pointer-events:none;}\n  .wyn-top-has-headshot .wyn-business-names{max-width:68%;}\n  .wyn-business-links{box-sizing:border-box;display:grid;grid-template-columns:repeat(var(--wyn-business-link-count,1),minmax(0,1fr));align-items:center;gap:0;margin-top:auto;max-width:100%;width:100%;min-height:0;position:relative;z-index:2;}\n  .wyn-top-has-headshot .wyn-business-links{width:69%;}\n  .wyn-business-list{display:contents;}\n  .wyn-business-list a,.wyn-business-list span{display:flex;align-items:center;justify-content:center;justify-self:center;max-width:100%;min-width:0;text-decoration:none;color:#251b15;}\n  .wyn-business-list img,.wyn-business-logo{display:block;object-fit:contain;box-sizing:border-box;width:auto;max-width:min(100%,clamp(16px,8cqi,55px));height:clamp(16px,7.3cqi,44px);padding:1px;flex:none;}\n  .wyn-business-list .wyn-business-name{font:700 clamp(6px,1.7cqi,10px)/1.1 Archivo,Arial,sans-serif;max-width:14cqi;overflow:hidden;}\n  .wyn-business-logo-link{display:inline-flex;align-items:center;}\n  .wyn-socials{display:contents;}\n  .wyn-social{display:grid;place-items:center;justify-self:center;min-width:0;aspect-ratio:1;text-decoration:none!important;color:#fff!important;background:#333;font-size:clamp(9px,3.7cqi,21px);width:min(100%,clamp(12px,6.2cqi,33px));height:auto;border-radius:50%;box-shadow:0 1px 2px #0003;}\n  .wyn-social i{line-height:1;}\n  .wyn-website{background:#356b40}.wyn-facebook{background:#0866ff}.wyn-instagram{background:linear-gradient(30deg,#f9ce34,#ee2a7b,#6228d7)}.wyn-x{background:#070707}.wyn-linkedin{background:#0a66c2}.wyn-contact{background:#1374cc}.wyn-text{background:#1255a0;}\n  .wyn-bottom-half{flex:1 1 57%;padding:clamp(6px,1.8cqi,11px);display:flex;flex-direction:column;gap:clamp(3px,1cqi,6px);}\n  .wyn-story-prompt{color:#58432f;font:800 clamp(8px,2.55cqi,15px)/1.15 Oswald,'Arial Narrow',sans-serif;letter-spacing:.03em;flex:none;text-transform:uppercase;border-bottom:1px solid rgba(66,47,32,.33);padding-bottom:clamp(2px,.6cqi,4px);}\n  .wyn-memory-content{flex:1;min-height:0;overflow:hidden;position:relative;}\n  .wyn-featured-photo{display:block;float:left;width:32%;aspect-ratio:1;max-height:78%;object-fit:cover;object-position:center top;margin:0 clamp(4px,1cqi,7px) clamp(2px,.6cqi,4px) 0;}\n  .wyn-story{display:block;font:400 clamp(8px,2.5cqi,14px)/1.32 Archivo,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;}\n  .wyn-more{position:absolute;bottom:0;right:0;background:#f0e9ddcc;color:#493322!important;text-decoration:underline;font:700 clamp(7px,1.8cqi,11px)/1.3 Archivo,Arial,sans-serif;padding:2px;}\n  .wyn-footer{flex:none;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));min-height:11cqi;border-top:clamp(1px,.5cqi,3px) solid rgba(30,22,14,.35);background:rgba(30,22,14,.06);}\n  .wyn-footer-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;padding:clamp(1px,.5cqi,4px) 0;gap:clamp(1px,.4cqi,3px);border-right:1px solid rgba(30,22,14,.1);color:#51483f;text-align:center;}\n  .wyn-footer-tab:first-child{color:#14110d;border-top:clamp(1px,.5cqi,3px) solid #14110d;}\n  .wyn-footer-tab i{font-size:clamp(10px,4cqi,21px);line-height:1;}\n  .wyn-footer-tab span{font:700 clamp(6px,1.9cqi,10px)/1 Oswald,'Arial Narrow',sans-serif;white-space:nowrap;text-transform:uppercase;}\n  .wyn-embedded{container-type:inline-size;box-sizing:border-box;display:flex;flex-direction:column;flex:1;width:100%;height:100%;max-width:100%;min-height:0;overflow:hidden;background:transparent;padding:0;}\n  .wyn-embedded .wyn-body{height:100%;flex:1;padding:0;}\n  .wyn-embedded .wyn-top-half{padding:clamp(4px,1.3cqi,8px);gap:clamp(2px,.55cqi,4px);}\n  .wyn-embedded .wyn-bottom-half{padding:clamp(4px,1.3cqi,8px);}\n  .wyn-embedded .wyn-social{width:min(100%,clamp(12px,5.6cqi,30px));height:auto;font-size:clamp(9px,3.5cqi,18px);}\n";


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
  const businesses=(proof.businesses||[]).slice(0,1).filter(item=>item.name||item.website||item.logoUrl);
  const socialLinks=links.slice().sort((a,b)=>['linkedin','facebook','x','instagram'].indexOf(a.key)-['linkedin','facebook','x','instagram'].indexOf(b.key));
  const publicEmail=showBusiness && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proof.businessEmail||'') ? String(proof.businessEmail).trim() : '';
  const publicPhone=showBusiness ? String(proof.businessPhone||'').replace(/[^0-9+]/g,'') : '';
  const emailHref=publicEmail?'mailto:'+publicEmail:'';
  const textHref=publicPhone.replace(/\D/g,'').length>=10?'sms:'+publicPhone:'';
  const businessNames=businesses.map(item=>item.name).filter(Boolean).join(' | ')||proof.company||'';
  const businessLogos=businesses.filter(item=>item.logoUrl);
  // One grid track per actual link, including the company website logo.
  // Keeping the count dynamic distributes 1-7 controls evenly, even when
  // an alumnus has only some of the social/contact options configured.
  const businessLinkCount=(businessLogos.length>0||proof.logoUrl?1:0)
    +socialLinks.length+(emailHref?1:0)+(textHref?1:0);
  const storyText=proof.story||'Visit the player profile to learn more about life after baseball.';
  // Never silently truncate a submitted memory. New entries have a clear authoring limit.
  const hasMore=storyText.length>WHERE_YAT_MEMORY_MAX_CHARS;
  const portrait=showBusiness ? proof.businessHeadshotUrl : null;
  const heroCrop=proof.heroPreviewUrl ? proof.heroCrop : null;
  const headshotCrop=proof.businessHeadshotUrl&&proof.businessHeadshotCrop;
  const memoryCrop=proof.photoUrl&&proof.memoryPhotoCrop;
  const heroStyle=heroCrop ? {
    '--wyn-hero-left': (-heroCrop.x / Math.max(0.001,heroCrop.w) * 100) + '%',
    '--wyn-hero-top': (-heroCrop.y / Math.max(0.001,heroCrop.h) * 100) + '%',
    '--wyn-hero-width': (100 / Math.max(0.001,heroCrop.w)) + '%',
    '--wyn-hero-height': (100 / Math.max(0.001,heroCrop.h)) + '%',
  } as CSSProperties : undefined;
  const showBusinessArea=showBusiness && (businessNames||proof.logoUrl||businessLogos.length>0||businessHref||socialLinks.length>0||emailHref||textHref);
  const body = (
    <div className="wyn-body">
      <div className={'wyn-top-half'+(portrait?' wyn-top-has-headshot':'')}>
        <div className="wyn-heading">WHERE YAT NOW?</div>
        <div className={'wyn-identity'+(portrait?' wyn-identity-has-headshot':'')}>
          <div className="wyn-identity-details">
            {showName && <div className="wyn-small-name">{proof.displayName}</div>}
            {location && <p><b>LOCATION:</b> {location}</p>}
            {proof.occupation && <p><b>NOW:</b> {proof.occupation}</p>}
          </div>
        </div>
        {showBusiness && businessNames && <div className="wyn-business-names">{businessNames}</div>}
        {portrait && <img className="wyn-headshot" style={headshotCrop?{objectFit:'cover',objectPosition:`${Math.min(100,Math.max(0,(headshotCrop.x+headshotCrop.w/2)*100))}% ${Math.min(100,Math.max(0,(headshotCrop.y+headshotCrop.h/2)*100))}%`}:undefined} src={portrait} alt={proof.displayName+' business portrait'}/>}
        {showBusinessArea && <div className="wyn-business-links" style={{'--wyn-business-link-count':Math.max(1,businessLinkCount)} as CSSProperties} aria-label="Business logos and contact links">
          {(businessLogos.length>0||proof.logoUrl)&&<div className="wyn-business-list">
            {businessLogos.length>0 ? businessLogos.map((business,i)=>{
              const href=normalizeWhereYatLink('website',business.website||'').url;
              return href
                ? <a href={href} key={i} target="_blank" rel="noopener noreferrer" title={business.name||'Business website'}><img src={business.logoUrl} alt={(business.name||'Business')+' logo'}/></a>
                : <span key={i}><img src={business.logoUrl} alt={(business.name||'Business')+' logo'}/></span>;
            }) : proof.logoUrl && (businessHref
              ? <a className="wyn-business-logo-link" href={businessHref} target="_blank" rel="noopener noreferrer" aria-label="Visit business website"><img className="wyn-business-logo" src={proof.logoUrl} alt={(proof.company||'Business')+' logo'}/></a>
              : <span><img className="wyn-business-logo" src={proof.logoUrl} alt={(proof.company||'Business')+' logo'}/></span>)}
          </div>}
          <div className="wyn-socials" aria-label="Public business contact options">
            
            {socialLinks.map(link=><a key={link.key} className={'wyn-social '+link.className} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}><i className={link.icon} aria-hidden="true"/></a>)}
            {emailHref && <a className="wyn-social wyn-contact" href={emailHref} aria-label="Email business"><i className="ri-mail-line" aria-hidden="true"/></a>}
            {textHref && <a className="wyn-social wyn-text" href={textHref} aria-label="Text business"><i className="ri-message-2-fill" aria-hidden="true"/></a>}
          </div>
        </div>}
      </div>
      <div className="wyn-bottom-half">
        <div className="wyn-story-prompt">{proof.storyPrompt||'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?'}</div>
        <div className="wyn-memory-content">
          {proof.photoUrl && <img className="wyn-featured-photo" style={memoryCrop?{objectFit:'cover',objectPosition:`${Math.min(100,Math.max(0,(memoryCrop.x+memoryCrop.w/2)*100))}% ${Math.min(100,Math.max(0,(memoryCrop.y+memoryCrop.h/2)*100))}%`}:undefined} src={proof.photoUrl} alt="Photo accompanying the selected memory"/>}
          <p className="wyn-story">{storyText}</p>
          
        </div>
      </div>
    </div>
  );

  if (variant === 'content') {
    return <div className="wyn-embedded">{body}<style>{css}</style></div>;
  }

  return (
    <div className={'wyn-card'+(heroCrop?' wyn-new-hero':'')} style={heroStyle} aria-label={'5 by 7 retired alumni card proof for ' + proof.displayName}>
      <div className="wyn-card-frame">
        {proof.playerId
          ? <PlayerCardBackHero playerId={proof.playerId} displayName={proof.displayName}
              profileHref={profileHref} teamName="" orgConf=""
              posLevelStatus={[proof.position, 'RETIRED'].filter(Boolean).join(' - ')} btHw="" previewImageUrl={proof.heroPreviewUrl||null} />
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
      <style>{`.wyn-card.wyn-new-hero .yat-back-hero .yat-back-img{left:var(--wyn-hero-left)!important;top:var(--wyn-hero-top)!important;width:var(--wyn-hero-width)!important;height:var(--wyn-hero-height)!important;max-width:none!important;max-height:none!important;object-fit:fill!important;}`}</style>
    </div>
  );
}
